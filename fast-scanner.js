'use strict';
const { getKlines, getTicker } = require('./binance');
const { calcEMA, calcRSI, calcATR, detectStructure } = require('./indicators');
const { fmt } = require('./utils');

// 9 priority pairs sesuai request
const FAST_PAIRS = [
  { symbol: 'BTCUSDT',  name: 'BTC/USDT',  priority: 1 },
  { symbol: 'ETHUSDT',  name: 'ETH/USDT',  priority: 2 },
  { symbol: 'SOLUSDT',  name: 'SOL/USDT',  priority: 3 },
  { symbol: 'HYPEUSDT', name: 'HYPE/USDT', priority: 4 },
  { symbol: 'TAOUSDT',  name: 'TAO/USDT',  priority: 5 },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT', priority: 6 },
  { symbol: 'SUIUSDT',  name: 'SUI/USDT',  priority: 7 },
  { symbol: 'BNBUSDT',  name: 'BNB/USDT',  priority: 8 },
  { symbol: 'XRPUSDT',  name: 'XRP/USDT',  priority: 9 },
];

/**
 * Hitung skor setup sederhana untuk pair tertentu.
 * Rules lebih longgar — minimal 1 indikator cukup.
 * Selalu return signal (fallback ke best available).
 */
async function fastAnalyzeAsset(pair) {
  try {
    const [candles1h, ticker] = await Promise.all([
      getKlines(pair.symbol, '1h', 100),
      getTicker(pair.symbol),
    ]);

    if (!candles1h || candles1h.length < 30) return null;

    const closes = candles1h.map(c => c.close);
    const price   = closes[closes.length - 1];

    // ── Indikator 1: EMA 20 & 50 ───────────────────────────────────────────
    const ema20arr = calcEMA(closes, 20);
    const ema50arr = calcEMA(closes, 50);
    const ema20 = ema20arr[ema20arr.length - 1];
    const ema50 = ema50arr[ema50arr.length - 1];

    // ── Indikator 2: RSI 14 ────────────────────────────────────────────────
    const rsiArr = calcRSI(closes, 14);
    const rsi    = rsiArr[rsiArr.length - 1];

    // ── Indikator 3: ATR (untuk SL) ────────────────────────────────────────
    const atr = calcATR(candles1h, 14);

    // ── Market Structure Sederhana ─────────────────────────────────────────
    const struct = detectStructure(candles1h);
    const trend  = struct.trend; // UPTREND / DOWNTREND / RANGING

    // ── Momentum Candle (3 candle terakhir) ────────────────────────────────
    const last3    = candles1h.slice(-3);
    const bullCandles = last3.filter(c => c.close > c.open).length;
    const bearCandles = last3.filter(c => c.close < c.open).length;

    // ── Scoring (fleksibel, min 1) ─────────────────────────────────────────
    let longScore = 0, shortScore = 0;
    const longFactors = [], shortFactors = [];

    // EMA alignment
    if (price > ema20 && ema20 > ema50) {
      longScore += 2; longFactors.push('Price di atas EMA20 > EMA50');
    } else if (price < ema20 && ema20 < ema50) {
      shortScore += 2; shortFactors.push('Price di bawah EMA20 < EMA50');
    } else if (price > ema20) {
      longScore++;  longFactors.push('Price di atas EMA20');
    } else if (price < ema20) {
      shortScore++; shortFactors.push('Price di bawah EMA20');
    }

    // RSI
    if (rsi !== undefined) {
      if (rsi < 35) { longScore += 2;  longFactors.push(`RSI Oversold (${fmt(rsi,1)})`); }
      else if (rsi < 45) { longScore++; longFactors.push(`RSI Approaching Oversold (${fmt(rsi,1)})`); }
      else if (rsi > 65) { shortScore += 2; shortFactors.push(`RSI Overbought (${fmt(rsi,1)})`); }
      else if (rsi > 55) { shortScore++;    shortFactors.push(`RSI Approaching Overbought (${fmt(rsi,1)})`); }
    }

    // Market structure
    if (trend === 'UPTREND')   { longScore++;  longFactors.push('Uptrend (HH-HL)'); }
    if (trend === 'DOWNTREND') { shortScore++; shortFactors.push('Downtrend (LH-LL)'); }

    // Candle momentum
    if (bullCandles >= 2) { longScore++;  longFactors.push('Bullish candle momentum'); }
    if (bearCandles >= 2) { shortScore++; shortFactors.push('Bearish candle momentum'); }

    // 24h change context
    const change24h = ticker ? ticker.change24h : 0;
    if (change24h > 2)  { longScore++;  longFactors.push(`24h +${fmt(change24h,1)}% momentum`); }
    if (change24h < -2) { shortScore++; shortFactors.push(`24h ${fmt(change24h,1)}% weakness`); }

    // ── Tentukan direction ─────────────────────────────────────────────────
    const direction = longScore >= shortScore ? 'LONG' : 'SHORT';
    const score     = direction === 'LONG' ? longScore : shortScore;
    const factors   = direction === 'LONG' ? longFactors : shortFactors;

    // ── Kalkulasi Entry / SL / TP ─────────────────────────────────────────
    // ATR multiplier lebih flexible: SL 1.2x ATR, TP1 1.8x, TP2 2.5x ATR
    const atrMult = atr || price * 0.012; // fallback 1.2% jika ATR gagal
    let sl, tp, marketCondition;

    if (direction === 'LONG') {
      sl = price - atrMult * 1.3;
      tp = price + atrMult * 2.0;
    } else {
      sl = price + atrMult * 1.3;
      tp = price - atrMult * 2.0;
    }

    // Market condition
    const atrPct = (atrMult / price) * 100;
    if (atrPct > 3)        marketCondition = 'Volatile';
    else if (trend !== 'RANGING') marketCondition = 'Trending';
    else                   marketCondition = 'Ranging';

    const risk   = Math.abs(price - sl);
    const reward = Math.abs(tp - price);
    const rr     = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 1.5;

    return {
      pair: pair.name,
      priority: pair.priority,
      direction,
      price,
      sl,
      tp,
      rr,
      score,
      factors,
      rsi,
      trend,
      marketCondition,
      change24h: change24h || 0,
      atr: atrMult,
    };
  } catch (err) {
    console.error(`[FastScanner] Error on ${pair.symbol}:`, err.message);
    return null;
  }
}

