'use strict';
const priceMonitor = require('./price-monitor');
const { saveAlert, getAlertStats } = require('./alert-storage');
const { getUpcomingEvents, getEventCryptoImpact } = require('./economic-calendar');
const { fmt, pct, nowWIB } = require('./utils');

const ACTIVE_ALERTS = new Map();

async function monitorEventImpact(bot, chatId, eventName, symbol = 'BTC', options = {}) {
  const {
    monitorDuration = 300000, // 5 minutes
    checkInterval = 5000,     // Check every 5 seconds
    alertThreshold = 1.0      // Alert if >1% movement
  } = options;

  const alertId = `${eventName}_${symbol}_${Date.now()}`;

  try {
    // Get pre-event price
    const preEventPrice = await priceMonitor.getCurrentPrice(symbol);
    if (!preEventPrice) {
      await bot.sendMessage(chatId, `❌ Could not get current price for ${symbol}`);
      return null;
    }

    // Notify monitoring started
    await bot.sendMessage(chatId,
      `🚨 <b>REAL-TIME ALERT ACTIVATED</b>\n\n` +
      `Event: ${eventName}\n` +
      `Asset: ${symbol}\n` +
      `Pre-event Price: $${fmt(preEventPrice, 2)}\n` +
      `Monitoring Duration: ${monitorDuration / 60000} minutes\n\n` +
      `📡 Tracking price changes...`,
      { parse_mode: 'HTML' }
    );

    // Start monitoring
    ACTIVE_ALERTS.set(alertId, {
      eventName,
      symbol,
      preEventPrice,
      startTime: Date.now(),
      active: true
    });

    const result = await priceMonitor.startMonitoring(symbol, checkInterval, monitorDuration);

    if (!result || !result.priceHistory || result.priceHistory.length === 0) {
      await bot.sendMessage(chatId, `❌ No price data collected during monitoring period`);
      ACTIVE_ALERTS.delete(alertId);
      return null;
    }

    const priceHistory = result.priceHistory;
    const postEventPrice = result.endPrice;
    const highPrice = result.highPrice;
    const lowPrice = result.lowPrice;

    // Calculate impact
    const priceChange = postEventPrice - preEventPrice;
    const priceChangePercent = (priceChange / preEventPrice) * 100;
    const highSwing = ((highPrice - preEventPrice) / preEventPrice) * 100;
    const lowSwing = ((lowPrice - preEventPrice) / preEventPrice) * 100;

    // Determine impact direction
    const direction = priceChangePercent > 0 ? 'BULLISH' : priceChangePercent < 0 ? 'BEARISH' : 'NEUTRAL';
    const emoji = priceChangePercent > 0 ? '📈' : priceChangePercent < 0 ? '📉' : '➡️';

    // Get crypto impact expectation
    const cryptoImpact = getEventCryptoImpact(eventName);

    // Generate alert message
    let alertMsg = `${emoji} <b>EVENT IMPACT DETECTED!</b>\n\n`;
    alertMsg += `<b>Event:</b> ${eventName}\n`;
    alertMsg += `<b>Asset:</b> ${symbol}\n\n`;

    alertMsg += `<b>💹 PRICE MOVEMENT</b>\n`;
    alertMsg += `Pre-event: $${fmt(preEventPrice, 2)}\n`;
    alertMsg += `Post-event: $${fmt(postEventPrice, 2)}\n`;
    alertMsg += `Change: <b>${pct(priceChangePercent)}</b>\n\n`;

    alertMsg += `<b>📊 SWING ANALYSIS</b>\n`;
    alertMsg += `High: $${fmt(highPrice, 2)} (${pct(highSwing)})\n`;
    alertMsg += `Low: $${fmt(lowPrice, 2)} (${pct(lowSwing)})\n`;
    alertMsg += `Total Swing: ${pct(highSwing - lowSwing)}\n\n`;

    alertMsg += `<b>🎯 VERDICT:</b> <b>${direction}</b>\n`;
    alertMsg += `Expected Assets: ${cryptoImpact.assets.join(', ')}\n`;
    alertMsg += `Volatility Level: ${cryptoImpact.volatility.toUpperCase()}\n\n`;

    alertMsg += `⏱️ Monitored: ${(monitorDuration / 1000).toFixed(0)}s\n`;
    alertMsg += `🔍 Data points: ${priceHistory.length}`;

    // Send alert
    await bot.sendMessage(chatId, alertMsg, { parse_mode: 'HTML' });

    // Save alert
    const savedAlert = saveAlert({
      eventName,
      symbol,
      preEventPrice,
      postEventPrice,
      priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
      highPrice,
      lowPrice,
      direction,
      volatilityLevel: cryptoImpact.volatility,
      monitoringDuration: monitorDuration,
      dataPoints: priceHistory.length,
      triggeredThreshold: alertThreshold
    });

    // Mark alert as inactive
    ACTIVE_ALERTS.delete(alertId);

    return {
      success: true,
      alertId: savedAlert.id,
      impact: priceChangePercent,
      direction
    };

  } catch (err) {
    console.error('[monitorEventImpact Error]', err.message);
    await bot.sendMessage(chatId, `❌ <b>Monitoring Error:</b> ${err.message}`);
    ACTIVE_ALERTS.delete(alertId);
    return null;
  }
}

