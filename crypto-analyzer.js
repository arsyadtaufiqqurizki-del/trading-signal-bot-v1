'use strict';
const { getUpcomingEvents, getEventCryptoImpact } = require('./economic-calendar');
const { getCurrentCryptoPrices, analyzePriceMovement, getImpactScore, compareEventPatterns } = require('./crypto-impact-tracker');
const { fmt, pct, nowWIB } = require('./utils');

async function runCryptoImpactAnalysis() {
  try {
    const upcomingEvents = await getUpcomingEvents(24);
    const cryptoPrices = await getCurrentCryptoPrices(['bitcoin', 'ethereum']);

    let report = `🔍 <b>CRYPTO MARKET MONITOR</b>\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📅 <i>${nowWIB()}</i>\n\n`;

    if (upcomingEvents.length === 0) {
      report += `✅ Tidak ada event ekonomi signifikan dalam 24 jam ke depan.\n`;
      report += `Market kondisi: <b>Stable</b>\n`;
      return report;
    }

    report += `📅 <b>UPCOMING ECONOMIC EVENTS (24h)</b>\n`;
    report += `┌─────────────────────────────────┐\n`;

    for (const event of upcomingEvents.slice(0, 3)) {
      const timeUntil = getTimeUntilEvent(event.timestamp);
      const impactEmoji = event.impact.toLowerCase() === 'high' ? '🔴' : '🟡';

      report += `\n${impactEmoji} <b>${event.event}</b>\n`;
      report += `├─ Country: ${event.country}\n`;
      report += `├─ Time: ${formatTime(event.timestamp)} (${timeUntil})\n`;

      if (event.previous !== null) {
        report += `├─ Previous: ${fmt(event.previous, 1)}\n`;
      }
      if (event.expected !== null) {
        report += `├─ Expected: ${fmt(event.expected, 1)}\n`;
      }
      if (event.actual !== null) {
        const diff = event.actual - (event.expected || event.previous);
        const beatMiss = diff > 0 ? '✅ Beat' : '❌ Miss';
        report += `├─ Actual: ${fmt(event.actual, 1)} ${beatMiss}\n`;
      }

      const cryptoImpact = getEventCryptoImpact(event.event);
      if (cryptoImpact.assets.length > 0) {
        report += `└─ Assets affected: ${cryptoImpact.assets.join(', ')}\n`;
      }
    }

    report += `┘\n\n`;

    report += `📊 <b>CURRENT MARKET STATE</b>\n`;
    report += `┌─────────────────────────────────┐\n`;

    for (const price of cryptoPrices) {
      const changeEmoji = price.change24h >= 0 ? '📈' : '📉';
      const changePct = pct(price.change24h);
      report += `${changeEmoji} <b>${price.symbol}</b>: <b>${fmt(price.price, 2)} USD</b> ${changePct}\n`;
    }

    report += `┘\n\n`;

    report += `⚠️ <b>VOLATILITY ALERT</b>\n`;
    for (const event of upcomingEvents.slice(0, 1)) {
      if (event.impact.toLowerCase() === 'high') {
        const volatilityLevel = getVolatilityLevel(event.event);
        report += `🚨 ${event.event}: Expected <b>±${volatilityLevel}%</b> swing\n`;
      }
    }

    report += `\n💡 <b>RECOMMENDATION</b>\n`;
    report += `• Monitor high-impact events closely\n`;
    report += `• Set tight stop-losses before announcements\n`;
    report += `• Expect increased volume post-event\n`;

    report += `\n🔄 <i>Last updated: ${nowWIB()}</i>`;

    return report;
  } catch (err) {
    console.error('[runCryptoImpactAnalysis Error]', err.message);
    return `❌ <b>Error:</b> ${err.message}`;
  }
}

async function getDetailedEventAnalysis(eventName) {
  try {
    const prices = await getCurrentCryptoPrices(['bitcoin', 'ethereum']);
    const movement = await analyzePriceMovement('BTC', 30, 60);
    const pattern = await compareEventPatterns(eventName, 'BTC');

    let report = `📈 <b>DETAILED IMPACT ANALYSIS</b>\n`;
    report += `Event: ${eventName}\n\n`;

    if (movement) {
      report += `Price Movement:\n`;
      report += `├─ Before: ${fmt(movement.beforePrice, 2)}\n`;
      report += `├─ After: ${fmt(movement.afterPrice, 2)}\n`;
      report += `├─ Change: ${pct(movement.priceChangePercent)}\n`;
      report += `└─ Volume Spike: ${fmt(movement.volumeMultiplier, 2)}x\n\n`;
    }

    if (pattern.historicalPattern) {
      report += `Historical Pattern:\n`;
      report += `├─ Avg Change: ${pct(pattern.historicalPattern.avgChange)}\n`;
      report += `├─ Win Rate: ${pattern.historicalPattern.wins}/${pattern.historicalPattern.wins + pattern.historicalPattern.losses}\n`;
      report += `└─ Confidence: ${pattern.historicalPattern.confidence}%\n`;
    }

    return report;
  } catch (err) {
    return `❌ Error: ${err.message}`;
  }
}

function getTimeUntilEvent(timestamp) {
  const now = new Date();
  const diff = timestamp - now;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours < 0) return 'Happened';
  if (hours === 0) return `${minutes} mins away`;
  return `${hours}h ${minutes}m away`;
}

function formatTime(date) {
  return date.toLocaleString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  });
}

function getVolatilityLevel(eventName) {
  const eventLower = eventName.toLowerCase();

  if (eventLower.includes('nonfarm') || eventLower.includes('fed funds')) return 5;
  if (eventLower.includes('cpi') || eventLower.includes('ppi')) return 4;
  if (eventLower.includes('interest rate')) return 4;
  if (eventLower.includes('unemployment')) return 3;

  return 2;
}

module.exports = {
  runCryptoImpactAnalysis,
  getDetailedEventAnalysis
};
