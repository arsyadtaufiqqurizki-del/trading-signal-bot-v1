'use strict';
const { getKlines } = require('./binance');
const {
  calcEMA, calcRSI, calcATR,
  isVolumeSpike, detectStructure, detectBOS,
  findKeyLevels, detectDivergence
} = require('./indicators');
const { fmt } = require('./utils');

const PAIRS = [
  { symbol: 'BTCUSDT',  name: 'BTC/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'ETHUSDT',  name: 'ETH/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'SOLUSDT',  name: 'SOL/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'HYPEUSDT', name: 'HYPE/USDT', htf: '4h', ltf: '1h' },
  { symbol: 'TAOUSDT',  name: 'TAO/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'SUIUSDT',  name: 'SUI/USDT',  htf: '4h', ltf: '1h' },
  { symbol: 'DOGEUSDT', name: 'DOGE/USDT', htf: '4h', ltf: '1h' },
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

  // ── CONFLUENCE SCORING ───────────────────────────────────────────────────
  let longScore = 0, shortScore = 0;
  const longFactors = [], shortFactors = [];

  // 1. HTF trend alignment
  if (htfBias === 'BULLISH') { longScore++; longFactors.push('HTF Uptrend (HH-HL) ✅'); }
  if (htfBias === 'BEARISH') { shortScore++; shortFactors.push('HTF Downtrend (LH-LL) ✅'); }

  // 2. EMA alignment LTF
  if (price > curLtfE50 && curLtfE50 > curLtfE200) { longScore++; longFactors.push('Price > EMA50 > EMA200 ✅'); }
  if (price < curLtfE50 && curLtfE50 < curLtfE200) { shortScore++; shortFactors.push('Price < EMA50 < EMA200 ✅'); }

  // 3. RSI condition (relax slightly for more signals)
  if (curRsi < 45 && curRsi > 15) { longScore++; longFactors.push(`RSI Oversold/Low (${fmt(curRsi, 1)}) ✅`); }
  if (curRsi > 55 && curRsi < 85) { shortScore++; shortFactors.push(`RSI Overbought/High (${fmt(curRsi, 1)}) ✅`); }

  // 4. RSI divergence
  if (ltfDiv === 'BULLISH_DIVERGENCE') { longScore++; longFactors.push('Bullish RSI Divergence ✅'); }
  if (ltfDiv === 'BEARISH_DIVERGENCE') { shortScore++; shortFactors.push('Bearish RSI Divergence ✅'); }

  // 5. BOS
  if (ltfBos === 'BULLISH_BOS') { longScore++; longFactors.push('Bullish BOS Confirmed ✅'); }
  if (ltfBos === 'BEARISH_BOS') { shortScore++; shortFactors.push('Bearish BOS Confirmed ✅'); }

  // 6. Volume spike
  if (ltfVolume) {
    longScore++;  longFactors.push('Volume Spike Detected 🔥');
    shortScore++; shortFactors.push('Volume Spike Detected 🔥');
  }

  // 7. Key level proximity (within 0.5% of support/resistance)
  const nearSupport = keyLevels.find(l => l.type === 'SUPPORT' && Math.abs(price - l.price) / price < 0.005);
  const nearResist  = keyLevels.find(l => l.type === 'RESISTANCE' && Math.abs(price - l.price) / price < 0.005);
  if (nearSupport) { longScore++; longFactors.push(`Near Key Support $${fmt(nearSupport.price)} ✅`); }
  if (nearResist)  { shortScore++; shortFactors.push(`Near Key Resistance $${fmt(nearResist.price)} ✅`); }

  // ── SIGNAL GENERATION ────────────────────────────────────────────────────
  const MIN_CONFLUENCE = 3;
  let signal = null;

  if (longScore >= MIN_CONFLUENCE && longScore > shortScore) {
    const atr = ltfAtr;
    const sl = parseFloat((price - atr * 1.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price + atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price + atr * 5.0).toFixed(price > 1000 ? 0 : 4));
    const risk = price - sl;
    const rr  = parseFloat(((tp1 - price) / risk).toFixed(2));

    if (rr >= 1.9 && sl > 0) { // Using 1.9 to account for rounding and slight noise
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
    const sl = parseFloat((price + atr * 1.5).toFixed(price > 1000 ? 0 : 4));
    const tp1 = parseFloat((price - atr * 3.0).toFixed(price > 1000 ? 0 : 4));
    const tp2 = parseFloat((price - atr * 5.0).toFixed(price > 1000 ? 0 : 4));
    const risk = sl - price;
    const rr  = parseFloat(((price - tp1) / risk).toFixed(2));

    if (rr >= 1.9 && tp1 > 0) {
      signal = {
        pair: pair.name, direction: 'SHORT',
        entry: price, sl, tp1, tp2, rr,
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
