'use strict';
const fs = require('fs');
const path = require('path');

const ALERTS_FILE = path.join(__dirname, '.claude', 'crypto-alerts.json');

function ensureAlertsFile() {
  const dir = path.dirname(ALERTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ALERTS_FILE)) {
    fs.writeFileSync(ALERTS_FILE, JSON.stringify({ alerts: [] }, null, 2));
  }
}

function readAlerts() {
  ensureAlertsFile();
  try {
    const data = fs.readFileSync(ALERTS_FILE, 'utf8');
    return JSON.parse(data).alerts || [];
  } catch (err) {
    console.error('[Alert Storage Error]', err.message);
    return [];
  }
}

function saveAlert(alertData) {
  ensureAlertsFile();
  try {
    const alerts = readAlerts();
    const newAlert = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...alertData
    };
    alerts.push(newAlert);

    fs.writeFileSync(
      ALERTS_FILE,
      JSON.stringify({ alerts }, null, 2)
    );

    return newAlert;
  } catch (err) {
    console.error('[saveAlert Error]', err.message);
    return null;
  }
}

function getAlerts(days = 7) {
  const allAlerts = readAlerts();
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  return allAlerts.filter(a => new Date(a.timestamp).getTime() > cutoff);
}

function getAlertStats(days = 30) {
  const alerts = getAlerts(days);

  const stats = {
    total: alerts.length,
    byEvent: {},
    byOutcome: { bullish: 0, bearish: 0, neutral: 0 },
    avgImpact: 0,
    accuracy: 0
  };

  let totalImpact = 0;

  alerts.forEach(alert => {
    // Group by event
    const event = alert.eventName || 'unknown';
    if (!stats.byEvent[event]) {
      stats.byEvent[event] = { count: 0, totalChange: 0, avgChange: 0 };
    }
    stats.byEvent[event].count++;
    stats.byEvent[event].totalChange += alert.priceChangePercent || 0;

    // Group by outcome
    if (alert.priceChangePercent > 0.5) {
      stats.byOutcome.bullish++;
    } else if (alert.priceChangePercent < -0.5) {
      stats.byOutcome.bearish++;
    } else {
      stats.byOutcome.neutral++;
    }

    totalImpact += Math.abs(alert.priceChangePercent || 0);
  });

  // Calculate averages
  stats.avgImpact = alerts.length > 0 ? (totalImpact / alerts.length).toFixed(2) : 0;

  Object.keys(stats.byEvent).forEach(event => {
    stats.byEvent[event].avgChange =
      (stats.byEvent[event].totalChange / stats.byEvent[event].count).toFixed(2);
  });

  return stats;
}

function clearOldAlerts(daysToKeep = 30) {
  try {
    const alerts = readAlerts();
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const filtered = alerts.filter(a => new Date(a.timestamp).getTime() > cutoff);

    fs.writeFileSync(
      ALERTS_FILE,
      JSON.stringify({ alerts: filtered }, null, 2)
    );

    return { removed: alerts.length - filtered.length, remaining: filtered.length };
  } catch (err) {
    console.error('[clearOldAlerts Error]', err.message);
    return null;
  }
}

module.exports = {
  saveAlert,
  getAlerts,
  getAlertStats,
  clearOldAlerts,
  readAlerts
};