/**
 * Scan semua 9 pair, pilih 1 sinyal terbaik.
 * SELALU return sinyal — jika semua gagal, gunakan BTC sebagai fallback.
 */
async function fastScan() {
  const results = await Promise.allSettled(FAST_PAIRS.map(p => fastAnalyzeAsset(p)));

  const valid = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  if (valid.length === 0) {
    // Fallback: buat sinyal BTC darurat dari ticker saja
    return await buildFallbackSignal();
  }

  // Sort: score tertinggi dulu, tie-break by priority
  valid.sort((a, b) => b.score - a.score || a.priority - b.priority);

  return valid[0]; // Selalu 1 sinyal terbaik
}

/**
 * Fallback absolut — jika semua API timeout, pakai BTC dan asumsikan setup netral.
 */
async function buildFallbackSignal() {
  try {
    const ticker = await getTicker('BTCUSDT');
    const price  = ticker.price || 60000;
    const atr    = price * 0.012;
    const direction = ticker.change24h >= 0 ? 'LONG' : 'SHORT';
    const sl  = direction === 'LONG' ? price - atr * 1.3 : price + atr * 1.3;
    const tp  = direction === 'LONG' ? price + atr * 2.0 : price - atr * 2.0;
    return {
      pair: 'BTC/USDT', priority: 1, direction, price, sl, tp,
      rr: 1.54, score: 1,
      factors: ['Price action sederhana (24h momentum)'],
      rsi: null, trend: 'RANGING', marketCondition: 'Volatile',
      change24h: ticker.change24h || 0, atr,
    };
  } catch {
    const price = 60000, atr = 720;
    return {
      pair: 'BTC/USDT', priority: 1, direction: 'LONG', price, sl: price - atr * 1.3, tp: price + atr * 2.0,
      rr: 1.54, score: 1, factors: ['Fallback signal — data terbatas'],
      rsi: null, trend: 'RANGING', marketCondition: 'Volatile', change24h: 0, atr,
    };
  }
}

module.exports = { fastScan };
