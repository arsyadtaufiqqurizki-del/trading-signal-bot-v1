'use strict';
const { getKlines, getTicker, getAllTickers } = require('./binance');
const { calcEMA, calcRSI, calcATR, detectStructure } = require('./indicators');
const { fmt } = require('./utils');

/**
 * Deteksi pola candlestick dasar
 */
function detectCandlePattern(candles) {
    if (candles.length < 2) return null;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    const bodySize = Math.abs(last.close - last.open);
    const prevBodySize = Math.abs(prev.close - prev.open);
    
    // Bullish Engulfing
    if (prev.close < prev.open && last.close > last.open && 
        last.open <= prev.close && last.close >= prev.open) {
        return 'BULLISH_ENGULFING';
    }
    
    // Bearish Engulfing
    if (prev.close > prev.open && last.close < last.open && 
        last.open <= prev.close && last.close >= prev.open) {
        return 'BEARISH_ENGULFING';
    }
    
    // Hammer / Pin Bar (Sederhana)
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    if (lowerWick > bodySize * 2 && upperWick < bodySize) return 'HAMMER';
    if (upperWick > bodySize * 2 && lowerWick < bodySize) return 'SHOOTING_STAR';
    
    return null;
}

/**
 * Analisis mendalam untuk satu aset menggunakan Multi-Timeframe
 */
async function analyzeProAsset(symbol) {
    try {
        // Fetch data untuk 1h (Trend) dan 15m (Entry)
        const [candles1h, candles15m, ticker] = await Promise.all([
            getKlines(symbol, '1h', 100),
            getKlines(symbol, '15m', 100),
            getTicker(symbol),
        ]);

        if (!candles1h || candles1h.length < 30 || !candles15m || candles15m.length < 30) return null;

        const close1h = candles1h[candles1h.length - 1].close;
        const close15m = candles15m[candles15m.length - 1].close;

        // --- Analisis Timeframe 1h (TREND) ---
        const ema20_1h = calcEMA(candles1h.map(c => c.close), 20).pop();
        const ema50_1h = calcEMA(candles1h.map(c => c.close), 50).pop();
        const struct1h = detectStructure(candles1h);
        const trend1h = struct1h.trend; // UPTREND / DOWNTREND / RANGING

        // --- Analisis Timeframe 15m (ENTRY/MOMENTUM) ---
        const rsi15m = calcRSI(candles15m.map(c => c.close), 14).pop();
        const candlePattern15m = detectCandlePattern(candles15m);
        const ema20_15m = calcEMA(candles15m.map(c => c.close), 20).pop();

        // --- SCORING SYSTEM ---
        let longScore = 0, shortScore = 0;
        const longFactors = [], shortFactors = [];

        // 1. Trend Alignment (Bobot Tinggi)
        if (trend1h === 'UPTREND' && close15m > ema20_15m) {
            longScore += 3; longFactors.push('Multi-TF Alignment: Bullish');
        } else if (trend1h === 'DOWNTREND' && close15m < ema20_15m) {
            shortScore += 3; shortFactors.push('Multi-TF Alignment: Bearish');
        }

        // 2. EMA Alignment 1h
        if (ema20_1h > ema50_1h && close1h > ema20_1h) {
            longScore += 2; longFactors.push('Strong Trend 1h: Bullish');
        } else if (ema20_1h < ema50_1h && close1h < ema20_1h) {
            shortScore += 2; shortFactors.push('Strong Trend 1h: Bearish');
        }

        // 3. RSI 15m (Momentum)
        if (rsi15m !== undefined) {
            if (rsi15m < 35) { longScore += 2; longFactors.push(`Oversold 15m (RSI ${fmt(rsi15m,1)})`); }
            else if (rsi15m > 65) { shortScore += 2; shortFactors.push(`Overbought 15m (RSI ${fmt(rsi15m,1)})`); }
        }

        // 4. Candle Pattern 15m
        if (candlePattern15m === 'BULLISH_ENGULFING' || candlePattern15m === 'HAMMER') {
            longScore += 2; longFactors.push(`Pattern 15m: ${candlePattern15m}`);
        } else if (candlePattern15m === 'BEARISH_ENGULFING' || candlePattern15m === 'SHOOTING_STAR') {
            shortScore += 2; shortFactors.push(`Pattern 15m: ${candlePattern15m}`);
        }

        // 5. Volume/24h Momentum
        const change24h = ticker ? ticker.change24h : 0;
        if (change24h > 3) { longScore += 1; longFactors.push('High 24h Bullish Momentum'); }
        if (change24h < -3) { shortScore += 1; shortFactors.push('High 24h Bearish Momentum'); }

        // --- Penentuan Direction ---
        const direction = longScore >= shortScore ? 'LONG' : 'SHORT';
        const finalScore = direction === 'LONG' ? longScore : shortScore;
        const factors = direction === 'LONG' ? longFactors : shortFactors;

        // --- Kalkulasi TP/SL (Berdasarkan ATR 15m) ---
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
            pair: symbol.replace('USDT', '/USDT'),
            direction,
            price,
            sl,
            tp,
            rr,
            score: finalScore,
            factors,
            rsi: rsi15m,
            trend1h: trend1h,
            trend15m: close15m > ema20_15m ? 'UP' : 'DOWN',
            marketCondition: (atr15m / price * 100) > 2 ? 'Volatile' : 'Trending',
            change24h: change24h || 0
        };
    } catch (err) {
        console.error(`[ProScanner] Error on ${symbol}:`, err.message);
        return null;
    }
}

/**
 * Scan dinamis: Top 50 Volume -> Analisis Pro -> Pilih 1 Terbaik
 */
async function fastScan() {
    try {
        // 1. Ambil semua ticker untuk cari top 50 volume
        const allTickers = await getAllTickers();
        
        // Filter hanya USDT pairs dan sort by volume
        const topPairs = allTickers
            .filter(t => t.symbol.endsWith('USDT'))
            .sort((a, b) => b.quoteVolume - a.quoteVolume)
            .slice(0, 50);

        // 2. Analisis Pro untuk top 50 (diproses paralel dengan limit)
        const results = await Promise.allSettled(topPairs.map(p => analyzeProAsset(p.symbol)));

        const valid = results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        if (valid.length === 0) {
            // Fallback ke BTC jika semua gagal
            return await analyzeProAsset('BTCUSDT');
        }

        // Sort by score tertinggi
        valid.sort((a, b) => b.score - a.score);

        return valid[0];
    } catch (err) {
        console.error('[FastScan] Critical Error:', err.message);
        // Fallback absolut
        return {
            pair: 'BTC/USDT', direction: 'LONG', price: 60000, sl: 59000, tp: 62000,
            rr: 2.0, score: 1, factors: ['Fallback: Data Error'], rsi: 50,
            trend1h: 'RANGING', trend15m: 'UP', marketCondition: 'Volatile', change24h: 0
        };
    }
}

module.exports = { fastScan };