async function autoMonitorUpcomingEvents(bot, chatId, hoursAhead = 1) {
  try {
    const events = await getUpcomingEvents(hoursAhead);
    if (events.length === 0) {
      await bot.sendMessage(chatId, `✅ No high-impact events in next ${hoursAhead} hours`);
      return [];
    }

    const highImpactEvents = events.filter(e => e.impact.toLowerCase() === 'high');
    if (highImpactEvents.length === 0) {
      await bot.sendMessage(chatId, `📊 Found ${events.length} medium-impact events, but no HIGH impact events`);
      return [];
    }

    let setupMsg = `🚨 <b>AUTO-MONITOR SETUP</b>\n\n`;
    setupMsg += `Found <b>${highImpactEvents.length}</b> high-impact events:\n\n`;

    for (const event of highImpactEvents) {
      const timeUntil = getTimeUntilEvent(event.timestamp);
      setupMsg += `📌 ${event.event}\n`;
      setupMsg += `   ⏰ ${timeUntil}\n`;
      setupMsg += `   📍 ${event.country}\n\n`;
    }

    setupMsg += `<i>Real-time monitoring will start 30s before each event and run for 5 minutes...</i>`;
    await bot.sendMessage(chatId, setupMsg, { parse_mode: 'HTML' });

    // Schedule monitoring for each event
    const monitors = highImpactEvents.map(event => {
      const timeUntilMs = event.timestamp - Date.now();
      const startDelay = Math.max(0, timeUntilMs - 30000); // Start 30s before

      setTimeout(() => {
        const cryptoImpact = getEventCryptoImpact(event.event);
        const symbol = cryptoImpact.assets[0] || 'BTC';

        monitorEventImpact(bot, chatId, event.event, symbol, {
          monitorDuration: 300000,
          checkInterval: 5000,
          alertThreshold: 1.0
        }).catch(err => console.error('Auto-monitor failed:', err));
      }, startDelay);

      return { event: event.event, scheduledIn: startDelay };
    });

    return monitors;
  } catch (err) {
    console.error('[autoMonitorUpcomingEvents Error]', err.message);
    await bot.sendMessage(chatId, `❌ Error setting up auto-monitoring: ${err.message}`);
    return [];
  }
}

function getActiveAlerts() {
  return Array.from(ACTIVE_ALERTS.entries()).map(([id, alert]) => ({
    alertId: id,
    ...alert
  }));
}

async function getAlertReport(days = 7) {
  const stats = getAlertStats(days);

  let report = `📊 <b>ALERT STATISTICS (${days} days)</b>\n`;
  report += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  report += `<b>📈 Summary</b>\n`;
  report += `Total Alerts: ${stats.total}\n`;
  report += `Bullish: ${stats.byOutcome.bullish} | Bearish: ${stats.byOutcome.bearish} | Neutral: ${stats.byOutcome.neutral}\n`;
  report += `Avg Impact: ${stats.avgImpact}%\n\n`;

  if (Object.keys(stats.byEvent).length > 0) {
    report += `<b>📌 By Event</b>\n`;
    Object.entries(stats.byEvent).forEach(([event, data]) => {
      report += `${event}: ${data.count}x (avg ${data.avgChange}%)\n`;
    });
  }

  report += `\n🔄 Last updated: ${nowWIB()}`;

  return report;
}

function getTimeUntilEvent(timestamp) {
  const now = new Date();
  const diff = timestamp - now;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  if (hours < 0) return 'Happening now!';
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

module.exports = {
  monitorEventImpact,
  autoMonitorUpcomingEvents,
  getActiveAlerts,
  getAlertReport
};
