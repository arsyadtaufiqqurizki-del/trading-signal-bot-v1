'use strict';

const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const { getKlines } = require('./binance');
const { calcEMA } = require('./indicators');
const { fmt, pct, nowWIB } = require('./utils');

// ─── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  _cache.delete(key);
  const val = await fn();
  if (val != null) _cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MACRO_SYMBOLS = {
  DXY:   { ticker: 'DX-Y.NYB', name: 'Dollar Index (DXY)',    inverse: true  },  // DXY ↑ → BTC ↓
  GOLD:  { ticker: 'GC=F',     name: 'Gold Futures',          inverse: false },  // Gold ↑ → risk-off
  SPX:   { ticker: 'ES=F',     name: 'S&P 500 Futures',       inverse: false },  // SPX ↑ → risk-on
  YIELD: { ticker: '^TNX',     name: '10Y Treasury Yield',    inverse: true  },  // Yield ↑ → BTC ↓
};

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const HISTORY_DAYS = 30;

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchMacroHistory(ticker, days = HISTORY_DAYS) {
  return cached(`macro_hist_${ticker}_${days}`, CACHE_TTL, async () => {
    try {
      const end   = new Date();
      const start = new Date(Date.now() - days * 86_400_000);
      const rows  = await yf.historical(ticker, { period1: start, period2: end, interval: '1d' });
      return rows.map(r => ({ date: r.date, close: r.close }));
    } catch (e) {
      console.error(`Error fetching macro history for ${ticker}:`, e.message);
      return null;
    }
  });
}

async function fetchBtcHistory(days = HISTORY_DAYS) {
  return cached(`macro_btc_hist_${days}`, CACHE_TTL, async () => {
    try {
      const klines = await getKlines('BTCUSDT', '1d', days);
      return klines.map(k => ({ date: new Date(k.openTime), close: k.close }));
    } catch (e) {
      console.error('Error fetching BTC history:', e.message);
      return null;
    }
  });
}

async function fetchMacroQuote(ticker) {
  return cached(`macro_quote_${ticker}`, 5 * 60_000, async () => {
    try {
      const q = await yf.quote(ticker);
      return {
        price:     q.regularMarketPrice,
        change:    q.regularMarketChangePercent,
        prevClose: q.regularMarketPreviousClose,
      };
    } catch { return null; }
  });
}

// ─── Correlation ──────────────────────────────────────────────────────────────

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;

  const xs = x.slice(-n);
  const ys = y.slice(-n);

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num  += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

function calcTrend(closes, shortPeriod = 7, longPeriod = 20) {
  if (!closes || closes.length < longPeriod) return 'NEUTRAL';
  const emaShort = calcEMA(closes, shortPeriod);
  const emaLong  = calcEMA(closes, longPeriod);
  const lastShort = emaShort[emaShort.length - 1];
  const lastLong  = emaLong[emaLong.length - 1];

  if (lastShort > lastLong * 1.005) return 'BULLISH';
  if (lastShort < lastLong * 0.995) return 'BEARISH';
  return 'NEUTRAL';
}

