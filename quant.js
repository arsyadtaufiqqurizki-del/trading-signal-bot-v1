'use strict';

const { getKlines } = require('./binance');
const { calcRSI, calcATR, calcADX } = require('./indicators');
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

// Return / StdDev of returns — last N candles
function calcSharpe(closes, period = 20) {
  if (closes.length < period + 1) return 0;
  const slice = closes.slice(-period - 1);
  const returns = slice.slice(1).map((c, i) => (c - slice[i]) / slice[i]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = calcStdDev(returns);
  return std === 0 ? 0 : mean / std;
}

// Avg volume last recentN vs avg of prior avgN
function calcVolRatio(candles, recentN = 5, avgN = 20) {
  if (candles.length < avgN + recentN) return 1;
  const recent = candles.slice(-recentN).reduce((s, c) => s + c.volume, 0) / recentN;
  const avg = candles.slice(-avgN - recentN, -recentN).reduce((s, c) => s + c.volume, 0) / avgN;
  return avg === 0 ? 1 : recent / avg;
}

// Pearson correlation between coin and BTC returns (last 20 candles)
function calcBtcCorr(closes, btcCloses) {
  const n = Math.min(20, closes.length, btcCloses.length) - 1;
  if (n < 5) return 0;

  const coinRet = [];
  const btcRet = [];
  for (let i = closes.length - n; i < closes.length; i++)
    coinRet.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  for (let i = btcCloses.length - n; i < btcCloses.length; i++)
    btcRet.push((btcCloses[i] - btcCloses[i - 1]) / btcCloses[i - 1]);

  const meanC = coinRet.reduce((a, b) => a + b, 0) / n;
  const meanB = btcRet.reduce((a, b) => a + b, 0) / n;
  let cov = 0, varC = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const dc = coinRet[i] - meanC;
    const db = btcRet[i] - meanB;
    cov += dc * db;
    varC += dc * dc;
    varB += db * db;
  }
  const denom = Math.sqrt(varC * varB);
  return denom === 0 ? 0 : cov / denom;
}

function classifyRegime(adx, atrPct) {
  if (adx > 30 && atrPct > 3.5) return 'VOLATILE 🌊';
  if (adx >= 25)                 return 'TRENDING 📈';
  if (adx < 18)                  return 'RANGING ↔️';
  return 'TRANSITION ⚡';
}

