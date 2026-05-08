'use strict';
const { getKlines, getTicker } = require('./binance');
const { calcEMA, calcRSI, calcATR, detectStructure } = require('./indicators');
const { fmt } = require('./utils');

// Stable Pro List: Koin paling likuid untuk menjamin stabilitas di Vercel/Hosting
const PRO_PAIRS = [
  { symbol: 'BTCUSDT',  name: 'BTC/USDT' },
  { symbol: 'ETHUSDT',  name: 'ETH/USDT' },
  { symbol: 'SOLUSDT',  name: 'SOL/USDT' },
  { symbol: 'BNBUSDT',  name: 'BNB/USDT' },
  { symbol: 'XRPUSDT',  name: 'XRP/USDT' },
  { symbol: 'ADAUSDT',  name: 'ADA/USDT' },
  { symbol: 'AVAXUSDT',  name: 'AVAX/USDT' },
  { symbol: 'DOGEUSDT',  name: 'DOGE/USDT' },
  { symbol: 'DOTUSDT',  name: 'DOT/USDT' },
  { symbol: 'LINKUSDT',  name: 'LINK/USDT' },
  { symbol: 'MATICUSDT', name: 'MATIC/USDT' },
  { symbol: 'SHIBUSDT',  name: 'SHIB/USDT' },
  { symbol: 'LTCUSDT',  name: 'LTC/USDT' },
  { symbol: 'UNIUSDT',  name: 'UNI/USDT' },
  { symbol: 'SUIUSDT',  name: 'SUI/USDT' },
  { symbol: 'HYPEUSDT', name: 'HYPE/USDT' },
  { symbol: 'TAOUSDT',  name: 'TAO/USDT' },
  { symbol: 'FETUSDT',  name: 'FET/USDT' },
  { symbol: 'NEARUSDT',  name: 'NEAR/USDT' },
  { symbol: 'APTUSDT',  name: 'APT/USDT' },
];

function detectCandlePattern(candles) {
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const bodySize = Math.abs(last.close - last.open);
    if (prev.close < prev.open && last.close > last.open && last.open <= prev.close && last.close >= prev.open) return 'BULLISH_ENGULFING';
    if (prev.close > prev.open && last.close < last.open && last.open <= prev.close && last.close >= prev.open) return 'BEARISH_ENGULFING';
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    if (lowerWick > bodySize * 2 && upperWick < bodySize) return 'HAMMER';
    if (upperWick > bodySize * 2 && lowerWick < bodySize) return 'SHOOTING_STAR';
    return null;
}

