'use strict';
const axios = require('axios');

const BINANCE = 'https://api.binance.com/api/v3';

async function getKlines(symbol, interval, limit = 200) {
  const { data } = await axios.get(`${BINANCE}/klines`, {
    params: { symbol, interval, limit },
    timeout: 12000
  });
  return data.map(c => ({
    time: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5]
  }));
}

async function getTicker(symbol) {
  const { data } = await axios.get(`${BINANCE}/ticker/24hr`, {
    params: { symbol }, timeout: 8000
  });
  return { price: +data.lastPrice, change24h: +data.priceChangePercent, volume: +data.quoteVolume };
}

async function getFundingRate(symbol) {
  try {
    const { data } = await axios.get('https://fapi.binance.com/fapi/v1/fundingRate', {
      params: { symbol: symbol.replace('/', ''), limit: 1 }, timeout: 8000
    });
    return data[0] ? +data[0].fundingRate * 100 : null;
  } catch { return null; }
}

async function getOpenInterest(symbol) {
  try {
    const { data } = await axios.get('https://fapi.binance.com/fapi/v1/openInterest', {
      params: { symbol: symbol.replace('/', '') }, timeout: 8000
    });
    return +data.openInterest;
  } catch { return null; }
}

module.exports = { getKlines, getTicker, getFundingRate, getOpenInterest };
