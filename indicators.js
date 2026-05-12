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

// ── FAIR VALUE GAP (FVG) ────────────────────────────────────────────────────
function detectFVG(candles, atr = 0) {
  const fvgs = [];
  if (candles.length < 3) return fvgs;
  
  // Min size filter: FVG must be at least 20% of ATR to be significant
  const minSize = atr * 0.2;

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i-2];
    const c3 = candles[i];
    
    // Bullish FVG
    if (c1.high < c3.low) {
      const size = c3.low - c1.high;
      if (size >= minSize) {
        fvgs.push({ type: 'BULLISH_FVG', top: c3.low, bottom: c1.high, index: i-1, size, mitigated: false });
      }
    }
    // Bearish FVG
    if (c1.low > c3.high) {
      const size = c1.low - c3.high;
      if (size >= minSize) {
        fvgs.push({ type: 'BEARISH_FVG', top: c1.low, bottom: c3.high, index: i-1, size, mitigated: false });
      }
    }
  }
  return fvgs;
}

// ── ORDER BLOCKS (OB) ───────────────────────────────────────────────────────
function detectOrderBlocks(candles) {
  const obs = [];
  if (candles.length < 5) return obs;
  const avgBody = candles.slice(-20).reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / 20;

  for (let i = 1; i < candles.length - 2; i++) {
    const impulsive1 = candles[i+1];
    const impulsive2 = candles[i+2];
    const obCandle = candles[i];

    // Strong Bullish Move + Volume Confirmation
    if (impulsive1.close > impulsive1.open && impulsive2.close > impulsive2.open && 
        (impulsive1.close - impulsive1.open) > avgBody * 1.5 &&
        impulsive1.volume > (candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 20)) {
      if (obCandle.close < obCandle.open) {
        obs.push({ type: 'BULLISH_OB', top: obCandle.high, bottom: obCandle.low, index: i, mitigated: false });
      }
    }
    // Strong Bearish Move + Volume Confirmation
    if (impulsive1.close < impulsive1.open && impulsive2.close < impulsive2.open && 
        (impulsive1.open - impulsive1.close) > avgBody * 1.5 &&
        impulsive1.volume > (candles.slice(-20, -1).reduce((s, c) => s + c.volume, 0) / 20)) {
      if (obCandle.close > obCandle.open) {
        obs.push({ type: 'BEARISH_OB', top: obCandle.high, bottom: obCandle.low, index: i, mitigated: false });
      }
    }
  }
  return obs;
}

// ── ADX (AVERAGE DIRECTIONAL INDEX) ─────────────────────────────────────────
function calcADX(candles, period = 14) {
  if (candles.length < period * 2 + 1) return 0;
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i], prev = candles[i - 1];
    trs.push(Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close)));
    const up = curr.high - prev.high, dn = prev.low - curr.low;
    plusDMs.push(up > dn && up > 0 ? up : 0);
    minusDMs.push(dn > up && dn > 0 ? dn : 0);
  }
  let sTR = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let sPDM = plusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  let sMDM = minusDMs.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr = [];
  for (let i = period; i < trs.length; i++) {
    sTR  = sTR  - sTR  / period + trs[i];
    sPDM = sPDM - sPDM / period + plusDMs[i];
    sMDM = sMDM - sMDM / period + minusDMs[i];
    const pDI = sTR > 0 ? (sPDM / sTR) * 100 : 0;
    const mDI = sTR > 0 ? (sMDM / sTR) * 100 : 0;
    const diSum = pDI + mDI;
    dxArr.push(diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0);
  }
  if (dxArr.length < period) return 0;
  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxArr.length; i++) adx = (adx * (period - 1) + dxArr[i]) / period;
  return adx;
}

module.exports = {
  calcEMA, calcRSI, calcATR, calcADX, isVolumeSpike, detectStructure,
  detectBOS, findKeyLevels, detectDivergence, detectFVG, detectOrderBlocks
};