function calcMomentumScore({ roc, volRatio, rsi, sharpe, adx, atrPct }) {
  let score = 50;

  // ROC: ±20 pts
  score += Math.max(-20, Math.min(20, roc * 2));

  // Volume ratio: ±10 pts
  if (volRatio > 2)       score += 10;
  else if (volRatio > 1.5) score += 7;
  else if (volRatio > 1.2) score += 4;
  else if (volRatio < 0.7) score -= 5;

  // RSI momentum: ±10 pts
  if (rsi > 60 && rsi < 80)      score += 10;
  else if (rsi > 50)              score += 5;
  else if (rsi < 40 && rsi > 20) score -= 5;
  else if (rsi < 30)             score -= 10;

  // Sharpe: ±10 pts
  if (sharpe > 1.5)      score += 10;
  else if (sharpe > 0.8) score += 6;
  else if (sharpe > 0)   score += 2;
  else if (sharpe < -0.5) score -= 8;
  else                    score -= 3;

  // ADX: ±5 pts
  if (adx > 30)      score += 5;
  else if (adx > 20) score += 2;
  else               score -= 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function analyzeQuantPair(pair, btcCloses) {
  try {
    const candles = await getKlines(pair.symbol, '1h', 100);
    if (!candles || candles.length < 50) return null;

    const closes  = candles.map(c => c.close);
    const price   = closes[closes.length - 1];
    const roc     = calcROC(closes, 14);
    const atr     = calcATR(candles, 14);
    const atrPct  = (atr / price) * 100;
    const rsiArr  = calcRSI(closes, 14);
    const rsi     = rsiArr[rsiArr.length - 1] || 50;
    const adx     = calcADX(candles, 14);
    const volRatio = calcVolRatio(candles, 5, 20);
    const sharpe  = calcSharpe(closes, 20);
    const btcCorr = btcCloses.length > 20 ? calcBtcCorr(closes, btcCloses) : 0;
    const regime  = classifyRegime(adx, atrPct);
    const momentumScore = calcMomentumScore({ roc, volRatio, rsi, sharpe, adx, atrPct });

    return { pair: pair.name, tier: pair.tier, price, roc, atrPct, rsi, adx, volRatio, sharpe, btcCorr, regime, momentumScore };
  } catch {
    return null;
  }
}

async function runQuantAnalysis(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ <b>Menjalankan Quant Analysis...</b>\nMengkalkulasi momentum &amp; statistik untuk semua pair...`,
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

    // ── PART 1: MOMENTUM SCREENER ────────────────────────────────
    const top5 = data.slice(0, 5);

    let msg1 = `⚡ <b>QUANT ANALYSIS</b>\n`;
    msg1 += `📅 ${dateStr}\n`;
    msg1 += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    msg1 += `🚀 <b>MOMENTUM SCREENER</b>\n`;
    msg1 += `<i>Top 5 coin terkuat — skor kuantitatif multi-faktor</i>\n\n`;

    top5.forEach((d, i) => {
      const rocStr  = (d.roc >= 0 ? '+' : '') + fmt(d.roc, 2) + '%';
      const volStr  = fmt(d.volRatio, 1) + 'x';
      const rsiDir  = d.rsi > 55 ? '↑' : d.rsi < 45 ? '↓' : '→';
      const filled  = Math.round(d.momentumScore / 10);
      const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);
      const sharpeStr = (d.sharpe >= 0 ? '+' : '') + fmt(d.sharpe, 2);

      msg1 += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.momentumScore}/100</b>\n`;
      msg1 += `<code>${bar}</code>\n`;
      msg1 += `• ROC 14H: <b>${rocStr}</b>  | Volume: <b>${volStr}</b>\n`;
      msg1 += `• RSI: <b>${fmt(d.rsi, 1)}${rsiDir}</b> | ADX: <b>${fmt(d.adx, 1)}</b> | Sharpe: <b>${sharpeStr}</b>\n`;
      msg1 += `• Regime: ${d.regime}\n\n`;
    });

    msg1 += `💡 <i>Gunakan /high [PAIR] untuk signal entry detail pada coin di atas</i>`;
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

    // Market summary
    const trendingCount  = data.filter(d => d.regime.includes('TRENDING')).length;
    const rangingCount   = data.filter(d => d.regime.includes('RANGING')).length;
    const volatileCount  = data.filter(d => d.regime.includes('VOLATILE')).length;
    const avgSharpe = data.reduce((s, d) => s + d.sharpe, 0) / data.length;
    const avgAtrPct = data.reduce((s, d) => s + d.atrPct, 0) / data.length;
    const highMomentum = data.filter(d => d.momentumScore >= 65).length;

    msg2 += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    msg2 += `<b>📊 Market Summary (${data.length} pair)</b>\n`;
    msg2 += `• Trending: <b>${trendingCount}</b> | Ranging: <b>${rangingCount}</b> | Volatile: <b>${volatileCount}</b>\n`;
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

// ── MEAN REVERSION FUNCTIONS ─────────────────────────────────────────────────

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
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  const price = closes[closes.length - 1];
  const range = upper - lower;
  return range === 0 ? 0.5 : (price - lower) / range;
}

// true jika ATR 7 candle terakhir < 80% dari ATR 20 candle
function isATRContracting(candles) {
  if (candles.length < 25) return false;
  const atrRecent = calcATR(candles.slice(-10), 7);
  const atrAvg    = calcATR(candles.slice(-25), 20);
  return atrRecent < atrAvg * 0.85;
}

function calcReversionScore({ zScore, bPct, rsi, adx, atrContracting, direction }) {
  let score = 0;

  // Z-Score magnitude: semakin ekstrim semakin tinggi (max 40 pts)
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

  // ADX rendah = non-trending = reversion lebih valid (max 10 pts)
  if (adx < 15)      score += 10;
  else if (adx < 20) score += 6;
  else if (adx < 25) score += 2;
  else if (adx > 30) score -= 10; // trending kuat — reversion berisiko

  // ATR contracting = energy habis, potensi balik (5 pts)
  if (atrContracting) score += 5;

  return Math.max(0, Math.min(100, score));
}

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

    // Tentukan kandidat: LONG jika oversold, SHORT jika overbought
    let direction = null;
    if (zScore < -1.5 && bPct < 0.20 && rsi < 35) direction = 'LONG';
    else if (zScore > 1.5 && bPct > 0.80 && rsi > 65) direction = 'SHORT';

    if (!direction) return null;

    const score = calcReversionScore({ zScore, bPct, rsi, adx, atrContracting, direction });

    // Hanya kembalikan jika score cukup kuat
    if (score < 30) return null;

    // Target reversion ke SMA50 (mean)
    const sma50  = calcSMA(closes, 50);
    const tp     = sma50 ? parseFloat(sma50.toFixed(price >= 1000 ? 1 : 4)) : null;
    const slDist = atr * 2.0;
    const sl     = direction === 'LONG'
      ? parseFloat((price - slDist).toFixed(price >= 1000 ? 1 : 4))
      : parseFloat((price + slDist).toFixed(price >= 1000 ? 1 : 4));
    const rr     = tp ? parseFloat((Math.abs(tp - price) / slDist).toFixed(2)) : null;

    return { pair: pair.name, tier: pair.tier, price, direction, zScore, bPct, rsi, adx, atrContracting, atrPct, score, tp, sl, rr };
  } catch {
    return null;
  }
}

