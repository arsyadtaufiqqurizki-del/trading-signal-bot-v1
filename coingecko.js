'use strict';
const axios = require('axios');

const CG_API = 'https://api.coingecko.com/api/v3';

async function getGlobalSentiment() {
  try {
    const { data } = await axios.get(`${CG_API}/global`, { timeout: 8000 });
    const btcDominance = data.data.market_cap_percentage.btc;
    const totalMarketCap = data.data.total_market_cap.usd;
    return {
      btcDominance,
      totalMarketCap,
      marketCondition: btcDominance > 50 ? 'BTC Leading' : 'Altcoin Season Potential'
    };
  } catch (err) {
    return null;
  }
}

async function getTrendingCoins() {
  try {
    const { data } = await axios.get(`${CG_API}/search/trending`, { timeout: 8000 });
    return data.coins.slice(0, 5).map(c => c.item.symbol.toUpperCase());
  } catch (err) {
    return [];
  }
}

module.exports = { getGlobalSentiment, getTrendingCoins };
