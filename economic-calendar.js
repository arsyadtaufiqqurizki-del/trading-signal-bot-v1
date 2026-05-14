'use strict';
const axios = require('axios');

const FINNHUB_API = 'https://finnhub.io/api/v1';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

const HIGH_IMPACT_EVENTS = [
  'Non-Farm Payroll',
  'Initial Jobless Claims',
  'CPI',
  'PPI',
  'Unemployment Rate',
  'Retail Sales',
  'Consumer Confidence',
  'ISM Manufacturing',
  'ISM Services',
  'Fed Funds Rate',
  'Interest Rate Decision',
  'Monetary Policy Decision',
  'ECB Interest Rate Decision',
  'BOJ Interest Rate',
  'China Manufacturing PMI',
  'Nonfarm Payroll',
  'ADP Employment'
];

async function getUpcomingEvents(hoursFromNow = 24) {
  try {
    const from = Math.floor(Date.now() / 1000);
    const to = from + (hoursFromNow * 3600);

    const { data } = await axios.get(`${FINNHUB_API}/economic-calendar`, {
      params: {
        token: FINNHUB_KEY,
        from,
        to
      },
      timeout: 8000
    });

    if (!data || !Array.isArray(data)) return [];

    const highImpactEvents = data
      .filter(event => {
        const importance = event.impact || 'low';
        return ['high', 'medium'].includes(importance.toLowerCase());
      })
      .filter(event => {
        const eventName = event.event || '';
        return HIGH_IMPACT_EVENTS.some(keyword => eventName.includes(keyword));
      })
      .map(event => ({
        event: event.event || 'Unknown',
        country: event.country || 'Global',
        timestamp: event.date ? new Date(event.date * 1000) : null,
        expected: event.estimate || null,
        previous: event.prev || null,
        actual: event.actual || null,
        impact: event.impact || 'medium',
        forecast: event.forecast || null,
        unit: event.unit || ''
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return highImpactEvents;
  } catch (err) {
    console.error('[EconomicCalendar Error]', err.message);
    return [];
  }
}

async function getEventsBetween(fromHours, toHours) {
  try {
    const from = Math.floor(Date.now() / 1000) + (fromHours * 3600);
    const to = Math.floor(Date.now() / 1000) + (toHours * 3600);

    const { data } = await axios.get(`${FINNHUB_API}/economic-calendar`, {
      params: {
        token: FINNHUB_KEY,
        from,
        to
      },
      timeout: 8000
    });

    if (!data || !Array.isArray(data)) return [];

    return data
      .filter(e => ['high', 'medium'].includes((e.impact || 'low').toLowerCase()))
      .map(event => ({
        event: event.event,
        country: event.country,
        timestamp: new Date(event.date * 1000),
        expected: event.estimate,
        previous: event.prev,
        actual: event.actual,
        impact: event.impact
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error('[EventsBetween Error]', err.message);
    return [];
  }
}

function getEventCryptoImpact(eventName) {
  const eventLower = eventName.toLowerCase();

  const impactMap = {
    'nonfarm payroll': { assets: ['BTC', 'ETH', 'USD'], direction: 'variable', volatility: 'high' },
    'cpi': { assets: ['BTC', 'ETH', 'DXY'], direction: 'inverse to inflation', volatility: 'high' },
    'fed funds rate': { assets: ['BTC', 'ETH', 'USDT'], direction: 'inverse', volatility: 'very high' },
    'unemployment rate': { assets: ['BTC', 'ETH'], direction: 'variable', volatility: 'medium' },
    'interest rate decision': { assets: ['BTC', 'ETH', 'EUR'], direction: 'inverse', volatility: 'high' },
    'retail sales': { assets: ['BTC', 'ETH'], direction: 'positive on growth', volatility: 'medium' },
    'ppi': { assets: ['BTC', 'ETH'], direction: 'inverse to inflation', volatility: 'high' },
    'ism manufacturing': { assets: ['BTC', 'ETH'], direction: 'positive on strength', volatility: 'medium' }
  };

  for (const [key, value] of Object.entries(impactMap)) {
    if (eventLower.includes(key)) {
      return value;
    }
  }

  return { assets: ['BTC', 'ETH'], direction: 'variable', volatility: 'medium' };
}

module.exports = {
  getUpcomingEvents,
  getEventsBetween,
  getEventCryptoImpact
};
