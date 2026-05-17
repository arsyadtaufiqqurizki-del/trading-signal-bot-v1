'use strict';
const { getKlines } = require('./binance');
const {
  calcEMA, calcRSI, calcATR, calcADX, calcMACD, calcStochRSI,
  isVolumeSpike, detectStructure, detectBOS,
  findKeyLevels, detectDivergence, detectFVG, detectOrderBlocks,
  detectCandlePattern, detectLiquiditySweep
} = require('./indicators');
const { fmt } = require('./utils');

const TIER_CONFIG = {
  1: { minConfluence: 6, adxMin: 15, minRR: 2.0, minScoreGap: 1 },
  2: { minConfluence: 6, adxMin: 15, minRR: 2.0, minScoreGap: 1 },
  3: { minConfluence: 6, adxMin: 15, minRR: 2.0, minScoreGap: 1 },
  4: { minConfluence: 5, adxMin: 13, minRR: 1.8, minScoreGap: 1 },
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

  if (!htfCandles.length || !ltfCandles.length || !execCandles.length) return null;

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
  const ltfDiv    = detectDivergence(ltfCandles, ltfRsi);
  const ltfVolume = isVolumeSpike(ltfCandles, 20, 1.5);
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
  const execRsi      = calcRSI(execCandles.map(c => c.close), 14);
  const execDiv      = detectDivergence(execCandles, execRsi);

  // Tier 2 — new indicators
  const ltfMacd      = calcMACD(ltfCloses);
  const execStochRsi = calcStochRSI(execCandles.map(c => c.close));
  const htfPattern   = detectCandlePattern(htfCandles);

  const price = ltfCandles[ltfCandles.length - 1].close;

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

  // 1b. HTF RSI extreme filter — penalti jika 4H RSI sudah overbought/oversold
  if (curHtfRsi > 70) { longScore  -= 2; if (curHtfRsi > 75) longScore  -= 1; }
  if (curHtfRsi < 30) { shortScore -= 2; if (curHtfRsi < 25) shortScore -= 1; }

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

  // 6. Volume spike — directional (bullish candle = long pressure, bearish = short pressure)
  if (ltfVolume) {
    const lastLtf = ltfCandles[ltfCandles.length - 1];
    if (lastLtf.close > lastLtf.open) { longScore  += 2; longFactors.push('Bullish Volume Spike ⚡'); }
    else                               { shortScore += 2; shortFactors.push('Bearish Volume Spike ⚡'); }
  } else if (pair.tier >= 3) {
    longScore  -= 1;
    shortScore -= 1;
  }

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

  // 9. Key level proximity (Low Weight)
  const nearSupport = keyLevels.find(l => l.type === 'SUPPORT' && Math.abs(price - l.price) / price < 0.005);
  const nearResist  = keyLevels.find(l => l.type === 'RESISTANCE' && Math.abs(price - l.price) / price < 0.005);
  if (nearSupport) { longScore += 1; longFactors.push(`Near Key Support $${fmt(nearSupport.price)} ✅`); }
  if (nearResist)  { shortScore += 1; shortFactors.push(`Near Key Resistance $${fmt(nearResist.price)} ✅`); }

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

  // ── SIGNAL GENERATION ────────────────────────────────────────────────────
  const cfg = TIER_CONFIG[pair.tier] || TIER_CONFIG[1];

  // ADX gate: tier-specific minimum trend strength
  if (ltfAdx < cfg.adxMin) return null;
  if (ltfAdx < cfg.adxMin + 5) { longScore -= 1; shortScore -= 1; }

  // CLIMAX phase block: trend-following setups di fase exhaustion cenderung gagal
  const isClimax = ltfAdx > 35 && atrPct > 3;
  if (isClimax) {
    if (htfBias === 'BULLISH') longScore  -= 3;
    if (htfBias === 'BEARISH') shortScore -= 3;
  }

  // Trend alignment: hard block hanya jika LTF aktif berlawanan (RANGING diizinkan)
  const longTrendOk  = htfBias !== 'BEARISH' && ltfStruct.trend !== 'DOWNTREND';
  const shortTrendOk = htfBias !== 'BULLISH' && ltfStruct.trend !== 'UPTREND';
  // Jika LTF RANGING, izinkan kedua arah (pasar konsolidasi bisa breakout keduanya)
  const ltfRanging = ltfStruct.trend === 'RANGING';
  const longAllowed  = ltfRanging || longTrendOk;
  const shortAllowed = ltfRanging || shortTrendOk;

  let signal = null;

  if (longScore >= cfg.minConfluence && longScore >= shortScore + cfg.minScoreGap && longAllowed) {
    const isLongConfirmed = (execBos === 'BULLISH_BOS' || execDiv === 'BULLISH_DIVERGENCE');

    const atr = ltfAtr;
    const slRaw = calcStructureSL(price, 'LONG', ltfStruct, atr, htfStruct);
    let sl = parseFloat(slRaw.toFixed(price > 1000 ? 0 : 4));
    // Minimum SL distance: harus minimal 1.2x ATR dari entry untuk hindari wick sweep
    if (price - sl < atr * 1.2) sl = parseFloat((price - atr * 2.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price + atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price + atr * 5.0).toFixed(price > 1000 ? 0 : 4));

    // Hybrid Entry Calculation
    const entryAggressive = price;
    let entryConservative = price;
    if (nearBullOb) {
      entryConservative = (nearBullOb.top + nearBullOb.bottom) / 2;
    } else if (nearBullFvg) {
      entryConservative = nearBullFvg.top;
    }
    entryConservative = parseFloat(entryConservative.toFixed(price > 1000 ? 0 : 4));

    const riskAgg = entryAggressive - sl;
    const rrAgg = parseFloat(((tp1 - entryAggressive) / riskAgg).toFixed(2));
    const riskCons = entryConservative - sl;
    const rrCons = parseFloat(((tp1 - entryConservative) / riskCons).toFixed(2));

    const execConfirmLabel = isLongConfirmed
      ? `m15 Confirmation: ${execBos === 'BULLISH_BOS' ? 'BOS' : 'Divergence'} ✅`
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
        bos: ltfBos, divergence: ltfDiv, volumeSpike: ltfVolume,
        nearLevel: nearSupport,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
        liquiditySweep: ltfSweep, marketPhase, riskSuggestion,
        sessionInfo, adx: ltfAdx,
        invalidationLevel: sl,
      };
    }
  } else if (shortScore >= cfg.minConfluence && shortScore >= longScore + cfg.minScoreGap && shortAllowed) {
    const isShortConfirmed = (execBos === 'BEARISH_BOS' || execDiv === 'BEARISH_DIVERGENCE');

    const atr = ltfAtr;
    const slRawShort = calcStructureSL(price, 'SHORT', ltfStruct, atr, htfStruct);
    let slShort = parseFloat(slRawShort.toFixed(price > 1000 ? 0 : 4));
    // Minimum SL distance: harus minimal 1.2x ATR dari entry
    if (slShort - price < atr * 1.2) slShort = parseFloat((price + atr * 2.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price - atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price - atr * 5.0).toFixed(price > 1000 ? 0 : 4));

    // Hybrid Entry Calculation
    const entryAggressive = price;
    let entryConservative = price;
    if (nearBearOb) {
      entryConservative = (nearBearOb.top + nearBearOb.bottom) / 2;
    } else if (nearBearFvg) {
      entryConservative = nearBearFvg.bottom;
    }
    entryConservative = parseFloat(entryConservative.toFixed(price > 1000 ? 0 : 4));

    const riskAgg = slShort - entryAggressive;
    const rrAgg = parseFloat(((entryAggressive - tp1) / riskAgg).toFixed(2));
    const riskCons = slShort - entryConservative;
    const rrCons = parseFloat(((entryConservative - tp1) / riskCons).toFixed(2));

    const execConfirmLabel = isShortConfirmed
      ? `m15 Confirmation: ${execBos === 'BEARISH_BOS' ? 'BOS' : 'Divergence'} ✅`
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
        bos: ltfBos, divergence: ltfDiv, volumeSpike: ltfVolume,
        nearLevel: nearResist,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
        liquiditySweep: ltfSweep, marketPhase, riskSuggestion,
        sessionInfo, adx: ltfAdx,
        invalidationLevel: slShort,
      };
    }
  }

  return signal;
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
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, 3);
}

module.exports = { scanAllPairs, analyzeAsset, fetchBtcTrends, PAIRS };
