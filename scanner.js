'use strict';
const { getKlines } = require('./binance');
const {
  calcEMA, calcRSI, calcATR, calcADX, calcMACD, calcStochRSI,
  isVolumeSpike, detectStructure, detectBOS, detectCHoCH,
  calcCVD, detectCVDDivergence,
  calcFibLevels, findKeyLevels, detectDivergence, detectFVG, detectOrderBlocks,
  detectCandlePattern, detectLiquiditySweep
} = require('./indicators');
const { fmt } = require('./utils');

const TIER_CONFIG = {
  1: { minConfluence: 5, adxMin: 12, minRR: 1.8, minScoreGap: 1 },
  2: { minConfluence: 5, adxMin: 12, minRR: 1.8, minScoreGap: 1 },
  3: { minConfluence: 5, adxMin: 12, minRR: 1.8, minScoreGap: 1 },
  4: { minConfluence: 5, adxMin: 12, minRR: 1.8, minScoreGap: 1 },
};

const PAIRS = [
  // Tier 1 — Mega Cap
  { symbol: 'BTCUSDT',       name: 'BTC/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 1 },
  { symbol: 'ETHUSDT',       name: 'ETH/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 1 },
  { symbol: 'SOLUSDT',       name: 'SOL/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 1 },
  { symbol: 'BNBUSDT',       name: 'BNB/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 1 },
  { symbol: 'XRPUSDT',       name: 'XRP/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 1 },
  // Tier 2 — Large Cap
  { symbol: 'DOGEUSDT',      name: 'DOGE/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'ADAUSDT',       name: 'ADA/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'AVAXUSDT',      name: 'AVAX/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'LINKUSDT',      name: 'LINK/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'SUIUSDT',       name: 'SUI/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'DOTUSDT',       name: 'DOT/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'TRXUSDT',       name: 'TRX/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'NEARUSDT',      name: 'NEAR/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'APTUSDT',       name: 'APT/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  { symbol: 'TONUSDT',       name: 'TON/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 2 },
  // Tier 3 — Established Altcoins
  { symbol: 'LTCUSDT',       name: 'LTC/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'ATOMUSDT',      name: 'ATOM/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'INJUSDT',       name: 'INJ/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'OPUSDT',        name: 'OP/USDT',     htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'ARBUSDT',       name: 'ARB/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'UNIUSDT',       name: 'UNI/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'AAVEUSDT',      name: 'AAVE/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'LDOUSDT',       name: 'LDO/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'HYPEUSDT',      name: 'HYPE/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'TAOUSDT',       name: 'TAO/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'FETUSDT',       name: 'FET/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'RUNEUSDT',      name: 'RUNE/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'STXUSDT',       name: 'STX/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'JUPUSDT',       name: 'JUP/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  { symbol: 'FILUSDT',       name: 'FIL/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 3 },
  // Tier 4 — High Momentum
  { symbol: 'WIFUSDT',       name: 'WIF/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: '1000PEPEUSDT',  name: 'PEPE/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: '1000SHIBUSDT',  name: 'SHIB/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: '1000BONKUSDT',  name: 'BONK/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'RENDERUSDT',    name: 'RENDER/USDT',  htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'ENAUSDT',       name: 'ENA/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'TIAUSDT',       name: 'TIA/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'SEIUSDT',       name: 'SEI/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'EIGENUSDT',     name: 'EIGEN/USDT',  htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'HBARUSDT',      name: 'HBAR/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'WLDUSDT',       name: 'WLD/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'GMXUSDT',       name: 'GMX/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'DYDXUSDT',      name: 'DYDX/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'NOTUSDT',       name: 'NOT/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'STRKUSDT',      name: 'STRK/USDT',   htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'ZKUSDT',        name: 'ZK/USDT',     htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'MATICUSDT',     name: 'MATIC/USDT',  htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'FTMUSDT',       name: 'FTM/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'SNXUSDT',       name: 'SNX/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
  { symbol: 'ZECUSDT',       name: 'ZEC/USDT',    htf: '4h', ltf: '1h', exec: '15m', tier: 4 },
];

function getSessionInfo() {
  const wibHour = (new Date().getUTCHours() + 7) % 24;
  if (wibHour >= 13 && wibHour < 17) return { name: 'London Session 🇬🇧', optimal: true };
  if (wibHour >= 20 || wibHour < 1)  return { name: 'New York Session 🇺🇸', optimal: true };
  if (wibHour >= 8  && wibHour < 13) return { name: 'Asian Session 🌏', optimal: false };
  return { name: 'Off Session 💤', optimal: false };
}

function calcStructureSL(price, direction, ltfStructure, atr, htfStructure = null) {
  const buffer = 0.006;
  // Try HTF structure first (stronger anchor), then fall back to LTF
  const structures = htfStructure ? [htfStructure, ltfStructure] : [ltfStructure];

  if (direction === 'LONG') {
    for (const structure of structures) {
      const validLows = structure.lows
        .filter(l => l.price < price)
        .sort((a, b) => b.idx - a.idx);
      if (validLows.length > 0) {
        const sl = validLows[0].price * (1 - buffer);
        if (price - sl <= atr * 3) return sl;
      }
    }
    return price - atr * 2.0;
  } else {
    for (const structure of structures) {
      const validHighs = structure.highs
        .filter(h => h.price > price)
        .sort((a, b) => b.idx - a.idx);
      if (validHighs.length > 0) {
        const sl = validHighs[0].price * (1 + buffer);
        if (sl - price <= atr * 3) return sl;
      }
    }
    return price + atr * 2.0;
  }
}

function classifyMarketPhase(adx, atrPct, htfBias) {
  if (adx > 35 && atrPct > 3)          return 'CLIMAX 🔥';
  if (adx >= 25 && htfBias === 'BULLISH') return 'MARKUP 📈';
  if (adx >= 25 && htfBias === 'BEARISH') return 'MARKDOWN 📉';
  if (adx < 20)                         return 'ACCUMULATION/DISTRIBUTION ⏳';
  return 'TRANSITION ↔️';
}

function getRiskSuggestion(score) {
  if (score >= 13) return '1.5% per trade 💪';
  if (score >= 10) return '1.0% per trade ✅';
  return '0.5% per trade ⚠️';
}

function checkFvgMitigation(fvgs, candles) {
  return fvgs.filter(fvg => {
    const subsequent = candles.slice(fvg.index + 1);
    for (const c of subsequent) {
      if (fvg.type === 'BULLISH_FVG' && c.low <= fvg.bottom) return false;
      if (fvg.type === 'BEARISH_FVG' && c.high >= fvg.top) return false;
    }
    return true;
  });
}

function isVolumeRising(candles) {
  if (candles.length < 10) return false;
  const recent5 = candles.slice(-5).reduce((s, c) => s + c.volume, 0);
  const prev5   = candles.slice(-10, -5).reduce((s, c) => s + c.volume, 0);
  return recent5 > prev5;
}

async function analyzeAsset(pair, btcTrend1h, btcTrend4h = 'NEUTRAL') {
  const [htfCandles, ltfCandles, execCandles] = await Promise.all([
    getKlines(pair.symbol, pair.htf, 200),
    getKlines(pair.symbol, pair.ltf, 200),
    getKlines(pair.symbol, pair.exec, 200),
  ]);

  if (!htfCandles.length || !ltfCandles.length || !execCandles.length) return { signal: null, debug: { blockedBy: 'Data candle tidak tersedia' } };

  const htfCloses = htfCandles.map(c => c.close);
  const ltfCloses = ltfCandles.map(c => c.close);

  // HTF indicators
  const htfEma50  = calcEMA(htfCloses, 50);
  const htfEma200 = calcEMA(htfCloses, 200);
  const htfRsi    = calcRSI(htfCloses, 14);
  const htfStruct = detectStructure(htfCandles);
  const htfAtr    = calcATR(htfCandles, 14);

  // LTF indicators
  const ltfEma50  = calcEMA(ltfCloses, 50);
  const ltfEma200 = calcEMA(ltfCloses, 200);
  const ltfRsi    = calcRSI(ltfCloses, 14);
  const ltfStruct = detectStructure(ltfCandles);
  const ltfBos    = detectBOS(ltfCandles, ltfStruct);
  const ltfChoch  = detectCHoCH(ltfCandles, ltfStruct);
  const ltfDiv    = detectDivergence(ltfCandles, ltfRsi);
  const ltfVolume = isVolumeSpike(ltfCandles, 20, 1.5);
  const ltfCVD    = calcCVD(ltfCandles);
  const ltfCVDDiv = detectCVDDivergence(ltfCandles, ltfCVD);
  const cvdCurrent = ltfCVD[ltfCVD.length - 1].cumDelta;
  const cvdPrev5   = ltfCVD[ltfCVD.length - 6]?.cumDelta ?? cvdCurrent;
  const cvdRising  = cvdCurrent > cvdPrev5;
  const cvdFalling = cvdCurrent < cvdPrev5;
  const ltfAtr    = calcATR(ltfCandles, 14);
  const keyLevels = findKeyLevels(htfCandles, 5);

  // SMC Detection (on LTF)
  const ltfFvgs = detectFVG(ltfCandles);
  const ltfObs  = detectOrderBlocks(ltfCandles);

  // SMC Detection (on HTF — 4H OB/FVG for higher-weight confluence)
  const htfFvgs = detectFVG(htfCandles);
  const htfObs  = detectOrderBlocks(htfCandles);

  // ADX — trend strength filter
  const ltfAdx = calcADX(ltfCandles, 14);

  // Active FVGs: unmitigated + recent 30 candles (tightened from 50)
  const activeFvgs = checkFvgMitigation(ltfFvgs, ltfCandles)
    .filter(fvg => fvg.index >= ltfCandles.length - 30);

  // Recent OBs: last 20 candles only (tightened from 30)
  const recentObs = ltfObs.filter(ob => ob.index >= ltfCandles.length - 20);

  // Active HTF FVGs: unmitigated + recent 20 candles
  const activeHtfFvgs = checkFvgMitigation(htfFvgs, htfCandles)
    .filter(fvg => fvg.index >= htfCandles.length - 20);

  // Recent HTF OBs: last 15 candles only
  const recentHtfObs = htfObs.filter(ob => ob.index >= htfCandles.length - 15);

  // Execution Trigger (m15)
  const execStruct = detectStructure(execCandles);
  const execBos    = detectBOS(execCandles, execStruct);
  const execChoch  = detectCHoCH(execCandles, execStruct);
  const execRsi      = calcRSI(execCandles.map(c => c.close), 14);
  const execDiv      = detectDivergence(execCandles, execRsi);

  // Tier 2 — new indicators
  const ltfMacd      = calcMACD(ltfCloses);
  const execStochRsi = calcStochRSI(execCandles.map(c => c.close));
  const htfPattern   = detectCandlePattern(htfCandles);

  const price = ltfCandles[ltfCandles.length - 1].close;

  // Nearest S/R levels for display (closest below/above price)
  const nearestSupport    = keyLevels.filter(l => l.type === 'SUPPORT'    && l.price < price).sort((a, b) => b.price - a.price)[0] || null;
  const nearestResistance = keyLevels.filter(l => l.type === 'RESISTANCE' && l.price > price).sort((a, b) => a.price - b.price)[0] || null;

  // Fibonacci Retracement from HTF swing structure
  // Pair swing high & low from the same impulse move (last two pivots of different types)
  let fibLevels = [], fibNearLevel = null, fibBullish = false;
  let fibSwingLow = null, fibSwingHigh = null;
  if (htfStruct.highs.length >= 1 && htfStruct.lows.length >= 1) {
    const allPivots = [
      ...htfStruct.highs.map(h => ({ ...h, type: 'HIGH' })),
      ...htfStruct.lows.map(l => ({ ...l, type: 'LOW' })),
    ].sort((a, b) => a.idx - b.idx);

    const p2 = allPivots[allPivots.length - 1];
    let p1 = null;
    for (let i = allPivots.length - 2; i >= 0; i--) {
      if (allPivots[i].type !== p2.type) { p1 = allPivots[i]; break; }
    }

    if (p1 && p2) {
      fibSwingLow  = p1.type === 'LOW'  ? p1.price : p2.price;
      fibSwingHigh = p1.type === 'HIGH' ? p1.price : p2.price;
      fibBullish   = p1.type === 'LOW';
      fibLevels    = calcFibLevels(fibSwingLow, fibSwingHigh);
      // 0.8% tolerance — fib zones are conceptual, not exact
      fibNearLevel = fibLevels.find(f => Math.abs(price - f.price) / price < 0.008);
    }
  }

  // Tier 3 — structural additions
  const ltfSweep    = detectLiquiditySweep(ltfCandles, ltfStruct);
  const sessionInfo = getSessionInfo();
  const atrPct      = (ltfAtr / price) * 100;

  const curRsi     = ltfRsi[ltfRsi.length - 1];
  const curHtfRsi  = htfRsi.length > 0 ? htfRsi[htfRsi.length - 1] : 50;
  const curHtfE50  = htfEma50[htfEma50.length - 1];
  const curHtfE200 = htfEma200[htfEma200.length - 1];
  const curLtfE50  = ltfEma50[ltfEma50.length - 1];
  const curLtfE200 = ltfEma200[ltfEma200.length - 1];

  // ── HTF BIAS ─────────────────────────────────────────────────────────────
  let htfBias = 'NEUTRAL';
  if (curHtfE50 > curHtfE200 && htfStruct.trend !== 'DOWNTREND') htfBias = 'BULLISH';
  if (curHtfE50 < curHtfE200 && htfStruct.trend !== 'UPTREND')   htfBias = 'BEARISH';

  // ── CONFLUENCE SCORING (WEIGHTED) ──────────────────────────────────────────
  let longScore = 0, shortScore = 0;
  const longFactors = [], shortFactors = [];

  // 0a. BTC 4H Correlation — macro bias (Highest Weight)
  if (btcTrend4h === 'BULLISH') {
    longScore += 3; longFactors.push('BTC 4H Bullish 🚀');
    shortScore -= 3;
  } else if (btcTrend4h === 'BEARISH') {
    shortScore += 3; shortFactors.push('BTC 4H Bearish 📉');
    longScore -= 3;
  }

  // 0b. BTC 1H Correlation — intraday momentum (High Weight)
  if (btcTrend1h === 'BULLISH') {
    longScore += 2; longFactors.push('BTC 1H Bullish 🚀');
    shortScore -= 2;
  } else if (btcTrend1h === 'BEARISH') {
    shortScore += 2; shortFactors.push('BTC 1H Bearish 📉');
    longScore -= 2;
  }

  // 1. HTF trend alignment (High Weight)
  if (htfBias === 'BULLISH') { longScore += 3; longFactors.push('HTF Bullish Bias 🚀'); }
  if (htfBias === 'BEARISH') { shortScore += 3; shortFactors.push('HTF Bearish Bias 📉'); }

  // 1b. HTF RSI extreme filter — penalti hanya di zona sangat ekstrim
  if (curHtfRsi > 80) { longScore  -= 1; }
  if (curHtfRsi < 20) { shortScore -= 1; }

  // 2. EMA alignment LTF (Medium Weight)
  if (price > curLtfE50 && curLtfE50 > curLtfE200) { longScore += 2; longFactors.push('LTF Bullish EMA Alignment ✅'); }
  if (price < curLtfE50 && curLtfE50 < curLtfE200) { shortScore += 2; shortFactors.push('LTF Bearish EMA Alignment ✅'); }

  // 3. RSI condition (Low Weight)
  if (curRsi < 45 && curRsi > 15) { longScore += 1; longFactors.push(`RSI Low (${fmt(curRsi, 1)}) ✅`); }
  if (curRsi > 55 && curRsi < 85) { shortScore += 1; shortFactors.push(`RSI High (${fmt(curRsi, 1)}) ✅`); }

  // 4. RSI divergence — hanya valid di zona RSI ekstrim (Medium Weight)
  if (ltfDiv === 'BULLISH_DIVERGENCE' && curRsi < 48) { longScore += 2; longFactors.push('Bullish RSI Divergence 🔥'); }
  if (ltfDiv === 'BEARISH_DIVERGENCE' && curRsi > 52) { shortScore += 2; shortFactors.push('Bearish RSI Divergence 🔥'); }

  // 5. BOS (Medium Weight)
  if (ltfBos === 'BULLISH_BOS') { longScore += 2; longFactors.push('Bullish BOS Confirmed ✅'); }
  if (ltfBos === 'BEARISH_BOS') { shortScore += 2; shortFactors.push('Bearish BOS Confirmed ✅'); }

  // 5b. CHoCH — early reversal signal, before BOS is confirmed (Medium Weight)
  if (ltfChoch === 'BULLISH_CHOCH') { longScore  += 2; longFactors.push('Bullish CHoCH — Structure Shift 🔄'); }
  if (ltfChoch === 'BEARISH_CHOCH') { shortScore += 2; shortFactors.push('Bearish CHoCH — Structure Shift 🔄'); }

  // 6. Volume spike — direction from CVD delta of the spike candle, not candle color
  if (ltfVolume) {
    const lastDelta = ltfCVD[ltfCVD.length - 1].delta;
    if (lastDelta > 0) { longScore  += 2; longFactors.push('Bullish Volume Spike ⚡'); }
    else               { shortScore += 2; shortFactors.push('Bearish Volume Spike ⚡'); }
  } else if (pair.tier >= 3) {
    longScore  -= 1;
    shortScore -= 1;
  }

  // 6b. CVD — Divergence (+2) and trend confirmation (+1)
  if (ltfCVDDiv === 'BULLISH_CVD_DIV') { longScore  += 2; longFactors.push('Bullish CVD Divergence — Hidden Buying 📊'); }
  if (ltfCVDDiv === 'BEARISH_CVD_DIV') { shortScore += 2; shortFactors.push('Bearish CVD Divergence — Hidden Selling 📊'); }
  if (!ltfCVDDiv && cvdRising)  { longScore  += 1; longFactors.push('CVD Rising — Net Buying Pressure 📊'); }
  if (!ltfCVDDiv && cvdFalling) { shortScore += 1; shortFactors.push('CVD Falling — Net Selling Pressure 📊'); }

  // 7. Order Block Touch — recent OBs only (High Weight)
  const nearBullOb = recentObs.find(ob => ob.type === 'BULLISH_OB' && price <= ob.top && price >= ob.bottom);
  const nearBearOb = recentObs.find(ob => ob.type === 'BEARISH_OB' && price <= ob.top && price >= ob.bottom);
  if (nearBullOb) { longScore += 3; longFactors.push(`Price in Bullish OB zone ✅`); }
  if (nearBearOb) { shortScore += 3; shortFactors.push(`Price in Bearish OB zone ✅`); }

  // 8. FVG Filling — unmitigated only (Medium Weight)
  const nearBullFvg = activeFvgs.find(fvg => fvg.type === 'BULLISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  const nearBearFvg = activeFvgs.find(fvg => fvg.type === 'BEARISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  if (nearBullFvg) { longScore += 2; longFactors.push(`Price filling Bullish FVG ✅`); }
  if (nearBearFvg) { shortScore += 2; shortFactors.push(`Price filling Bearish FVG ✅`); }

  // 8b. HTF Order Block Touch 4H — sinyal terkuat SMC (Highest Weight)
  const nearHtfBullOb = recentHtfObs.find(ob => ob.type === 'BULLISH_OB' && price <= ob.top && price >= ob.bottom);
  const nearHtfBearOb = recentHtfObs.find(ob => ob.type === 'BEARISH_OB' && price <= ob.top && price >= ob.bottom);
  if (nearHtfBullOb) { longScore  += 3; longFactors.push('Price in HTF Bullish OB 4H 🏦'); }
  if (nearHtfBearOb) { shortScore += 3; shortFactors.push('Price in HTF Bearish OB 4H 🏦'); }

  // 8c. HTF FVG Filling 4H (High Weight)
  const nearHtfBullFvg = activeHtfFvgs.find(fvg => fvg.type === 'BULLISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  const nearHtfBearFvg = activeHtfFvgs.find(fvg => fvg.type === 'BEARISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  if (nearHtfBullFvg) { longScore  += 2; longFactors.push('Price filling HTF Bullish FVG 4H 🏦'); }
  if (nearHtfBearFvg) { shortScore += 2; shortFactors.push('Price filling HTF Bearish FVG 4H 🏦'); }

  // 9. Key level proximity — strength-weighted (WEAK +1, MEDIUM +2, STRONG +3)
  const nearSupport = keyLevels.find(l => l.type === 'SUPPORT' && Math.abs(price - l.price) / price < 0.005);
  const nearResist  = keyLevels.find(l => l.type === 'RESISTANCE' && Math.abs(price - l.price) / price < 0.005);
  if (nearSupport) {
    const bonus = nearSupport.strength === 'STRONG' ? 3 : nearSupport.strength === 'MEDIUM' ? 2 : 1;
    longScore += bonus;
    longFactors.push(`Near Key Support $${fmt(nearSupport.price)} (${nearSupport.strength}, ${nearSupport.touches}x tested) ✅`);
  }
  if (nearResist) {
    const bonus = nearResist.strength === 'STRONG' ? 3 : nearResist.strength === 'MEDIUM' ? 2 : 1;
    shortScore += bonus;
    shortFactors.push(`Near Key Resistance $${fmt(nearResist.price)} (${nearResist.strength}, ${nearResist.touches}x tested) ✅`);
  }

  // 9b. Fibonacci retracement zone (61.8% = +2, others = +1)
  if (fibNearLevel) {
    const bonus = fibNearLevel.ratio === 0.618 ? 2 : 1;
    if (fibBullish) {
      longScore  += bonus;
      longFactors.push(`Fib ${fibNearLevel.label} Support $${fmt(fibNearLevel.price)} 📐`);
    } else {
      shortScore += bonus;
      shortFactors.push(`Fib ${fibNearLevel.label} Resistance $${fmt(fibNearLevel.price)} 📐`);
    }
  }

  // 10. MACD Momentum — LTF (Medium Weight)
  if (ltfMacd.histogram > 0 && ltfMacd.macd > ltfMacd.signal) {
    longScore += 2; longFactors.push('MACD Bullish Momentum 📈');
  } else if (ltfMacd.histogram < 0 && ltfMacd.macd < ltfMacd.signal) {
    shortScore += 2; shortFactors.push('MACD Bearish Momentum 📉');
  }
  if (ltfMacd.histogram > 0 && ltfMacd.histogram > ltfMacd.prevHistogram) {
    longScore += 1; longFactors.push('MACD Histogram Expanding ✅');
  } else if (ltfMacd.histogram < 0 && ltfMacd.histogram < ltfMacd.prevHistogram) {
    shortScore += 1; shortFactors.push('MACD Histogram Expanding ✅');
  }

  // 11. Stochastic RSI Entry Timing — exec TF 15m (Medium Weight)
  if (execStochRsi.prevK < 20 && execStochRsi.k > execStochRsi.prevK) {
    longScore += 2; longFactors.push('StochRSI Cross Oversold 🔥');
  } else if (execStochRsi.prevK > 80 && execStochRsi.k < execStochRsi.prevK) {
    shortScore += 2; shortFactors.push('StochRSI Cross Overbought 🔥');
  }

  // 12. HTF Candle Pattern 4H (Medium Weight)
  if (htfPattern === 'BULLISH_ENGULFING' || htfPattern === 'HAMMER' || htfPattern === 'BULLISH_PIN_BAR') {
    longScore += 2; longFactors.push(`HTF Pattern: ${htfPattern} 🕯️`);
  } else if (htfPattern === 'BEARISH_ENGULFING' || htfPattern === 'SHOOTING_STAR' || htfPattern === 'BEARISH_PIN_BAR') {
    shortScore += 2; shortFactors.push(`HTF Pattern: ${htfPattern} 🕯️`);
  }

  // 13. Liquidity Sweep — Stop Hunt Detection (Highest Weight, setup terkuat)
  if (ltfSweep === 'BULLISH_SWEEP') { longScore  += 3; longFactors.push('Bullish Liquidity Sweep 🎯'); }
  if (ltfSweep === 'BEARISH_SWEEP') { shortScore += 3; shortFactors.push('Bearish Liquidity Sweep 🎯'); }

  // 14. 3 Consecutive H1 Candles — momentum berkelanjutan (Medium Weight)
  const last3Ltf   = ltfCandles.slice(-3);
  const allBullish3 = last3Ltf.every(c => c.close > c.open);
  const allBearish3 = last3Ltf.every(c => c.close < c.open);
  if (allBullish3) { longScore  += 2; longFactors.push('3 Bullish Candles H1 ✅'); }
  if (allBearish3) { shortScore += 2; shortFactors.push('3 Bearish Candles H1 ✅'); }

  // 15. H1 Spike Kuat — body > 2x rata-rata body 20 candle (Low Weight)
  const lastLtfCandle = ltfCandles[ltfCandles.length - 1];
  const lastBody      = Math.abs(lastLtfCandle.close - lastLtfCandle.open);
  const avgBody       = ltfCandles.slice(-20).reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 20;
  if (lastBody > avgBody * 2) {
    if (lastLtfCandle.close > lastLtfCandle.open) { longScore  += 1; longFactors.push('H1 Bullish Spike ⚡'); }
    else                                           { shortScore += 1; shortFactors.push('H1 Bearish Spike ⚡'); }
  }

  // ── SIGNAL GENERATION ────────────────────────────────────────────────────
  const cfg = TIER_CONFIG[pair.tier] || TIER_CONFIG[1];

  // ADX: peringatan jika tren lemah, tidak lagi hard block
  const adxWarning = ltfAdx < cfg.adxMin;

  // CLIMAX phase block: trend-following setups di fase exhaustion cenderung gagal
  const isClimax = ltfAdx > 35 && atrPct > 3;
  if (isClimax) {
    if (htfBias === 'BULLISH') longScore  -= 3;
    if (htfBias === 'BEARISH') shortScore -= 3;
  }

  // Reversal path: bypass trend alignment jika ada sinyal reversal kuat (Sweep atau Divergence)
  const longReversalValid  = (ltfSweep === 'BULLISH_SWEEP' || ltfDiv === 'BULLISH_DIVERGENCE' || ltfChoch === 'BULLISH_CHOCH') && longScore >= cfg.minConfluence;
  const shortReversalValid = (ltfSweep === 'BEARISH_SWEEP' || ltfDiv === 'BEARISH_DIVERGENCE' || ltfChoch === 'BEARISH_CHOCH') && shortScore >= cfg.minConfluence;

  // Trend alignment
  const longTrendOk  = htfBias !== 'BEARISH' && ltfStruct.trend !== 'DOWNTREND';
  const shortTrendOk = htfBias !== 'BULLISH' && ltfStruct.trend !== 'UPTREND';
  const ltfRanging   = ltfStruct.trend === 'RANGING';
  const longAllowed  = ltfRanging || longTrendOk  || longReversalValid;
  const shortAllowed = ltfRanging || shortTrendOk || shortReversalValid;

  let signal = null;

  if (longScore >= cfg.minConfluence && longScore >= shortScore + cfg.minScoreGap && longAllowed) {
    const isReversal      = !longTrendOk && !ltfRanging && longReversalValid;
    const isLongConfirmed = (execBos === 'BULLISH_BOS' || execDiv === 'BULLISH_DIVERGENCE' || execChoch === 'BULLISH_CHOCH');

    const atr    = ltfAtr;
    const slRaw  = calcStructureSL(price, 'LONG', ltfStruct, atr, htfStruct);
    let sl       = parseFloat(slRaw.toFixed(price > 1000 ? 0 : 4));
    if (price - sl < atr * 1.2) sl = parseFloat((price - atr * 2.5).toFixed(price > 1000 ? 0 : 4));
    // TP berbasis actual risk agar RR selalu proporsional dengan SL yang dipakai
    const riskForTp = price - sl;
    const tp1 = parseFloat((price + riskForTp * (isReversal ? 2.0 : 2.5)).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price + riskForTp * (isReversal ? 3.5 : 4.5)).toFixed(price > 1000 ? 0 : 4));

    const entryAggressive = price;
    let entryConservative = price;
    if (nearBullOb)       entryConservative = (nearBullOb.top + nearBullOb.bottom) / 2;
    else if (nearBullFvg) entryConservative = nearBullFvg.top;
    entryConservative = parseFloat(entryConservative.toFixed(price > 1000 ? 0 : 4));

    const riskAgg  = entryAggressive - sl;
    const rrAgg    = parseFloat(((tp1 - entryAggressive) / riskAgg).toFixed(2));
    const riskCons = entryConservative - sl;
    const rrCons   = parseFloat(((tp1 - entryConservative) / riskCons).toFixed(2));

    const execConfirmLabel = isLongConfirmed
      ? `m15 Confirmation: ${execBos === 'BULLISH_BOS' ? 'BOS' : execChoch === 'BULLISH_CHOCH' ? 'CHoCH' : 'Divergence'} ✅`
      : 'm15 Konfirmasi: Belum Terkonfirmasi ⚠️';

    if (rrAgg >= cfg.minRR && sl > 0) {
      const marketPhase    = classifyMarketPhase(ltfAdx, atrPct, htfBias);
      const riskSuggestion = getRiskSuggestion(longScore);
      const beLevel = parseFloat((entryAggressive + (tp1 - entryAggressive) * 0.5).toFixed(price > 1000 ? 0 : 4));
      signal = {
        pair: pair.name, direction: 'LONG', tier: pair.tier,
        entryAggressive, entryConservative, sl, tp1, tp2, beLevel,
        rrAgg, rrCons,
        confluenceScore: longScore, factors: [...longFactors, execConfirmLabel],
        rsi: curRsi, htfBias, htfTrend: htfStruct.trend, ltfTrend: ltfStruct.trend,
        bos: ltfBos, choch: ltfChoch, divergence: ltfDiv, volumeSpike: ltfVolume,
        cvdDivergence: ltfCVDDiv, cvdCurrent, cvdRising,
        nearLevel: nearSupport,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
        liquiditySweep: ltfSweep, marketPhase, riskSuggestion,
        sessionInfo, adx: ltfAdx,
        invalidationLevel: sl,
        isReversal, adxWarning,
        nearestSupport, nearestResistance,
        fibLevels, fibNearLevel, fibSwingLow, fibSwingHigh, fibBullish,
      };
    }
  } else if (shortScore >= cfg.minConfluence && shortScore >= longScore + cfg.minScoreGap && shortAllowed) {
    const isReversal       = !shortTrendOk && !ltfRanging && shortReversalValid;
    const isShortConfirmed = (execBos === 'BEARISH_BOS' || execDiv === 'BEARISH_DIVERGENCE' || execChoch === 'BEARISH_CHOCH');

    const atr        = ltfAtr;
    const slRawShort = calcStructureSL(price, 'SHORT', ltfStruct, atr, htfStruct);
    let slShort      = parseFloat(slRawShort.toFixed(price > 1000 ? 0 : 4));
    if (slShort - price < atr * 1.2) slShort = parseFloat((price + atr * 2.5).toFixed(price > 1000 ? 0 : 4));
    // TP berbasis actual risk agar RR selalu proporsional dengan SL yang dipakai
    const riskForTpShort = slShort - price;
    const tp1 = parseFloat((price - riskForTpShort * (isReversal ? 2.0 : 2.5)).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price - riskForTpShort * (isReversal ? 3.5 : 4.5)).toFixed(price > 1000 ? 0 : 4));

    const entryAggressive = price;
    let entryConservative = price;
    if (nearBearOb)       entryConservative = (nearBearOb.top + nearBearOb.bottom) / 2;
    else if (nearBearFvg) entryConservative = nearBearFvg.bottom;
    entryConservative = parseFloat(entryConservative.toFixed(price > 1000 ? 0 : 4));

    const riskAgg  = slShort - entryAggressive;
    const rrAgg    = parseFloat(((entryAggressive - tp1) / riskAgg).toFixed(2));
    const riskCons = slShort - entryConservative;
    const rrCons   = parseFloat(((entryConservative - tp1) / riskCons).toFixed(2));

    const execConfirmLabel = isShortConfirmed
      ? `m15 Confirmation: ${execBos === 'BEARISH_BOS' ? 'BOS' : execChoch === 'BEARISH_CHOCH' ? 'CHoCH' : 'Divergence'} ✅`
      : 'm15 Konfirmasi: Belum Terkonfirmasi ⚠️';

    if (rrAgg >= cfg.minRR && tp1 > 0) {
      const marketPhase    = classifyMarketPhase(ltfAdx, atrPct, htfBias);
      const riskSuggestion = getRiskSuggestion(shortScore);
      const beLevel = parseFloat((entryAggressive - (entryAggressive - tp1) * 0.5).toFixed(price > 1000 ? 0 : 4));
      signal = {
        pair: pair.name, direction: 'SHORT', tier: pair.tier,
        entryAggressive, entryConservative, sl: slShort, tp1, tp2, beLevel,
        rrAgg, rrCons,
        confluenceScore: shortScore, factors: [...shortFactors, execConfirmLabel],
        rsi: curRsi, htfBias, htfTrend: htfStruct.trend, ltfTrend: ltfStruct.trend,
        bos: ltfBos, choch: ltfChoch, divergence: ltfDiv, volumeSpike: ltfVolume,
        cvdDivergence: ltfCVDDiv, cvdCurrent, cvdRising,
        nearLevel: nearResist,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
        liquiditySweep: ltfSweep, marketPhase, riskSuggestion,
        sessionInfo, adx: ltfAdx,
        invalidationLevel: slShort,
        isReversal, adxWarning,
        nearestSupport, nearestResistance,
        fibLevels, fibNearLevel, fibSwingLow, fibSwingHigh, fibBullish,
      };
    }
  }

  if (!signal) {
    let blockedBy;
    if (Math.max(longScore, shortScore) < cfg.minConfluence) {
      blockedBy = `Score kurang — Long: ${longScore}, Short: ${shortScore} (butuh min ${cfg.minConfluence})`;
    } else if (longScore >= cfg.minConfluence && !longAllowed) {
      blockedBy = `Long score cukup (${longScore}) tapi tidak memenuhi reversal path — HTF: ${htfBias}, LTF: ${ltfStruct.trend}`;
    } else if (shortScore >= cfg.minConfluence && !shortAllowed) {
      blockedBy = `Short score cukup (${shortScore}) tapi tidak memenuhi reversal path — HTF: ${htfBias}, LTF: ${ltfStruct.trend}`;
    } else {
      blockedBy = `RR tidak cukup (min ${cfg.minRR}) atau SL/TP tidak valid`;
    }
    return { signal: null, debug: { adx: ltfAdx, longScore, shortScore, htfBias, ltfTrend: ltfStruct.trend, blockedBy } };
  }
  return { signal, debug: { adx: ltfAdx, longScore, shortScore, htfBias, ltfTrend: ltfStruct.trend } };
}

async function fetchBtcTrends() {
  let btcTrend1h = 'NEUTRAL';
  let btcTrend4h = 'NEUTRAL';
  try {
    const [btcKlines1h, btcKlines4h] = await Promise.all([
      getKlines('BTCUSDT', '1h', 100),
      getKlines('BTCUSDT', '4h', 100),
    ]);
    if (btcKlines1h.length) {
      const cl = btcKlines1h.map(c => c.close);
      const st = detectStructure(btcKlines1h);
      const e50 = calcEMA(cl, 50), e200 = calcEMA(cl, 200);
      if (e50[e50.length-1] > e200[e200.length-1] && st.trend !== 'DOWNTREND') btcTrend1h = 'BULLISH';
      else if (e50[e50.length-1] < e200[e200.length-1] && st.trend !== 'UPTREND') btcTrend1h = 'BEARISH';
    }
    if (btcKlines4h.length) {
      const cl = btcKlines4h.map(c => c.close);
      const st = detectStructure(btcKlines4h);
      const e50 = calcEMA(cl, 50), e200 = calcEMA(cl, 200);
      if (e50[e50.length-1] > e200[e200.length-1] && st.trend !== 'DOWNTREND') btcTrend4h = 'BULLISH';
      else if (e50[e50.length-1] < e200[e200.length-1] && st.trend !== 'UPTREND') btcTrend4h = 'BEARISH';
    }
  } catch (e) {
    console.error('Error fetching BTC trend:', e);
  }
  return { btcTrend1h, btcTrend4h };
}

async function scanAllPairs() {
  const { btcTrend1h, btcTrend4h } = await fetchBtcTrends();
  const results = await Promise.allSettled(PAIRS.map(p => analyzeAsset(p, btcTrend1h, btcTrend4h)));
  return results
    .filter(r => r.status === 'fulfilled' && r.value !== null && r.value.signal !== null)
    .map(r => r.value.signal)
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, 3);
}

module.exports = { scanAllPairs, analyzeAsset, fetchBtcTrends, PAIRS };
