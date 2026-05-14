'use strict';
const axios = require('axios');

const BINANCE_API = 'https://api.binance.com/api/v3';
const CG_API = 'https://api.coingecko.com/api/v3';

class PriceMonitor {
  constructor() {
    this.priceHistory = {};
    this.monitors = new Map();
  }

  async startMonitoring(symbol, intervalMs = 5000, durationMs = 300000) {
    const key = `${symbol}_monitor`;

    if (this.monitors.has(key)) {
      return { status: 'already_monitoring', symbol };
    }

    const startTime = Date.now();
    const prices = [];

    return new Promise((resolve) => {
      const intervalId = setInterval(async () => {
        try {
          const price = await this.getCurrentPrice(symbol);
          if (price) {
            prices.push({
              timestamp: Date.now(),
              price,
              secondsElapsed: (Date.now() - startTime) / 1000
            });
          }

          if (Date.now() - startTime > durationMs) {
            clearInterval(intervalId);
            this.monitors.delete(key);
            this.priceHistory[symbol] = prices;
            resolve({
              status: 'completed',
              symbol,
              priceHistory: prices,
              highPrice: Math.max(...prices.map(p => p.price)),
              lowPrice: Math.min(...prices.map(p => p.price)),
              startPrice: prices[0].price,
              endPrice: prices[prices.length - 1].price
            });
          }
        } catch (err) {
          console.error(`[PriceMonitor Error] ${symbol}:`, err.message);
        }
      }, intervalMs);

      this.monitors.set(key, intervalId);
    });
  }

  async getCurrentPrice(symbol) {
    try {
      const pair = `${symbol.toUpperCase()}USDT`;
      const { data } = await axios.get(`${BINANCE_API}/ticker/price`, {
        params: { symbol: pair },
        timeout: 5000
      });
      return parseFloat(data.price);
    } catch (err) {
      console.error(`[getCurrentPrice Error] ${symbol}:`, err.message);
      return null;
    }
  }

  async getPriceAt(symbol, targetSeconds) {
    const history = this.priceHistory[symbol] || [];
    const closest = history.reduce((prev, curr) => {
      return Math.abs(curr.secondsElapsed - targetSeconds) <
             Math.abs(prev.secondsElapsed - targetSeconds) ? curr : prev;
    });
    return closest?.price || null;
  }

  getMonitoringStatus() {
    return Array.from(this.monitors.keys()).map(key => {
      const [symbol] = key.split('_');
      return { symbol, monitoring: true };
    });
  }

  stopMonitoring(symbol) {
    const key = `${symbol}_monitor`;
    if (this.monitors.has(key)) {
      clearInterval(this.monitors.get(key));
      this.monitors.delete(key);
      return { status: 'stopped', symbol };
    }
    return { status: 'not_monitoring', symbol };
  }

  stopAllMonitoring() {
    this.monitors.forEach((intervalId) => clearInterval(intervalId));
    this.monitors.clear();
    return { status: 'all_stopped', count: this.monitors.size };
  }
}

module.exports = new PriceMonitor();
