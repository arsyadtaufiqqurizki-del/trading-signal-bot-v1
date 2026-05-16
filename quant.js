'use strict';

const { getKlines } = require('./binance');
const { calcRSI, calcATR, calcADX, calcEMA, calcMACD, detectDivergence, detectCandlePattern } = require('./indicators');
const { PAIRS } = require('./scanner');
const { nowWIB, fmt } = require('./utils');

function calcROC(closes, period = 14) {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - period];
  return prev === 0 ? 0 : ((current - prev) / prev) * 100;
}

function calcStdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calcSharpe(closes, period = 20) {
  if (closes.length < period + 1) return 0;
  const slice = closes.slice(-period - 1);
  const returns = slice.slice(1).map((c, i) => (c - slice[i]) / slice[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = calcStdDev(returns);
  return std === 0 ? 0 : mean / std;
}

function calcVolRatio(candles, recentN = 5, avgN = 20) {
  if (candles.length < avgN + recentN) return 1;
  const recent = candles.slice(-recentN).reduce((s, c) => s + c.volume, 0) / recentN;
  const avg = candles.slice(-avgN - recentN, -recentN).reduce((s, c) => s + c.volume, 0) / avgN;
  return avg === 0 ? 1 : recent / avg;
}

function calcBtcCorr(closes, btcCloses) {
  const n = Math.min(20, closes.length, btcCloses.length) - 1;
  if (n < 5) return 0;
  const coinRet = [], btcRet = [];
  for (let i = closes.length - n; i < closes.length; i++)
    coinRet.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  for (let i = btcCloses.length - n; i < btcCloses.length; i++)
    btcRet.push((btcCloses[i] - btcCloses[i - 1]) / btcCloses[i - 1]);
  const meanC = coinRet.reduce((a, b) => a + b, 0) / n;
  const meanB = btcRet.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varC = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dc = coinRet[i] - meanC, db = btcRet[i] - meanB;
    cov += dc * db; varC += dc * dc; varB += db * db;
  }
  const denom = Math.sqrt(varC * varB);
  return denom === 0 ? 0 : cov / denom;
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcZScore(closes, period = 50) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = calcStdDev(slice);
  return std === 0 ? 0 : (closes[closes.length - 1] - mean) / std;
}

function calcBollingerPct(closes, period = 20, mult = 2) {
  if (closes.length < period) return 0.5;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const std = calcStdDev(slice);
  const upper = mid + mult * std, lower = mid - mult * std;
  const price = closes[closes.length - 1];
  const range = upper - lower;
  return range === 0 ? 0.5 : (price - lower) / range;
}

function isATRContracting(candles) {
  if (candles.length < 25) return false;
  const atrRecent = calcATR(candles.slice(-10), 7);
  const atrAvg    = calcATR(candles.slice(-25), 20);
  return atrRecent < atrAvg * 0.85;
}

function classifyRegime(adx, atrPct) {
  if (adx > 30 && atrPct > 3.5) return 'VOLATILE 🌊';
  if (adx >= 25)                 return 'TRENDING 📈';
  if (adx < 18)                  return 'RANGING ↔️';
  return 'TRANSITION ⚡';
}

function reversionProbLabel(zScore) {
  const z = Math.abs(zScore);
  if (z >= 3.0) return '~85% hist.';
  if (z >= 2.5) return '~72% hist.';
  if (z >= 2.0) return '~60% hist.';
  return '~45% hist.';
}

// ── SECTOR MAP ────────────────────────────────────────────────────────────────
const SECTOR_MAP = {
  'BTC/USDT': 'L1', 'ETH/USDT': 'L1', 'SOL/USDT': 'L1', 'BNB/USDT': 'L1', 'XRP/USDT': 'L1',
  'ADA/USDT': 'L1', 'AVAX/USDT': 'L1', 'SUI/USDT': 'L1', 'TON/USDT': 'L1',
  'NEAR/USDT': 'L1', 'APT/USDT': 'L1', 'TRX/USDT': 'L1', 'LTC/USDT': 'L1',
  'DOGE/USDT': 'Meme',
  'OP/USDT': 'L2', 'ARB/USDT': 'L2', 'STX/USDT': 'L2',
  'UNI/USDT': 'DeFi', 'AAVE/USDT': 'DeFi', 'LDO/USDT': 'DeFi',
  'HYPE/USDT': 'DeFi', 'RUNE/USDT': 'DeFi', 'JUP/USDT': 'DeFi', 'INJ/USDT': 'DeFi',
  'TAO/USDT': 'AI', 'FET/USDT': 'AI', 'RENDER/USDT': 'AI',
  'LINK/USDT': 'Infra', 'DOT/USDT': 'Infra', 'ATOM/USDT': 'Infra', 'FIL/USDT': 'Infra',
};

// ── MOMENTUM SCORE ────────────────────────────────────────────────────────────
function calcMomentumScore({ roc, volRatio, rsi, sharpe, adx, atrPct, tfBullish, macdHist, macdPrevHist, emaFan }) {
  let score = 50;

  // ROC: ±20 pts
  score += Math.max(-20, Math.min(20, roc * 2));

  // Volume ratio: ±10 pts
  if (volRatio > 2)        score += 10;
  else if (volRatio > 1.5) score += 7;
  else if (volRatio > 1.2) score += 4;
  else if (volRatio < 0.7) score -= 5;

  // RSI momentum: ±10 pts
  if (rsi > 60 && rsi < 80)      score += 10;
  else if (rsi > 50)              score += 5;
  else if (rsi < 40 && rsi > 20) score -= 5;
  else if (rsi < 30)             score -= 10;

  // Sharpe: ±10 pts
  if (sharpe > 1.5)       score += 10;
  else if (sharpe > 0.8)  score += 6;
  else if (sharpe > 0)    score += 2;
  else if (sharpe < -0.5) score -= 8;
  else                     score -= 3;

  // ADX: ±5 pts
  if (adx > 30)      score += 5;
  else if (adx > 20) score += 2;
  else               score -= 3;

  // MTF alignment: ±15 pts
  if (tfBullish === 3)      score += 15;
  else if (tfBullish === 2) score += 8;
  else if (tfBullish === 0) score -= 10;

  // MACD: ±8 pts
  if (macdHist > 0 && macdHist > macdPrevHist)     score += 8;
  else if (macdHist > 0)                             score += 3;
  else if (macdHist < 0 && macdHist > macdPrevHist) score -= 3;
  else if (macdHist < 0)                             score -= 8;

  // EMA Fan: ±10 pts
  if (emaFan === 'BULLISH')      score += 10;
  else if (emaFan === 'ABOVE')   score += 5;
  else if (emaFan === 'BELOW')   score -= 5;
  else if (emaFan === 'BEARISH') score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── REVERSION SCORE ───────────────────────────────────────────────────────────
function calcReversionScore({ zScore, bPct, rsi, adx, atrContracting, direction, hasDivergence, hasConfirmPattern, isVolatile }) {
  let score = 0;

  // Z-Score magnitude (max 40 pts)
  const zAbs = Math.abs(zScore);
  if (zAbs >= 3.0)      score += 40;
  else if (zAbs >= 2.5) score += 30;
  else if (zAbs >= 2.0) score += 20;
  else if (zAbs >= 1.5) score += 10;

  // Bollinger %B extremity (max 25 pts)
  if (direction === 'LONG') {
    if (bPct <= 0.05)      score += 25;
    else if (bPct <= 0.10) score += 18;
    else if (bPct <= 0.15) score += 10;
  } else {
    if (bPct >= 0.95)      score += 25;
    else if (bPct >= 0.90) score += 18;
    else if (bPct >= 0.85) score += 10;
  }

  // RSI extreme (max 20 pts)
  if (direction === 'LONG') {
    if (rsi < 20)      score += 20;
    else if (rsi < 25) score += 14;
    else if (rsi < 30) score += 8;
  } else {
    if (rsi > 80)      score += 20;
    else if (rsi > 75) score += 14;
    else if (rsi > 70) score += 8;
  }

  // ADX rendah = non-trending = reversion valid (max 10 pts)
  if (adx < 15)      score += 10;
  else if (adx < 20) score += 6;
  else if (adx < 25) score += 2;
  else if (adx > 30) score -= 10;

  // ATR contracting (5 pts)
  if (atrContracting) score += 5;

  // RSI divergence bonus (15 pts)
  if (hasDivergence) score += 15;

  // Candle pattern confirmation (10 pts)
  if (hasConfirmPattern) score += 10;

  // Volatile market penalty (-15 pts) — mean reversion lebih berisiko
  if (isVolatile) score -= 15;

  return Math.max(0, Math.min(100, score));
}

// ── ANALYZE QUANT PAIR ────────────────────────────────────────────────────────
async function analyzeQuantPair(pair, btcCloses) {
  try {
    const [candles1h, candles4h, candles15m] = await Promise.all([
      getKlines(pair.symbol, '1h', 120),
      getKlines(pair.symbol, '4h', 60),
      getKlines(pair.symbol, '15m', 80),
    ]);
    if (!candles1h || candles1h.length < 50) return null;

    const closes  = candles1h.map(c => c.close);
    const price   = closes[closes.length - 1];

    const roc1h   = calcROC(closes, 14);
    const atr     = calcATR(candles1h, 14);
    const atrPct  = (atr / price) * 100;
    const rsiArr  = calcRSI(closes, 14);
    const rsi     = rsiArr[rsiArr.length - 1] || 50;
    const adx     = calcADX(candles1h, 14);
    const volRatio = calcVolRatio(candles1h, 5, 20);
    const sharpe  = calcSharpe(closes, 20);
    const btcCorr = btcCloses.length > 20 ? calcBtcCorr(closes, btcCloses) : 0;
    const regime  = classifyRegime(adx, atrPct);

    // MTF Momentum
    const closes4h  = candles4h  && candles4h.length  >= 20 ? candles4h.map(c => c.close)  : [];
    const closes15m = candles15m && candles15m.length >= 20 ? candles15m.map(c => c.close) : [];
    const roc4h     = closes4h.length  ? calcROC(closes4h, 14)  : 0;
    const roc15m    = closes15m.length ? calcROC(closes15m, 14) : 0;
    const tfBullish = [roc1h > 0, roc4h > 0, roc15m > 0].filter(Boolean).length;
    const mtfLabel  = tfBullish === 3 ? 'ALIGNED ▲' : tfBullish === 2 ? 'PARTIAL ↗' : tfBullish === 1 ? 'MIXED ↔' : 'ALIGNED ▼';

    // MACD
    const macdData = calcMACD(closes);
    const macdDir  = macdData.histogram > 0 && macdData.histogram > macdData.prevHistogram ? '↑ Bullish'
                   : macdData.histogram > 0                                                  ? '↗ Fading'
                   : macdData.histogram < 0 && macdData.histogram > macdData.prevHistogram   ? '↘ Recovering'
                   : '↓ Bearish';

    // EMA Fan (8/21/50)
    const ema8arr  = calcEMA(closes, 8);
    const ema21arr = calcEMA(closes, 21);
    const ema50arr = calcEMA(closes, 50);
    const e8  = ema8arr[ema8arr.length - 1]  || price;
    const e21 = ema21arr[ema21arr.length - 1] || price;
    const e50 = ema50arr[ema50arr.length - 1] || price;
    let emaFanKey = 'NEUTRAL', emaFanLabel = 'Neutral ↔';
    if (price > e8 && e8 > e21 && e21 > e50)      { emaFanKey = 'BULLISH'; emaFanLabel = 'Bullish Fan 🔥'; }
    else if (price < e8 && e8 < e21 && e21 < e50) { emaFanKey = 'BEARISH'; emaFanLabel = 'Bearish Fan 🧊'; }
    else if (price > e21 && price > e50)            { emaFanKey = 'ABOVE';   emaFanLabel = 'Above EMAs ↑'; }
    else if (price < e21 && price < e50)            { emaFanKey = 'BELOW';   emaFanLabel = 'Below EMAs ↓'; }

    const momentumScore = calcMomentumScore({
      roc: roc1h, volRatio, rsi, sharpe, adx, atrPct,
      tfBullish,
      macdHist: macdData.histogram, macdPrevHist: macdData.prevHistogram,
      emaFan: emaFanKey,
    });

    return {
      pair: pair.name, tier: pair.tier, price,
      roc: roc1h, roc4h, roc15m,
      atrPct, rsi, adx, volRatio, sharpe, btcCorr,
      regime, momentumScore,
      mtfLabel, macdDir, emaFanLabel,
    };
  } catch {
    return null;
  }
}

// ── RUN QUANT ANALYSIS ────────────────────────────────────────────────────────
async function runQuantAnalysis(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ <b>Menjalankan Quant Analysis...</b>\nMengkalkulasi momentum MTF, MACD &amp; EMA Fan untuk semua pair...`,
    { parse_mode: 'HTML' }
  );

  try {
    const btcCandles = await getKlines('BTCUSDT', '1h', 100);
    const btcCloses  = btcCandles.map(c => c.close);

    const targetPairs = PAIRS.filter(p => p.tier <= 3);
    const settled = await Promise.allSettled(targetPairs.map(p => analyzeQuantPair(p, btcCloses)));

    const data = settled
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.momentumScore - a.momentumScore);

    if (!data.length) {
      await bot.sendMessage(chatId, '❌ Gagal mengambil data market.', { parse_mode: 'HTML' });
      return;
    }

    const dateStr = nowWIB();

    // ── PART 1: MOMENTUM SCREENER ─────────────────────────────────
    const top5 = data.slice(0, 5);

    let msg1 = `⚡ <b>QUANT ANALYSIS</b>\n`;
    msg1 += `📅 ${dateStr}\n`;
    msg1 += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg1 += `🚀 <b>MOMENTUM SCREENER</b>\n`;
    msg1 += `<i>Top 5 coin terkuat — skor kuantitatif multi-faktor</i>\n\n`;

    top5.forEach((d, i) => {
      const filled    = Math.round(d.momentumScore / 10);
      const bar       = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const roc1Str   = (d.roc >= 0 ? '+' : '') + fmt(d.roc, 2) + '%';
      const roc4Str   = (d.roc4h >= 0 ? '+' : '') + fmt(d.roc4h, 2) + '%';
      const roc15Str  = (d.roc15m >= 0 ? '+' : '') + fmt(d.roc15m, 2) + '%';
      const rsiDir    = d.rsi > 55 ? '↑' : d.rsi < 45 ? '↓' : '→';
      const sharpeStr = (d.sharpe >= 0 ? '+' : '') + fmt(d.sharpe, 2);

      msg1 += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.momentumScore}/100</b>\n`;
      msg1 += `<code>${bar}</code>\n`;
      msg1 += `• 15m: <b>${roc15Str}</b> | 1H: <b>${roc1Str}</b> | 4H: <b>${roc4Str}</b>  [${d.mtfLabel}]\n`;
      msg1 += `• RSI: <b>${fmt(d.rsi, 1)}${rsiDir}</b> | ADX: <b>${fmt(d.adx, 1)}</b> | MACD: <b>${d.macdDir}</b>\n`;
      msg1 += `• Vol: <b>${fmt(d.volRatio, 1)}x</b> | Sharpe: <b>${sharpeStr}</b> | EMA: <b>${d.emaFanLabel}</b>\n`;
      msg1 += `• Regime: ${d.regime}\n\n`;
    });

    // Sector Heatmap
    const sectorScores = {}, sectorCounts = {};
    data.forEach(d => {
      const sec = SECTOR_MAP[d.pair] || 'Other';
      sectorScores[sec] = (sectorScores[sec] || 0) + d.momentumScore;
      sectorCounts[sec] = (sectorCounts[sec] || 0) + 1;
    });
    const sectors = Object.keys(sectorScores)
      .map(s => ({ name: s, avg: Math.round(sectorScores[s] / sectorCounts[s]) }))
      .sort((a, b) => b.avg - a.avg);

    msg1 += `🗺️ <b>SECTOR HEATMAP</b>\n`;
    sectors.forEach(s => {
      const filled = Math.round(s.avg / 10);
      const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);
      msg1 += `<code>${s.name.padEnd(7)} ${bar} ${String(s.avg).padStart(3)}</code>\n`;
    });

    msg1 += `\n💡 <i>Gunakan /high [PAIR] untuk signal entry detail pada coin di atas</i>`;
    await bot.sendMessage(chatId, msg1, { parse_mode: 'HTML' });

    // ── PART 2: STAT REPORT ───────────────────────────────────────
    const reportPairs = [
      ...data.filter(d => d.tier <= 2),
      ...data.filter(d => d.tier === 3).slice(0, 5),
    ];

    let msg2 = `📐 <b>MARKET STAT REPORT</b>\n`;
    msg2 += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    reportPairs.forEach(d => {
      const rocStr    = (d.roc >= 0 ? '+' : '') + fmt(d.roc, 2) + '%';
      const corrStr   = d.pair === 'BTC/USDT' ? 'base' : (d.btcCorr * 100).toFixed(0) + '%';
      const sharpeStr = (d.sharpe >= 0 ? '+' : '') + fmt(d.sharpe, 2);
      const regimeShort = d.regime.split(' ')[0];

      msg2 += `<b>${d.pair}</b>\n`;
      msg2 += `<code>  ATR: ${fmt(d.atrPct, 2)}%  ROC: ${rocStr}  Sharpe: ${sharpeStr}  Corr: ${corrStr}  ${regimeShort}</code>\n`;
    });

    const trendingCount = data.filter(d => d.regime.includes('TRENDING')).length;
    const rangingCount  = data.filter(d => d.regime.includes('RANGING')).length;
    const volatileCount = data.filter(d => d.regime.includes('VOLATILE')).length;
    const avgSharpe     = data.reduce((s, d) => s + d.sharpe, 0) / data.length;
    const avgAtrPct     = data.reduce((s, d) => s + d.atrPct, 0) / data.length;
    const highMomentum  = data.filter(d => d.momentumScore >= 65).length;
    const alignedCount  = data.filter(d => d.mtfLabel === 'ALIGNED ▲').length;

    msg2 += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg2 += `<b>📊 Market Summary (${data.length} pair)</b>\n`;
    msg2 += `• Trending: <b>${trendingCount}</b> | Ranging: <b>${rangingCount}</b> | Volatile: <b>${volatileCount}</b>\n`;
    msg2 += `• MTF Aligned ▲: <b>${alignedCount}</b> pair (semua TF bullish)\n`;
    msg2 += `• Avg Sharpe: <b>${(avgSharpe >= 0 ? '+' : '') + fmt(avgSharpe, 2)}</b>\n`;
    msg2 += `• Avg Volatility: <b>${fmt(avgAtrPct, 2)}%/jam</b>\n`;
    msg2 += `• High Momentum Coins: <b>${highMomentum}</b> (score ≥65)\n`;
    msg2 += `\n⚠️ <i>Data 1H terakhir. Quant analysis bukan sinyal entry langsung.</i>`;

    await bot.sendMessage(chatId, msg2, { parse_mode: 'HTML' });

  } catch (e) {
    console.error('[QUANT ERROR]', e.message);
    await bot.sendMessage(chatId, `❌ <b>Quant Error:</b> <code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

// ── MEAN REVERSION FUNCTIONS ──────────────────────────────────────────────────

async function analyzeReversionPair(pair) {
  try {
    const candles = await getKlines(pair.symbol, '1h', 120);
    if (!candles || candles.length < 60) return null;

    const closes = candles.map(c => c.close);
    const price  = closes[closes.length - 1];
    const zScore = calcZScore(closes, 50);
    const bPct   = calcBollingerPct(closes, 20, 2);
    const rsiArr = calcRSI(closes, 14);
    const rsi    = rsiArr[rsiArr.length - 1] || 50;
    const adx    = calcADX(candles, 14);
    const atrContracting = isATRContracting(candles);
    const atr    = calcATR(candles, 14);
    const atrPct = (atr / price) * 100;
    const regime = classifyRegime(adx, atrPct);

    const isVolatile = regime === 'VOLATILE 🌊';

    let direction = null;
    if (zScore < -1.5 && bPct < 0.20 && rsi < 35)  direction = 'LONG';
    else if (zScore > 1.5 && bPct > 0.80 && rsi > 65) direction = 'SHORT';
    if (!direction) return null;

    // RSI Divergence confluence
    const divergence    = detectDivergence(candles, rsiArr);
    const hasDivergence = (direction === 'LONG'  && divergence === 'BULLISH_DIVERGENCE') ||
                          (direction === 'SHORT' && divergence === 'BEARISH_DIVERGENCE');

    // Candle pattern confirmation
    const candlePattern     = detectCandlePattern(candles);
    const bullishPatterns   = ['HAMMER', 'BULLISH_ENGULFING', 'BULLISH_PIN_BAR'];
    const bearishPatterns   = ['SHOOTING_STAR', 'BEARISH_ENGULFING', 'BEARISH_PIN_BAR'];
    const hasConfirmPattern = (direction === 'LONG'  && bullishPatterns.includes(candlePattern)) ||
                              (direction === 'SHORT' && bearishPatterns.includes(candlePattern));

    const score = calcReversionScore({ zScore, bPct, rsi, adx, atrContracting, direction, hasDivergence, hasConfirmPattern, isVolatile });
    if (score < 30) return null;

    // Dual TP: TP1 = EMA20, TP2 = SMA50
    const dec      = price >= 1000 ? 1 : 4;
    const sma50    = calcSMA(closes, 50);
    const ema20arr = calcEMA(closes, 20);
    const ema20    = ema20arr.length ? ema20arr[ema20arr.length - 1] : null;
    const slDist   = atr * 2.0;
    const sl       = direction === 'LONG'
      ? parseFloat((price - slDist).toFixed(dec))
      : parseFloat((price + slDist).toFixed(dec));

    const tp1Valid = ema20 && ((direction === 'LONG' && ema20 > price) || (direction === 'SHORT' && ema20 < price));
    const tp1 = tp1Valid ? parseFloat(ema20.toFixed(dec)) : null;
    const tp2 = sma50    ? parseFloat(sma50.toFixed(dec)) : null;
    const rr1 = tp1 ? parseFloat((Math.abs(tp1 - price) / slDist).toFixed(2)) : null;
    const rr2 = tp2 ? parseFloat((Math.abs(tp2 - price) / slDist).toFixed(2)) : null;

    return {
      pair: pair.name, tier: pair.tier, price, direction,
      zScore, bPct, rsi, adx, atrContracting, atrPct, score, regime, isVolatile,
      tp1, tp2, sl, rr1, rr2,
      hasDivergence, hasConfirmPattern, candlePattern,
    };
  } catch {
    return null;
  }
}

async function runQuantReversion(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ <b>Quant Mean Reversion Scan...</b>\nMencari coin overextended dengan konfirmasi divergence &amp; candle pattern...`,
    { parse_mode: 'HTML' }
  );

  try {
    const targetPairs = PAIRS.filter(p => p.tier <= 3);
    const settled = await Promise.allSettled(targetPairs.map(p => analyzeReversionPair(p)));

    const results = settled
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.score - a.score);

    const longs  = results.filter(d => d.direction === 'LONG');
    const shorts = results.filter(d => d.direction === 'SHORT');

    const dateStr = nowWIB();
    const pFmt = (n, dec) => n == null ? 'N/A' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

    let msg = `📊 <b>QUANT MEAN REVERSION SCAN</b>\n`;
    msg += `📅 ${dateStr}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (!longs.length && !shorts.length) {
      msg += `\n✅ <b>Tidak ada kandidat reversion saat ini.</b>\n\n`;
      msg += `Harga semua pair masih dalam kisaran normal — tidak ada yang overextended.\n`;
      msg += `<i>Note: Pair VOLATILE mendapat penalty -15 pts — sinyal terlalu lemah saat ini.</i>\n\n`;
      msg += `💡 <i>Coba /quant untuk melihat pair dengan momentum kuat.</i>`;
      await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
      return;
    }

    if (longs.length) {
      msg += `\n🟢 <b>OVERSOLD — Kandidat LONG</b>\n`;
      msg += `<i>Harga jauh di bawah rata-rata | VOLATILE = excluded</i>\n\n`;

      longs.slice(0, 4).forEach((d, i) => {
        const filled   = Math.round(d.score / 10);
        const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const dec      = d.price >= 1000 ? 1 : 4;
        const zStr     = fmt(d.zScore, 2);
        const bStr     = (d.bPct * 100).toFixed(0) + '%';
        const atrIcon  = d.atrContracting ? '✅' : '❌';
        const divIcon  = d.hasDivergence  ? '✅ Bullish Div' : '—';
        const patIcon  = d.hasConfirmPattern ? `✅ ${d.candlePattern}` : '—';
        const tp1Str   = d.tp1 ? `${pFmt(d.tp1, dec)} (1:${d.rr1})` : '—';
        const tp2Str   = d.tp2 ? `${pFmt(d.tp2, dec)} (1:${d.rr2})` : '—';

        msg += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.score}/100</b>  <i>${reversionProbLabel(d.zScore)}</i>\n`;
        msg += `<code>${bar}</code>\n`;
        if (d.isVolatile) msg += `• 🌊 <b>Regime VOLATILE</b> — risiko reversion lebih tinggi, size kecil\n`;
        msg += `• Z: <b>${zStr}</b> | %B: <b>${bStr}</b> | RSI: <b>${fmt(d.rsi, 1)}</b> | ADX: <b>${fmt(d.adx, 1)}</b>\n`;
        msg += `• Divergence: ${divIcon} | Candle: ${patIcon} | ATR ↘: ${atrIcon}\n`;
        msg += `• TP1 (EMA20): <b>${tp1Str}</b>\n`;
        msg += `• TP2 (SMA50): <b>${tp2Str}</b>\n`;
        msg += `• SL: <b>${pFmt(d.sl, dec)}</b>\n`;
        msg += `• ⚠️ Tunggu konfirmasi candle hijau sebelum entry\n\n`;
      });
    }

    if (shorts.length) {
      msg += `🔴 <b>OVERBOUGHT — Kandidat SHORT</b>\n`;
      msg += `<i>Harga jauh di atas rata-rata | VOLATILE = excluded</i>\n\n`;

      shorts.slice(0, 4).forEach((d, i) => {
        const filled   = Math.round(d.score / 10);
        const bar      = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const dec      = d.price >= 1000 ? 1 : 4;
        const zStr     = fmt(d.zScore, 2);
        const bStr     = (d.bPct * 100).toFixed(0) + '%';
        const atrIcon  = d.atrContracting ? '✅' : '❌';
        const divIcon  = d.hasDivergence  ? '✅ Bearish Div' : '—';
        const patIcon  = d.hasConfirmPattern ? `✅ ${d.candlePattern}` : '—';
        const tp1Str   = d.tp1 ? `${pFmt(d.tp1, dec)} (1:${d.rr1})` : '—';
        const tp2Str   = d.tp2 ? `${pFmt(d.tp2, dec)} (1:${d.rr2})` : '—';

        msg += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.score}/100</b>  <i>${reversionProbLabel(d.zScore)}</i>\n`;
        msg += `<code>${bar}</code>\n`;
        if (d.isVolatile) msg += `• 🌊 <b>Regime VOLATILE</b> — risiko reversion lebih tinggi, size kecil\n`;
        msg += `• Z: <b>+${zStr}</b> | %B: <b>${bStr}</b> | RSI: <b>${fmt(d.rsi, 1)}</b> | ADX: <b>${fmt(d.adx, 1)}</b>\n`;
        msg += `• Divergence: ${divIcon} | Candle: ${patIcon} | ATR ↘: ${atrIcon}\n`;
        msg += `• TP1 (EMA20): <b>${tp1Str}</b>\n`;
        msg += `• TP2 (SMA50): <b>${tp2Str}</b>\n`;
        msg += `• SL: <b>${pFmt(d.sl, dec)}</b>\n`;
        msg += `• ⚠️ Tunggu konfirmasi candle merah sebelum entry\n\n`;
      });
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 <b>Catatan Penting:</b>\n`;
    msg += `• Mean reversion optimal di pasar <b>RANGING / ADX rendah</b>\n`;
    msg += `• Pair <b>VOLATILE</b> dapat muncul tapi score dipotong -15 pts\n`;
    msg += `• Jika ADX &gt; 25, reversion berisiko tinggi — skip\n`;
    msg += `• TP1 = <b>EMA20</b> (exit cepat), TP2 = <b>SMA50</b> (target penuh)\n`;
    msg += `• Score tinggi + Divergence + Candle Konfirmasi = setup terkuat\n`;
    msg += `\n⚠️ <i>Bukan sinyal langsung. Gunakan manajemen risiko ketat.</i>`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });

  } catch (e) {
    console.error('[REVERSION ERROR]', e.message);
    await bot.sendMessage(chatId, `❌ <b>Reversion Error:</b> <code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

module.exports = { runQuantAnalysis, runQuantReversion };