async function analyzeProAsset(pair) {
    try {
        const symbol = pair.symbol;
        const [candles1h, candles15m, ticker] = await Promise.all([
            getKlines(symbol, '1h', 100),
            getKlines(symbol, '15m', 100),
            getTicker(symbol),
        ]);

        if (!candles1h || candles1h.length < 30 || !candles15m || candles15m.length < 30) return null;

        const close1h = candles1h[candles1h.length - 1].close;
        const close15m = candles15m[candles15m.length - 1].close;
        const ema20_1h = calcEMA(candles1h.map(c => c.close), 20).pop();
        const ema50_1h = calcEMA(candles1h.map(c => c.close), 50).pop();
        const struct1h = detectStructure(candles1h);
        const trend1h = struct1h.trend;
        const rsi15m = calcRSI(candles15m.map(c => c.close), 14).pop();
        const candlePattern15m = detectCandlePattern(candles15m);
        const ema20_15m = calcEMA(candles15m.map(c => c.close), 20).pop();

        let longScore = 0, shortScore = 0;
        const longFactors = [], shortFactors = [];

        if (trend1h === 'UPTREND' && close15m > ema20_15m) { longScore += 3; longFactors.push('Multi-TF Alignment: Bullish'); }
        else if (trend1h === 'DOWNTREND' && close15m < ema20_15m) { shortScore += 3; shortFactors.push('Multi-TF Alignment: Bearish'); }

        if (ema20_1h > ema50_1h && close1h > ema20_1h) { longScore += 2; longFactors.push('Strong Trend 1h: Bullish'); }
        else if (ema20_1h < ema50_1h && close1h < ema20_1h) { shortScore += 2; shortFactors.push('Strong Trend 1h: Bearish'); }

        if (rsi15m !== undefined) {
            if (rsi15m < 35) { longScore += 2; longFactors.push(`Oversold 15m (RSI ${fmt(rsi15m,1)})`); }
            else if (rsi15m > 65) { shortScore += 2; shortFactors.push(`Overbought 15m (RSI ${fmt(rsi15m,1)})`); }
        }

        if (candlePattern15m === 'BULLISH_ENGULFING' || candlePattern15m === 'HAMMER') { longScore += 2; longFactors.push(`Pattern 15m: ${candlePattern15m}`); }
        else if (candlePattern15m === 'BEARISH_ENGULFING' || candlePattern15m === 'SHOOTING_STAR') { shortScore += 2; shortFactors.push(`Pattern 15m: ${candlePattern15m}`); }

        const change24h = ticker ? ticker.change24h : 0;
        if (change24h > 3) { longScore += 1; longFactors.push('High 24h Bullish Momentum'); }
        if (change24h < -3) { shortScore += 1; shortFactors.push('High 24h Bearish Momentum'); }

        const direction = longScore >= shortScore ? 'LONG' : 'SHORT';
        const finalScore = direction === 'LONG' ? longScore : shortScore;
        const factors = direction === 'LONG' ? longFactors : shortFactors;

        const atr15m = calcATR(candles15m, 14);
        const price = close15m;
        let sl, tp;

        if (direction === 'LONG') {
            sl = price - (atr15m * 1.5);
            tp = price + (atr15m * 2.5);
        } else {
            sl = price + (atr15m * 1.5);
            tp = price - (atr15m * 2.5);
        }

        const risk = Math.abs(price - sl);
        const reward = Math.abs(tp - price);
        const rr = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 1.6;

        return {
            symbol,
            pair: pair.name,
            direction, price, sl, tp, rr, score: finalScore, factors, rsi: rsi15m,
            trend1h: trend1h, trend15m: close15m > ema20_15m ? 'UP' : 'DOWN',
            marketCondition: (atr15m / price * 100) > 2 ? 'Volatile' : 'Trending',
            change24h: change24h || 0
        };
    } catch (err) {
        console.error(`[ProScanner] Error on ${pair.symbol}:`, err.message);
        return null;
    }
}

async function fastScan() {
    try {
        const results = await Promise.allSettled(PRO_PAIRS.map(p => analyzeProAsset(p)));
        const valid = results.filter(r => r.status === 'fulfilled' && r.value !== null).map(r => r.value);

        if (valid.length === 0) {
            // Try BTC as a last resort, but if that also fails, use the hardcoded fallback
            const btcSignal = await analyzeProAsset(PRO_PAIRS[0]);
            if (btcSignal) return btcSignal;
            
            return {
                pair: 'BTC/USDT', direction: 'LONG', price: 60000, sl: 59000, tp: 62000,
                rr: 2.0, score: 1, factors: ['Fallback: API Timeout'], rsi: 50,
                trend1h: 'RANGING', trend15m: 'UP', marketCondition: 'Volatile', change24h: 0
            };
        }

        valid.sort((a, b) => b.score - a.score);
        return valid[0];
    } catch (err) {
        console.error('[FastScan] Critical Error:', err.message);
        return {
            pair: 'BTC/USDT', direction: 'LONG', price: 60000, sl: 59000, tp: 62000,
            rr: 2.0, score: 1, factors: ['Fallback: Critical Error'], rsi: 50,
            trend1h: 'RANGING', trend15m: 'UP', marketCondition: 'Volatile', change24h: 0
        };
    }
}

module.exports = { fastScan };