async function runQuantReversion(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ <b>Quant Mean Reversion Scan...</b>\nMencari coin yang overextended &amp; siap balik arah...`,
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
    let msg = `📊 <b>QUANT MEAN REVERSION SCAN</b>\n`;
    msg += `📅 ${dateStr}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (!longs.length && !shorts.length) {
      msg += `\n✅ <b>Tidak ada kandidat reversion saat ini.</b>\n\n`;
      msg += `Artinya harga semua pair masih dalam kisaran normal — tidak ada yang overextended.\n\n`;
      msg += `💡 <i>Coba gunakan /quant untuk melihat pair dengan momentum kuat.</i>`;
      await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
      return;
    }

    // ── OVERSOLD — kandidat LONG ──────────────────────────────────
    if (longs.length) {
      msg += `\n🟢 <b>OVERSOLD — Kandidat LONG</b>\n`;
      msg += `<i>Harga terlalu jauh di bawah rata-rata</i>\n\n`;

      longs.slice(0, 4).forEach((d, i) => {
        const filled  = Math.round(d.score / 10);
        const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const zStr    = fmt(d.zScore, 2);
        const bStr    = (d.bPct * 100).toFixed(0) + '%';
        const atrIcon = d.atrContracting ? '✅' : '❌';
        const dec     = d.price >= 1000 ? 1 : 4;
        const p       = (n) => n == null ? 'N/A' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        const rrStr   = d.rr ? `1:${d.rr}` : 'N/A';

        msg += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.score}/100</b>\n`;
        msg += `<code>${bar}</code>\n`;
        msg += `• Z-Score: <b>${zStr}</b> | %B: <b>${bStr}</b> | RSI: <b>${fmt(d.rsi, 1)}</b>\n`;
        msg += `• ADX: <b>${fmt(d.adx, 1)}</b> | ATR Kontraksi: ${atrIcon}\n`;
        msg += `• Target (SMA50): <b>${p(d.tp)}</b> | SL: <b>${p(d.sl)}</b> | RR: <b>${rrStr}</b>\n`;
        msg += `• ⚠️ Tunggu konfirmasi candle hijau sebelum entry\n\n`;
      });
    }

    // ── OVERBOUGHT — kandidat SHORT ───────────────────────────────
    if (shorts.length) {
      msg += `🔴 <b>OVERBOUGHT — Kandidat SHORT</b>\n`;
      msg += `<i>Harga terlalu jauh di atas rata-rata</i>\n\n`;

      shorts.slice(0, 4).forEach((d, i) => {
        const filled  = Math.round(d.score / 10);
        const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);
        const zStr    = fmt(d.zScore, 2);
        const bStr    = (d.bPct * 100).toFixed(0) + '%';
        const atrIcon = d.atrContracting ? '✅' : '❌';
        const dec     = d.price >= 1000 ? 1 : 4;
        const p       = (n) => n == null ? 'N/A' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        const rrStr   = d.rr ? `1:${d.rr}` : 'N/A';

        msg += `<b>#${i + 1} ${d.pair}</b>  Score: <b>${d.score}/100</b>\n`;
        msg += `<code>${bar}</code>\n`;
        msg += `• Z-Score: <b>+${zStr}</b> | %B: <b>${bStr}</b> | RSI: <b>${fmt(d.rsi, 1)}</b>\n`;
        msg += `• ADX: <b>${fmt(d.adx, 1)}</b> | ATR Kontraksi: ${atrIcon}\n`;
        msg += `• Target (SMA50): <b>${p(d.tp)}</b> | SL: <b>${p(d.sl)}</b> | RR: <b>${rrStr}</b>\n`;
        msg += `• ⚠️ Tunggu konfirmasi candle merah sebelum entry\n\n`;
      });
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📌 <b>Catatan Penting:</b>\n`;
    msg += `• Mean reversion optimal di pasar <b>RANGING / ADX rendah</b>\n`;
    msg += `• Jika ADX &gt; 25, reversion berisiko tinggi — skip\n`;
    msg += `• Target price adalah <b>SMA50</b> (titik mean/rata-rata)\n`;
    msg += `• Selalu tunggu konfirmasi candle sebelum entry\n`;
    msg += `\n⚠️ <i>Bukan sinyal langsung. Gunakan manajemen risiko ketat.</i>`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });

  } catch (e) {
    console.error('[REVERSION ERROR]', e.message);
    await bot.sendMessage(chatId, `❌ <b>Reversion Error:</b> <code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

module.exports = { runQuantAnalysis, runQuantReversion };
