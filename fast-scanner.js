'use strict';
const { getKlines, getTicker, getFundingRate } = require('./binance');
const { calcEMA, calcRSI, calcATR, calcADX, calcVWAP, isVolumeSpike, detectStructure, detectDivergence } = require('./indicators');
const { fmt, getSession } = require('./utils');

const MINIMUM_SIGNAL_SCORE = 7;

// Stable Pro List: Koin paling likuid untuk menjamin stabilitas di Vercel/Hosting
const PRO_PAIRS = [
  // Tier 1 — Mega Cap
  { symbol: 'BTCUSDT',      name: 'BTC/USDT'    },
  { symbol: 'ETHUSDT',      name: 'ETH/USDT'    },
  { symbol: 'SOLUSDT',      name: 'SOL/USDT'    },
  { symbol: 'BNBUSDT',      name: 'BNB/USDT'    },
  { symbol: 'XRPUSDT',      name: 'XRP/USDT'    },
  // Tier 2 — Large Cap
  { symbol: 'DOGEUSDT',     name: 'DOGE/USDT'   },
  { symbol: 'ADAUSDT',      name: 'ADA/USDT'    },
  { symbol: 'AVAXUSDT',     name: 'AVAX/USDT'   },
  { symbol: 'LINKUSDT',     name: 'LINK/USDT'   },
  { symbol: 'SUIUSDT',      name: 'SUI/USDT'    },
  { symbol: 'DOTUSDT',      name: 'DOT/USDT'    },
  { symbol: 'TRXUSDT',      name: 'TRX/USDT'    },
  { symbol: 'NEARUSDT',     name: 'NEAR/USDT'   },
  { symbol: 'APTUSDT',      name: 'APT/USDT'    },
  { symbol: 'TONUSDT',      name: 'TON/USDT'    },
  // Tier 3 — Established Altcoins
  { symbol: 'LTCUSDT',      name: 'LTC/USDT'    },
  { symbol: 'ATOMUSDT',     name: 'ATOM/USDT'   },
  { symbol: 'INJUSDT',      name: 'INJ/USDT'    },
  { symbol: 'OPUSDT',       name: 'OP/USDT'     },
  { symbol: 'ARBUSDT',      name: 'ARB/USDT'    },
  { symbol: 'UNIUSDT',      name: 'UNI/USDT'    },
  { symbol: 'AAVEUSDT',     name: 'AAVE/USDT'   },
  { symbol: 'LDOUSDT',      name: 'LDO/USDT'    },
  { symbol: 'HYPEUSDT',     name: 'HYPE/USDT'   },
  { symbol: 'TAOUSDT',      name: 'TAO/USDT'    },
  { symbol: 'FETUSDT',      name: 'FET/USDT'    },
  { symbol: 'RUNEUSDT',     name: 'RUNE/USDT'   },
  { symbol: 'STXUSDT',      name: 'STX/USDT'    },
  { symbol: 'JUPUSDT',      name: 'JUP/USDT'    },
  { symbol: 'FILUSDT',      name: 'FIL/USDT'    },
  // Tier 4 — High Momentum
  { symbol: 'WIFUSDT',      name: 'WIF/USDT'    },
  { symbol: '1000PEPEUSDT', name: 'PEPE/USDT'   },
  { symbol: '1000SHIBUSDT', name: 'SHIB/USDT'   },
  { symbol: '1000BONKUSDT', name: 'BONK/USDT'   },
  { symbol: 'RENDERUSDT',   name: 'RENDER/USDT' },
  { symbol: 'ENAUSDT',      name: 'ENA/USDT'    },
  { symbol: 'TIAUSDT',      name: 'TIA/USDT'    },
  { symbol: 'SEIUSDT',      name: 'SEI/USDT'    },
  { symbol: 'EIGENUSDT',    name: 'EIGEN/USDT'  },
  { symbol: 'HBARUSDT',     name: 'HBAR/USDT'   },
  { symbol: 'WLDUSDT',      name: 'WLD/USDT'    },
  { symbol: 'GMXUSDT',      name: 'GMX/USDT'    },
  { symbol: 'DYDXUSDT',     name: 'DYDX/USDT'   },
  { symbol: 'NOTUSDT',      name: 'NOT/USDT'    },
  { symbol: 'STRKUSDT',     name: 'STRK/USDT'   },
  { symbol: 'ZKUSDT',       name: 'ZK/USDT'     },
  { symbol: 'MATICUSDT',    name: 'MATIC/USDT'  },
  { symbol: 'FTMUSDT',      name: 'FTM/USDT'    },
  { symbol: 'SNXUSDT',      name: 'SNX/USDT'    },
  { symbol: 'ZECUSDT',      name: 'ZEC/USDT'    },
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
        const [candles1h, candles15m, candles5m, candles4h, ticker, fundingRate] = await Promise.all([
            getKlines(symbol, '1h', 250),
            getKlines(symbol, '15m', 100),
            getKlines(symbol, '5m', 60),
            getKlines(symbol, '4h', 100),
            getTicker(symbol),
            getFundingRate(symbol),
        ]);

        if (!candles1h || candles1h.length < 50 || !candles15m || candles15m.length < 30) return null;

        const closes1h  = candles1h.map(c => c.close);
        const closes15m = candles15m.map(c => c.close);
        const close1h   = closes1h[closes1h.length - 1];
        const close15m  = closes15m[closes15m.length - 1];

        const ema20_1h   = calcEMA(closes1h, 20).pop();
        const ema50_1h   = calcEMA(closes1h, 50).pop();
        const ema200_1h  = calcEMA(closes1h, 200).pop();
        const ema20_15m  = calcEMA(closes15m, 20).pop();
        const struct1h   = detectStructure(candles1h);
        const trend1h    = struct1h.trend;

        const rsiArr15m  = calcRSI(closes15m, 14);
        const rsi15m     = rsiArr15m[rsiArr15m.length - 1];
        const rsiPrev15m = rsiArr15m[rsiArr15m.length - 2];
        const rsiRising  = rsi15m > rsiPrev15m;
        const rsiFalling = rsi15m < rsiPrev15m;

        const candlePattern15m = detectCandlePattern(candles15m);
        const adx1h            = calcADX(candles1h, 14);
        const volSpike15m      = isVolumeSpike(candles15m, 20, 1.5);

        // ── FILTER 1: Block ranging market (ADX < 20) ──────────────────────
        if (adx1h < 20) return null;

        // ── VWAP (15M) ──────────────────────────────────────────────────────
        const vwap15m = calcVWAP(candles15m);

        // ── 4H Bias ─────────────────────────────────────────────────────────
        let trend4h = 'RANGING';
        if (candles4h && candles4h.length >= 50) {
            const closes4h = candles4h.map(c => c.close);
            const ema20_4h = calcEMA(closes4h, 20).pop();
            const ema50_4h = calcEMA(closes4h, 50).pop();
            const close4h  = closes4h[closes4h.length - 1];
            if (ema20_4h > ema50_4h && close4h > ema20_4h) trend4h = 'UPTREND';
            else if (ema20_4h < ema50_4h && close4h < ema20_4h) trend4h = 'DOWNTREND';
        }

        // ── RSI Divergence 15M ───────────────────────────────────────────────
        const divergence15m = detectDivergence(candles15m, rsiArr15m);

        // 5m entry confirmation data
        let confirm5m = { trend: 'NEUTRAL', rsi: null, pattern: null, volSpike: false, aligned: false };
        if (candles5m && candles5m.length >= 20) {
            const closes5m   = candles5m.map(c => c.close);
            const close5m    = closes5m[closes5m.length - 1];
            const ema20_5m   = calcEMA(closes5m, 20).pop();
            const ema9_5m    = calcEMA(closes5m, 9).pop();
            const rsiArr5m   = calcRSI(closes5m, 14);
            const rsi5m      = rsiArr5m[rsiArr5m.length - 1];
            const rsiPrev5m  = rsiArr5m[rsiArr5m.length - 2];
            const pattern5m  = detectCandlePattern(candles5m);
            const volSpike5m = isVolumeSpike(candles5m, 20, 1.5);
            const trend5m    = close5m > ema20_5m ? 'UP' : 'DOWN';

            confirm5m = {
                trend: trend5m,
                rsi: rsi5m,
                rsiRising: rsi5m > rsiPrev5m,
                pattern: pattern5m,
                volSpike: volSpike5m,
                ema9: ema9_5m,
                ema20: ema20_5m,
                price: close5m,
                // Aligned = 5m searah dengan sinyal yang akan datang
                aligned: false, // akan di-set setelah direction ditentukan
            };
        }

        let longScore = 0, shortScore = 0;
        const longFactors = [], shortFactors = [];

        // 1. Multi-TF Alignment (weight: 3)
        if (trend1h === 'UPTREND' && close15m > ema20_15m) { longScore += 3; longFactors.push('Multi-TF Alignment: Bullish'); }
        else if (trend1h === 'DOWNTREND' && close15m < ema20_15m) { shortScore += 3; shortFactors.push('Multi-TF Alignment: Bearish'); }

        // 2. Strong 1h EMA structure (weight: 2)
        if (ema20_1h > ema50_1h && close1h > ema20_1h) { longScore += 2; longFactors.push('Strong Trend 1h: Bullish'); }
        else if (ema20_1h < ema50_1h && close1h < ema20_1h) { shortScore += 2; shortFactors.push('Strong Trend 1h: Bearish'); }

        // 3. EMA 200 Bias Filter (weight: 2)
        if (ema200_1h) {
            if (close1h > ema200_1h) { longScore += 2; longFactors.push('Above EMA200: Bullish Bias'); }
            else                      { shortScore += 2; shortFactors.push('Below EMA200: Bearish Bias'); }
        }

        // 4. RSI Extreme (weight: 2)
        if (rsi15m !== undefined) {
            if (rsi15m < 35)  { longScore += 2; longFactors.push(`Oversold 15m (RSI ${fmt(rsi15m,1)})`); }
            else if (rsi15m > 65) { shortScore += 2; shortFactors.push(`Overbought 15m (RSI ${fmt(rsi15m,1)})`); }
        }

        // 5. RSI Momentum Confirmation (weight: 2)
        if (rsi15m !== undefined && rsiPrev15m !== undefined) {
            if (rsi15m >= 45 && rsi15m <= 65 && rsiRising)   { longScore += 2; longFactors.push('RSI Momentum: Bullish Rising'); }
            else if (rsi15m >= 35 && rsi15m <= 55 && rsiFalling) { shortScore += 2; shortFactors.push('RSI Momentum: Bearish Falling'); }
        }

        // 6. Candle Pattern (weight: 2)
        if (candlePattern15m === 'BULLISH_ENGULFING' || candlePattern15m === 'HAMMER') { longScore += 2; longFactors.push(`Pattern 15m: ${candlePattern15m}`); }
        else if (candlePattern15m === 'BEARISH_ENGULFING' || candlePattern15m === 'SHOOTING_STAR') { shortScore += 2; shortFactors.push(`Pattern 15m: ${candlePattern15m}`); }

        // 7. 24h Momentum (weight: 1)
        const change24h = ticker ? ticker.change24h : 0;
        if (change24h > 3)  { longScore += 1; longFactors.push('High 24h Bullish Momentum'); }
        if (change24h < -3) { shortScore += 1; shortFactors.push('High 24h Bearish Momentum'); }

        // 8. ADX Trend Strength (weight: 1)
        if (adx1h > 25) {
            if (trend1h === 'UPTREND')   { longScore += 1; longFactors.push(`ADX Strong Trend (${fmt(adx1h,1)})`); }
            else if (trend1h === 'DOWNTREND') { shortScore += 1; shortFactors.push(`ADX Strong Trend (${fmt(adx1h,1)})`); }
        }

        // 9. Volume Spike Confirmation (weight: 1)
        if (volSpike15m) {
            if (close15m > ema20_15m) { longScore += 1; longFactors.push('Volume Spike Confirmation'); }
            else                       { shortScore += 1; shortFactors.push('Volume Spike Confirmation'); }
        }

        // 10. VWAP Bias (weight: 2)
        if (vwap15m) {
            if (close15m > vwap15m) { longScore += 2; longFactors.push('Above VWAP: Bullish Bias'); }
            else                     { shortScore += 2; shortFactors.push('Below VWAP: Bearish Bias'); }
        }

        // 11. 4H Trend Alignment (weight: 2)
        if (trend4h === 'UPTREND')   { longScore += 2; longFactors.push('4H Trend: Bullish'); }
        else if (trend4h === 'DOWNTREND') { shortScore += 2; shortFactors.push('4H Trend: Bearish'); }

        // 12. RSI Divergence (weight: 3 — high conviction reversal signal)
        if (divergence15m === 'BULLISH_DIVERGENCE') { longScore += 3; longFactors.push('RSI Bullish Divergence 15m'); }
        else if (divergence15m === 'BEARISH_DIVERGENCE') { shortScore += 3; shortFactors.push('RSI Bearish Divergence 15m'); }

        // Skip pair on tied score — no clear directional bias
        if (longScore === shortScore) return null;

        const direction  = longScore > shortScore ? 'LONG' : 'SHORT';
        const finalScore = direction === 'LONG' ? longScore : shortScore;
        const factors    = direction === 'LONG' ? longFactors : shortFactors;

        // ── FILTER 2: Block counter-trend vs 4H ─────────────────────────────
        if (trend4h !== 'RANGING') {
            if (direction === 'LONG'  && trend4h === 'DOWNTREND') return null;
            if (direction === 'SHORT' && trend4h === 'UPTREND')   return null;
        }

        // ── FILTER 3: Funding Rate extreme ──────────────────────────────────
        if (fundingRate !== null) {
            if (direction === 'LONG'  && fundingRate > 0.1)  return null; // over-leveraged long, squeeze risk
            if (direction === 'SHORT' && fundingRate < -0.1) return null; // over-leveraged short, squeeze risk
        }

        // Tentukan apakah 5m aligned dengan sinyal
        if (confirm5m.rsi !== null) {
            const rsi5m = confirm5m.rsi;
            if (direction === 'LONG') {
                confirm5m.aligned = confirm5m.trend === 'UP' && rsi5m > 45 && rsi5m < 75 && confirm5m.rsiRising;
            } else {
                confirm5m.aligned = confirm5m.trend === 'DOWN' && rsi5m < 55 && rsi5m > 25 && !confirm5m.rsiRising;
            }
        }

        const atr15m = calcATR(candles15m, 14);
        const price  = close15m;
        let sl, tp;

        // Wider ATR multipliers to avoid noise stop-outs
        if (direction === 'LONG') {
            sl = price - (atr15m * 2.0);
            tp = price + (atr15m * 3.5);
        } else {
            sl = price + (atr15m * 2.0);
            tp = price - (atr15m * 3.5);
        }

        const risk   = Math.abs(price - sl);
        const reward = Math.abs(tp - price);
        const rr     = risk > 0 ? parseFloat((reward / risk).toFixed(2)) : 1.75;

        return {
            symbol, pair: pair.name,
            direction, price, sl, tp, rr,
            score: finalScore, factors, rsi: rsi15m,
            trend4h, trend1h, trend15m: close15m > ema20_15m ? 'UP' : 'DOWN',
            marketCondition: (atr15m / price * 100) > 2 ? 'Volatile' : 'Trending',
            change24h: change24h || 0,
            vwap: vwap15m,
            fundingRate: fundingRate !== null ? fundingRate : null,
            confirm5m,
        };
    } catch (err) {
        console.error(`[ProScanner] Error on ${pair.symbol}:`, err.message);
        return null;
    }
}

async function fastScan(topN = 1) {
    // ── FILTER 4: Session filter — skip low-liquidity inter-session ──────────
    const session = getSession();
    if (!session.active) throw new Error(`INTER_SESSION:${session.name}`);

    const results = await Promise.allSettled(PRO_PAIRS.map(p => analyzeProAsset(p)));
    const valid = results
        .filter(r => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
        .filter(s => s.score >= MINIMUM_SIGNAL_SCORE);

    if (valid.length === 0) {
        throw new Error(`NO_QUALITY_SETUP`);
    }

    valid.sort((a, b) => b.score - a.score);
    return topN === 1 ? valid[0] : valid.slice(0, topN);
}

module.exports = { fastScan, analyzeProAsset, PRO_PAIRS, MINIMUM_SIGNAL_SCORE };
