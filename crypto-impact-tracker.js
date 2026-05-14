'use strict';
const axios = require('axios');

const CG_API = 'https://api.coingecko.com/api/v3';
const BINANCE_API = 'https://api.binance.com/api/v3';

async function getCurrentCryptoPrices(symbols = ['bitcoin', 'ethereum']) {
  try {
    const { data } = await axios.get(`${CG_API}/simple/price`, {
      params: {
        ids: symbols.join(','),
        vs_currencies: 'usd',
        include_market_cap: true,
        include_24hr_vol_change: true
      },
      timeout: 8000
    });

    return Object.entries(data).map(([symbol, priceData]) => ({
      symbol: symbol.toUpperCase(),
      price: priceData.usd,
      marketCap: priceData.usd_market_cap,
      vol24h: priceData.usd_24h_vol,
      change24h: priceData.usd_24h_change || 0
    }));
  } catch (err) {
    console.error('[getCurrentCryptoPrices Error]', err.message);
    return [];
  }
}

async function getHistoricalPrice(symbol, minutes = 60) {
  try {
    const pair = `${symbol.toUpperCase()}USDT`;
    const interval = minutes <= 60 ? '1m' : '5m';
    const limit = minutes <= 60 ? minutes : Math.ceil(minutes / 5);

    const { data } = await axios.get(`${BINANCE_API}/klines`, {
      params: {
        symbol: pair,
        interval: interval,
        limit: Math.min(limit, 1000)
      },
      timeout: 8000
    });

    return data.map(candle => ({
      timestamp: new Date(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[7])
    }));
  } catch (err) {
    console.error('[getHistoricalPrice Error]', err.message);
    return [];
  }
}

async function analyzePriceMovement(symbol, beforeMinutes = 30, afterMinutes = 60) {
  try {
    const now = Date.now();
    const beforeTime = new Date(now - beforeMinutes * 60000);
    const afterTime = new Date(now - (beforeMinutes - afterMinutes) * 60000);

    const candles = await getHistoricalPrice(symbol, beforeMinutes + afterMinutes);
    if (candles.length === 0) return null;

    const beforeCandles = candles.filter(c => c.timestamp < beforeTime);
    const afterCandles = candles.filter(c => c.timestamp >= beforeTime && c.timestamp <= afterTime);

    if (beforeCandles.length === 0 || afterCandles.length === 0) {
      return null;
    }

    const beforePrice = beforeCandles[beforeCandles.length - 1].close;
    const afterPrice = afterCandles[afterCandles.length - 1].close;
    const highAfter = Math.max(...afterCandles.map(c => c.high));
    const lowAfter = Math.min(...afterCandles.map(c => c.low));

    const priceChange = afterPrice - beforePrice;
    const priceChangePercent = (priceChange / beforePrice) * 100;
    const volumeChange = afterCandles.reduce((sum, c) => sum + c.volume, 0) /
                          (beforeCandles.reduce((sum, c) => sum + c.volume, 0) || 1);

    return {
      symbol: symbol.toUpperCase(),
      beforePrice,
      afterPrice,
      priceChange,
      priceChangePercent,
      highAfter,
      lowAfter,
      swingPercent: ((highAfter - lowAfter) / lowAfter) * 100,
      volumeMultiplier: volumeChange,
      volatilityRise: afterCandles.length > 0 ? 'high' : 'low'
    };
  } catch (err) {
    console.error('[analyzePriceMovement Error]', err.message);
    return null;
  }
}

async function getImpactScore(symbol, eventImpact = 'medium') {
  try {
    const prices = await getCurrentCryptoPrices([symbol.toLowerCase()]);
    if (prices.length === 0) return null;

    const change24h = prices[0].change24h || 0;
    const vol24h = prices[0].vol24h || 0;

    let baseScore = Math.abs(change24h) / 2;

    if (eventImpact === 'high') baseScore *= 1.5;
    else if (eventImpact === 'low') baseScore *= 0.7;

    const volumeBoost = vol24h > 1000000000 ? 1.2 : 0.9;
    const finalScore = Math.min(100, baseScore * volumeBoost);

    return {
      symbol: symbol.toUpperCase(),
      impactScore: Math.round(finalScore),
      confidence: Math.round(Math.min(100, baseScore + 20)),
      reasoning: change24h > 0 ? 'Bullish momentum detected' : 'Bearish pressure observed'
    };
  } catch (err) {
    console.error('[getImpactScore Error]', err.message);
    return null;
  }
}

async function compareEventPatterns(eventName, symbol) {
  const historicalPatterns = {
    'NFP': {
      'BTC': { avgChange: 0.8, wins: 7, losses: 3, confidence: 70 },
      'ETH': { avgChange: 0.6, wins: 6, losses: 4, confidence: 60 }
    },
    'CPI': {
      'BTC': { avgChange: -1.2, wins: 4, losses: 6, confidence: 40 },
      'ETH': { avgChange: -0.9, wins: 3, losses: 7, confidence: 30 }
    },
    'Fed Funds Rate': {
      'BTC': { avgChange: -2.1, wins: 3, losses: 7, confidence: 30 },
      'ETH': { avgChange: -1.8, wins: 2, losses: 8, confidence: 20 }
    },
    'Interest Rate': {
      'BTC': { avgChange: -1.5, wins: 4, losses: 6, confidence: 40 },
      'ETH': { avgChange: -1.2, wins: 3, losses: 7, confidence: 30 }
    }
  };

  const eventKey = Object.keys(historicalPatterns).find(key => eventName.includes(key));
  if (!eventKey) {
    return {
      symbol,
      eventName,
      historicalPattern: null,
      recommendation: 'Insufficient historical data'
    };
  }

  const symKey = symbol.toUpperCase();
  const pattern = historicalPatterns[eventKey][symKey] || historicalPatterns[eventKey]['BTC'];

  return {
    symbol: symKey,
    eventName,
    historicalPattern: pattern,
    recommendation: pattern.confidence >= 60 ? 'Monitor closely' : 'Data inconclusive'
  };
}

module.exports = {
  getCurrentCryptoPrices,
  getHistoricalPrice,
  analyzePriceMovement,
  getImpactScore,
  compareEventPatterns
};
