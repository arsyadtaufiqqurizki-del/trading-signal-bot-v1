'use strict';
const { getKlines } = require('./binance');
const {
  calcEMA, calcRSI, calcATR,
  isVolumeSpike, detectStructure, detectBOS,
  findKeyLevels, detectDivergence, detectFVG, detectOrderBlocks
} = require('./indicators');
const { fmt } = require('./utils');

const PAIRS = [
  { symbol: 'BTCUSDT',  name: 'BTC/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'ETHUSDT',  name: 'ETH/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'SOLUSDT',  name: 'SOL/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'HYPEUSDT', name: 'HYPE/USDT', htf: '4h', ltf: '1h' },
  { symbol: 'TAOUSDT',  name: 'TAO/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'SUIUSDT',  name: 'SUI/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'BNBUSDT',  name: 'BNB/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'XRPUSDT',  name: 'XRP/USDT',  htf: '4h', ltf: '1h' },
];

async function analyzeAsset(pair) {
  const [htfCandles, ltfCandles] = await Promise.all([
    getKlines(pair.symbol, pair.htf, 200),
    getKlines(pair.symbol, pair.ltf, 200),
  ]);

  if (!htfCandles.length || !ltfCandles.length) return null;

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

  // SMC Detection
  const ltfFvgs = detectFVG(ltfCandles);
  const ltfObs  = detectOrderBlocks(ltfCandles);

  const price = ltfCandles[ltfCandles.length - 1].close;
  const curRsi = ltfRsi[ltfRsi.length - 1];
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

  // 1. HTF trend alignment (High Weight)
  if (htfBias === 'BULLISH') { longScore += 3; longFactors.push('HTF Bullish Bias 🚀'); }
  if (htfBias === 'BEARISH') { shortScore += 3; shortFactors.push('HTF Bearish Bias 📉'); }

  // 2. EMA alignment LTF (Medium Weight)
  if (price > curLtfE50 && curLtfE50 > curLtfE200) { longScore += 2; longFactors.push('LTF Bullish EMA Alignment ✅'); }
  if (price < curLtfE50 && curLtfE50 < curLtfE200) { shortScore += 2; shortFactors.push('LTF Bearish EMA Alignment ✅'); }

  // 3. RSI condition (Low Weight)
  if (curRsi < 45 && curRsi > 15) { longScore += 1; longFactors.push(`RSI Low (${fmt(curRsi, 1)}) ✅`); }
  if (curRsi > 55 && curRsi < 85) { shortScore += 1; shortFactors.push(`RSI High (${fmt(curRsi, 1)}) ✅`); }

  // 4. RSI divergence (Medium Weight)
  if (ltfDiv === 'BULLISH_DIVERGENCE') { longScore += 2; longFactors.push('Bullish RSI Divergence 🔥'); }
  if (ltfDiv === 'BEARISH_DIVERGENCE') { shortScore += 2; shortFactors.push('Bearish RSI Divergence 🔥'); }

  // 5. BOS (Medium Weight)
  if (ltfBos === 'BULLISH_BOS') { longScore += 2; longFactors.push('Bullish BOS Confirmed ✅'); }
  if (ltfBos === 'BEARISH_BOS') { shortScore += 2; shortFactors.push('Bearish BOS Confirmed ✅'); }

  // 6. Volume spike (Low Weight)
  if (ltfVolume) {
    longScore += 1;  longFactors.push('Volume Spike Detected ⚡');
    shortScore += 1; shortFactors.push('Volume Spike Detected ⚡');
  }

  // 7. Order Block Touch (High Weight)
  const nearBullOb = ltfObs.find(ob => ob.type === 'BULLISH_OB' && price <= ob.top && price >= ob.bottom);
  const nearBearOb = ltfObs.find(ob => ob.type === 'BEARISH_OB' && price <= ob.top && price >= ob.bottom);
  if (nearBullOb) { longScore += 3; longFactors.push(`Price in Bullish OB zone ✅`); }
  if (nearBearOb) { shortScore += 3; shortFactors.push(`Price in Bearish OB zone ✅`); }

  // 8. FVG Filling (Medium Weight)
  const nearBullFvg = ltfFvgs.find(fvg => fvg.type === 'BULLISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  const nearBearFvg = ltfFvgs.find(fvg => fvg.type === 'BEARISH_FVG' && price <= fvg.top && price >= fvg.bottom);
  if (nearBullFvg) { longScore += 2; longFactors.push(`Price filling Bullish FVG ✅`); }
  if (nearBearFvg) { shortScore += 2; shortFactors.push(`Price filling Bearish FVG ✅`); }

  // 9. Key level proximity (Low Weight)
  const nearSupport = keyLevels.find(l => l.type === 'SUPPORT' && Math.abs(price - l.price) / price < 0.005);
  const nearResist  = keyLevels.find(l => l.type === 'RESISTANCE' && Math.abs(price - l.price) / price < 0.005);
  if (nearSupport) { longScore += 1; longFactors.push(`Near Key Support $${fmt(nearSupport.price)} ✅`); }
  if (nearResist)  { shortScore += 1; shortFactors.push(`Near Key Resistance $${fmt(nearResist.price)} ✅`); }

  // ── SIGNAL GENERATION ────────────────────────────────────────────────────
  const MIN_CONFLUENCE = 6; // Increased to 6 due to weighted scoring
  let signal = null;

  if (longScore >= MIN_CONFLUENCE && longScore > shortScore) {
    const atr = ltfAtr;
    const sl = parseFloat((price - atr * 1.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price + atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price + atr * 5.0).toFixed(price > 1000 ? 0 : 4));
    const risk = price - sl;
    const rr  = parseFloat(((tp1 - price) / risk).toFixed(2));

    if (rr >= 1.9 && sl > 0) {
      signal = {
        pair: pair.name, direction: 'LONG',
        entry: price, sl, tp1, tp2, rr,
        confluenceScore: longScore, factors: longFactors,
        rsi: curRsi, htfBias, htfTrend: htfStruct.trend, ltfTrend: ltfStruct.trend,
        bos: ltfBos, divergence: ltfDiv, volumeSpike: ltfVolume,
        nearLevel: nearSupport,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
      };
    }
  } else if (shortScore >= MIN_CONFLUENCE && shortScore > longScore) {
    const atr = ltfAtr;
    const slShort = parseFloat((price + atr * 1.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price - atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price - atr * 5.0).toFixed(price > 1000 ? 0 : 4));
    const risk = slShort - price;
    const rr  = parseFloat(((price - tp1) / risk).toFixed(2));

    if (rr >= 1.9 && tp1 > 0) {
      signal = {
        pair: pair.name, direction: 'SHORT',
        entry: price, sl: slShort, tp1, tp2, rr,
        confluenceScore: shortScore, factors: shortFactors,
        rsi: curRsi, htfBias, htfTrend: htfStruct.trend, ltfTrend: ltfStruct.trend,
        bos: ltfBos, divergence: ltfDiv, volumeSpike: ltfVolume,
        nearLevel: nearResist,
        atr, htfEma50: curHtfE50, htfEma200: curHtfE200,
      };
    }
  }

  return signal;
}

async function scanAllPairs() {
  const results = await Promise.allSettled(PAIRS.map(p => analyzeAsset(p)));
  const signals = results
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value)
    .sort((a, b) => b.confluenceScore - a.confluenceScore)
    .slice(0, 2); // max 2 signals per day
  return signals;
}

module.exports = { scanAllPairs };
