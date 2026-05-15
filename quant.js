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

module.exports = { runQuantAnalysis };
