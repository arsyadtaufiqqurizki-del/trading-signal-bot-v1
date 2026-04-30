'use strict';

// ── EMA ─────────────────────────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

// ── RSI ─────────────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let gains = 0, losses = 0;
  changes.slice(0, period).forEach(c => { if (c > 0) gains += c; else losses -= c; });
  let avgG = gains / period, avgL = losses / period;
  const rsi = [100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL))];
  for (let i = period; i < changes.length; i++) {
    const g = changes[i] > 0 ? changes[i] : 0;
    const l = changes[i] < 0 ? -changes[i] : 0;
    avgG = (avgG * (period - 1) + g) / period;
    avgL = (avgL * (period - 1) + l) / period;
    rsi.push(100 - 100 / (1 + (avgL === 0 ? Infinity : avgG / avgL)));
  }
  return rsi;
}

// ── ATR ─────────────────────────────────────────────────────────────────────
function calcATR(candles, period = 14) {
  const trs = candles.slice(1).map((c, i) => Math.max(
    c.high - c.low,
    Math.abs(c.high - candles[i].close),
    Math.abs(c.low - candles[i].close)
  ));
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return atr;
}

// ── VOLUME SPIKE ─────────────────────────────────────────────────────────────
function isVolumeSpike(candles, period = 20, multiplier = 1.5) {
  if (candles.length < period + 1) return false;
  const recent = candles[candles.length - 1].volume;
  const avgVol = candles.slice(-period - 1, -1).reduce((a, c) => a + c.volume, 0) / period;
  return recent >= avgVol * multiplier;
}

// ── MARKET STRUCTURE ─────────────────────────────────────────────────────────
function detectStructure(candles) {
  if (candles.length < 20) return { trend: 'UNKNOWN', highs: [], lows: [] };
  const slice = candles.slice(-30);
  const highs = [], lows = [];
  for (let i = 2; i < slice.length - 2; i++) {
    if (slice[i].high > slice[i-1].high && slice[i].high > slice[i-2].high &&
        slice[i].high > slice[i+1].high && slice[i].high > slice[i+2].high)
      highs.push({ idx: i, price: slice[i].high });
    if (slice[i].low < slice[i-1].low && slice[i].low < slice[i-2].low &&
        slice[i].low < slice[i+1].low && slice[i].low < slice[i+2].low)
      lows.push({ idx: i, price: slice[i].low });
  }

  let trend = 'RANGING';
  if (highs.length >= 2 && lows.length >= 2) {
    const hh = highs[highs.length-1].price > highs[highs.length-2].price;
    const hl = lows[lows.length-1].price > lows[lows.length-2].price;
    const lh = highs[highs.length-1].price < highs[highs.length-2].price;
    const ll = lows[lows.length-1].price < lows[lows.length-2].price;
    if (hh && hl) trend = 'UPTREND';
    else if (lh && ll) trend = 'DOWNTREND';
  }
  return { trend, highs, lows };
}

// ── BOS (BREAK OF STRUCTURE) ─────────────────────────────────────────────────
function detectBOS(candles, structure) {
  if (!structure || !structure.highs.length || !structure.lows.length) return null;
  const last = candles[candles.length - 1];
  const prevSwingHigh = structure.highs[structure.highs.length - 1]?.price;
  const prevSwingLow  = structure.lows[structure.lows.length - 1]?.price;
  if (prevSwingHigh && last.close > prevSwingHigh) return 'BULLISH_BOS';
  if (prevSwingLow  && last.close < prevSwingLow)  return 'BEARISH_BOS';
  return null;
}

// ── SUPPORT/RESISTANCE ───────────────────────────────────────────────────────
function findKeyLevels(candles, count = 5) {
  const levels = [];
  const slice = candles.slice(-100);
  for (let i = 3; i < slice.length - 3; i++) {
    const pivot = slice[i];
    const isResist = [1,2,3].every(o => pivot.high >= slice[i-o].high && pivot.high >= slice[i+o].high);
    const isSupport = [1,2,3].every(o => pivot.low <= slice[i-o].low && pivot.low <= slice[i+o].low);
    if (isResist) levels.push({ type: 'RESISTANCE', price: pivot.high });
    if (isSupport) levels.push({ type: 'SUPPORT', price: pivot.low });
  }
  // deduplicate levels within 0.5% of each other
  const merged = [];
  levels.sort((a, b) => a.price - b.price).forEach(l => {
    if (!merged.length || Math.abs(l.price - merged[merged.length-1].price) / merged[merged.length-1].price > 0.005)
      merged.push(l);
  });
  return merged.slice(-count * 2);
}

// ── RSI DIVERGENCE ───────────────────────────────────────────────────────────
function detectDivergence(candles, rsi) {
  if (rsi.length < 10) return null;
  const priceSlice = candles.slice(-10).map(c => c.close);
  const rsiSlice = rsi.slice(-10);
  const priceFalling = priceSlice[9] < priceSlice[0];
  const priceRising  = priceSlice[9] > priceSlice[0];
  const rsiFalling   = rsiSlice[9] < rsiSlice[0];
  const rsiRising    = rsiSlice[9] > rsiSlice[0];
  if (priceFalling && rsiRising)  return 'BULLISH_DIVERGENCE';
  if (priceRising  && rsiFalling) return 'BEARISH_DIVERGENCE';
  return null;
}

module.exports = { calcEMA, calcRSI, calcATR, isVolumeSpike, detectStructure, detectBOS, findKeyLevels, detectDivergence };
