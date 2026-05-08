'use strict';
const axios = require('axios');

const BINANCE_SPOT = 'https://api.binance.com/api/v3';
const BINANCE_FUTURES = 'https://fapi.binance.com/fapi/v1';

async function getKlines(symbol, interval, limit = 200) {
  try {
    const { data } = await axios.get(`${BINANCE_FUTURES}/klines`, {
      params: { symbol, interval, limit },
      timeout: 10000
    });
    return data.map(c => ({
      time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
    }));
  } catch (e) {
    // Fallback to spot if futures fails
    const { data } = await axios.get(`${BINANCE_SPOT}/klines`, {
      params: { symbol, interval, limit },
      timeout: 10000
    });
    return data.map(c => ({
      time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
    }));
  }
}

async function getTicker(symbol) {
  try {
    const { data } = await axios.get(`${BINANCE_FUTURES}/ticker/24hr`, {
      params: { symbol }, timeout: 8000
    });
    return { price: +data.lastPrice, change24h: +data.priceChangePercent, volume: +data.quoteVolume };
  } catch (e) {
    const { data } = await axios.get(`${BINANCE_SPOT}/ticker/24hr`, {
      params: { symbol }, timeout: 8000
    });
    return { price: +data.lastPrice, change24h: +data.priceChangePercent, volume: +data.quoteVolume };
  }
}

async function getAllTickers() {
  try {
    const { data } = await axios.get(`${BINANCE_FUTURES}/ticker/24hr`, { timeout: 15000 });
    return data.map(t => ({
      symbol: t.symbol,
      lastPrice: +t.lastPrice,
      priceChangePercent: +t.priceChangePercent,
      quoteVolume: +t.quoteVolume
    }));
  } catch (e) {
    const { data } = await axios.get(`${BINANCE_SPOT}/ticker/24hr`, { timeout: 15000 });
    return data.map(t => ({
      symbol: t.symbol,
      lastPrice: +t.lastPrice,
      priceChangePercent: +t.priceChangePercent,
      quoteVolume: +t.quoteVolume
    }));
  }
}

async function getFundingRate(symbol) {
  try {
    const { data } = await axios.get(`${BINANCE_FUTURES}/fundingRate`, {
      params: { symbol: symbol.replace('/', ''), limit: 1 }, timeout: 8000
    });
    return data[0] ? +data[0].fundingRate * 100 : null;
  } catch { return null; }
}

async function getOpenInterest(symbol) {
  try {
    const { data } = await axios.get(`${BINANCE_FUTURES}/openInterest`, {
      params: { symbol: symbol.replace('/', '') }, timeout: 8000
    });
    return +data.openInterest;
  } catch { return null; }
}

module.exports = { getKlines, getTicker, getAllTickers, getFundingRate, getOpenInterest };