function calcMomentum(closes, period = 5) {
  if (!closes || closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const prev    = closes[closes.length - 1 - period];
  return ((current - prev) / prev) * 100;
}

// ─── Macro Analysis ───────────────────────────────────────────────────────────

async function getMacroData() {
  return cached('macro_data_full', CACHE_TTL, async () => {
    try {
      const [dxyHist, goldHist, spxHist, yieldHist, btcHist] = await Promise.all([
        fetchMacroHistory(MACRO_SYMBOLS.DXY.ticker),
        fetchMacroHistory(MACRO_SYMBOLS.GOLD.ticker),
        fetchMacroHistory(MACRO_SYMBOLS.SPX.ticker),
        fetchMacroHistory(MACRO_SYMBOLS.YIELD.ticker),
        fetchBtcHistory(),
      ]);

      if (!btcHist) return null;

      const btcCloses = btcHist.map(h => h.close);

      const assets = {};
      for (const [key, config] of Object.entries(MACRO_SYMBOLS)) {
        const hist = key === 'DXY' ? dxyHist : key === 'GOLD' ? goldHist : key === 'SPX' ? spxHist : yieldHist;
        if (!hist) {
          assets[key] = { ...config, closes: [], trend: 'NEUTRAL', momentum: 0, correlation: null };
          continue;
        }

        const closes = hist.map(h => h.close);
        const trend  = calcTrend(closes);
        const momentum = calcMomentum(closes);

        // Align series for correlation (use min length)
        const minLen = Math.min(closes.length, btcCloses.length);
        const correlation = pearsonCorrelation(
          closes.slice(-minLen),
          btcCloses.slice(-minLen)
        );

        assets[key] = { ...config, closes, trend, momentum, correlation };
      }

      return { assets, btcCloses, timestamp: Date.now() };
    } catch (e) {
      console.error('Error in getMacroData:', e.message);
      return null;
    }
  });
}

function getMacroBias(macroData) {
  if (!macroData || !macroData.assets) return { longScore: 0, shortScore: 0, factors: [] };

  let longScore = 0, shortScore = 0;
  const factors = [];

  const { DXY, GOLD, SPX, YIELD } = macroData.assets;

  // DXY: Dollar Index — inverse correlation with BTC
  if (DXY.trend === 'BEARISH') {
    longScore += 2;
    factors.push('DXY Bearish → BTC Bullish ✅');
  } else if (DXY.trend === 'BULLISH') {
    shortScore += 2;
    factors.push('DXY Bullish → BTC Bearish ⚠️');
  }

  // Gold: risk-off indicator
  if (GOLD.trend === 'BULLISH') {
    shortScore += 1;
    factors.push('Gold Bullish → Risk-Off Sentiment 📉');
  } else if (GOLD.trend === 'BEARISH') {
    longScore += 1;
    factors.push('Gold Bearish → Risk-On Sentiment 📈');
  }

  // S&P 500: risk appetite
  if (SPX.trend === 'BULLISH') {
    longScore += 1;
    factors.push('S&P500 Bullish → Risk-On ✅');
  } else if (SPX.trend === 'BEARISH') {
    shortScore += 1;
    factors.push('S&P500 Bearish → Risk-Off ⚠️');
  }

  // 10Y Yield: higher yield pressures risk assets
  if (YIELD.trend === 'BULLISH') {
    shortScore += 1;
    factors.push('10Y Yield Rising → Risk Asset Pressure 📉');
  } else if (YIELD.trend === 'BEARISH') {
    longScore += 1;
    factors.push('10Y Yield Falling → Risk Asset Support 📈');
  }

  // Divergence detection: BTC vs DXY both rising/falling
  const btcMomentum = calcMomentum(macroData.btcCloses);
  if (btcMomentum > 2 && DXY.momentum > 2) {
    shortScore += 1;
    factors.push('⚠️ Divergence: BTC ↑ + DXY ↑ — Warning!');
  } else if (btcMomentum < -2 && DXY.momentum < -2) {
    longScore += 1;
    factors.push('⚠️ Divergence: BTC ↓ + DXY ↓ — Potential Reversal');
  }

  // Gold vs BTC divergence
  if (btcMomentum > 2 && GOLD.momentum > 2) {
    shortScore += 1;
    factors.push('⚠️ Divergence: BTC ↑ + Gold ↑ — Risk-Off Clash');
  }

  return { longScore, shortScore, factors };
}

function detectDivergences(macroData) {
  if (!macroData || !macroData.assets) return [];

  const divergences = [];
  const btcMomentum = calcMomentum(macroData.btcCloses);

  for (const [key, asset] of Object.entries(macroData.assets)) {
    if (asset.momentum === 0) continue;

    // Strong divergence: both moving same direction (against typical correlation)
    if (asset.inverse && btcMomentum > 2 && asset.momentum > 2) {
      divergences.push({
        type: 'WARNING',
        asset: asset.name,
        message: `${asset.name} naik ${pct(asset.momentum)} bersamaan BTC naik ${pct(btcMomentum)} — Divergence!`,
        severity: 'HIGH',
      });
    } else if (asset.inverse && btcMomentum < -2 && asset.momentum < -2) {
      divergences.push({
        type: 'REVERSAL',
        asset: asset.name,
        message: `${asset.name} turun ${pct(asset.momentum)} bersamaan BTC turun ${pct(btcMomentum)} — Potential Reversal`,
        severity: 'MEDIUM',
      });
    }

    // Normal correlation break: non-inverse assets moving opposite to BTC
    if (!asset.inverse && btcMomentum > 2 && asset.momentum < -2) {
      divergences.push({
        type: 'WARNING',
        asset: asset.name,
        message: `${asset.name} turun ${pct(asset.momentum)} saat BTC naik ${pct(btcMomentum)} — Weakness!`,
        severity: 'MEDIUM',
      });
    }
  }

  return divergences;
}

// ─── Report Builders ──────────────────────────────────────────────────────────

async function getMacroSnapshot() {
  const macroData = await getMacroData();
  if (!macroData) return '❌ Gagal mengambil data makro.';

  const { assets } = macroData;
  const bias = getMacroBias(macroData);
  const divergences = detectDivergences(macroData);

  let msg = `📊 <b>CROSS-MARKET SNAPSHOT</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${nowWIB()}\n\n`;

  for (const [key, asset] of Object.entries(assets)) {
    const trendEmoji = asset.trend === 'BULLISH' ? '📈' : asset.trend === 'BEARISH' ? '📉' : '➡️';
    const corrStr = asset.correlation !== null ? `r=${fmt(asset.correlation, 2)}` : 'N/A';
    msg += `${trendEmoji} <b>${asset.name}:</b> ${asset.trend} | Mom: ${pct(asset.momentum)} | BTC Corr: ${corrStr}\n`;
  }

  msg += `\n<b>🎯 Macro Bias:</b>\n`;
  if (bias.longScore > bias.shortScore) {
    msg += `  🟢 Bullish (${bias.longScore} vs ${bias.shortScore})\n`;
  } else if (bias.shortScore > bias.longScore) {
    msg += `  🔴 Bearish (${bias.shortScore} vs ${bias.longScore})\n`;
  } else {
    msg += `  ⚖️ Neutral (${bias.longScore} vs ${bias.shortScore})\n`;
  }

  if (bias.factors.length > 0) {
    msg += `\n<b>📋 Factors:</b>\n`;
    bias.factors.forEach(f => { msg += `  • ${f}\n`; });
  }

  if (divergences.length > 0) {
    msg += `\n<b>⚠️ Divergences:</b>\n`;
    divergences.forEach(d => { msg += `  • ${d.message}\n`; });
  }

  return msg;
}

async function getMacroCorrelation() {
  const macroData = await getMacroData();
  if (!macroData) return '❌ Gagal mengambil data makro.';

  const { assets, btcCloses } = macroData;

  let msg = `📊 <b>CORRELATION MATRIX</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📅 ${nowWIB()}\n\n`;

  // Correlation with BTC
  msg += `<b>BTC Correlation (30-day):</b>\n`;
  for (const [key, asset] of Object.entries(assets)) {
    const corr = asset.correlation;
    if (corr === null) {
      msg += `  • ${asset.name}: N/A\n`;
    } else {
      const strength = Math.abs(corr) > 0.7 ? 'Strong' : Math.abs(corr) > 0.4 ? 'Moderate' : 'Weak';
      const direction = corr > 0 ? 'Positive' : 'Negative';
      msg += `  • ${asset.name}: ${fmt(corr, 3)} (${strength} ${direction})\n`;
    }
  }

  // Cross-asset correlations
  msg += `\n<b>Cross-Asset Correlations:</b>\n`;
  const keys = Object.keys(assets);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = assets[keys[i]];
      const b = assets[keys[j]];
      if (a.closes.length === 0 || b.closes.length === 0) continue;
      const minLen = Math.min(a.closes.length, b.closes.length);
      const corr = pearsonCorrelation(a.closes.slice(-minLen), b.closes.slice(-minLen));
      if (corr !== null) {
        msg += `  • ${a.name} vs ${b.name}: ${fmt(corr, 3)}\n`;
      }
    }
  }

  // Trend summary
  msg += `\n<b>Trend Summary:</b>\n`;
  for (const [key, asset] of Object.entries(assets)) {
    const trendEmoji = asset.trend === 'BULLISH' ? '🟢' : asset.trend === 'BEARISH' ? '🔴' : '⚪';
    msg += `  ${trendEmoji} ${asset.name}: ${asset.trend} (${pct(asset.momentum)})\n`;
  }

  return msg;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getMacroData,
  getMacroBias,
  detectDivergences,
  getMacroSnapshot,
  getMacroCorrelation,
  MACRO_SYMBOLS,
};