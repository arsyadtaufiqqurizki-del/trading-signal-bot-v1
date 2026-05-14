# 🚨 Real-Time Crypto Alerts Guide

## Overview

The real-time alert system monitors economic events and tracks their immediate impact on crypto prices in real-time.

## Features

✅ **Real-time Price Monitoring** — Track price changes every 5 seconds during events  
✅ **Automatic Alerts** — Get notified when price swings detected (>1% movement)  
✅ **Historical Tracking** — Store all alerts for pattern analysis  
✅ **Auto-Monitor** — Automatically monitor upcoming high-impact events  
✅ **Statistics** — View event impact statistics over time  

---

## Commands

### 1. Manual Event Monitoring
```
/crypto alert NFP BTC
/crypto alert CPI ETH
/crypto alert "Fed Rate" BTC
```

**What it does:**
- Starts real-time monitoring for specific event
- Tracks price 30 seconds before to 5 minutes after
- Sends detailed impact report when complete
- Stores data for historical analysis

**Example Output:**
```
📈 EVENT IMPACT DETECTED!

Event: Non-Farm Payroll
Asset: BTC

💹 PRICE MOVEMENT
Pre-event: $67,234.50
Post-event: $67,890.20
Change: +0.97%

📊 SWING ANALYSIS
High: $68,123.00 (+1.32%)
Low: $67,100.00 (-0.20%)
Total Swing: +1.52%

🎯 VERDICT: BULLISH
Expected Assets: BTC, ETH, USD
Volatility Level: HIGH

⏱️ Monitored: 300s
🔍 Data points: 61
```

---

### 2. Auto-Monitor Upcoming Events
```
/crypto auto
```

**What it does:**
- Scans next 2 hours for high-impact economic events
- Automatically monitors each event
- Monitoring starts 30 seconds before event, runs 5 minutes after
- No manual intervention needed

**Example:**
```
🚨 AUTO-MONITOR SETUP

Found 2 high-impact events:

📌 Non-Farm Payroll
   ⏰ 45m away
   📍 United States

📌 Fed Speaker (Powell)
   ⏰ 2h 15m away
   📍 United States

Real-time monitoring will start 30s before each event and run for 5 minutes...
```

---

### 3. View Alert Statistics
```
/crypto report
/crypto report 7
/crypto report 30
```

**Parameters:**
- No parameter = last 7 days
- `7` = last 7 days
- `30` = last 30 days

**Example Output:**
```
📊 ALERT STATISTICS (7 days)
━━━━━━━━━━━━━━━━━━━━━━━━

📈 Summary
Total Alerts: 12
Bullish: 8 | Bearish: 3 | Neutral: 1
Avg Impact: 1.24%

📌 By Event
Non-Farm Payroll: 2x (avg +0.87%)
CPI: 3x (avg -0.42%)
Fed Rate: 1x (avg -1.81%)
```

---

### 4. View Active Monitoring
```
/crypto active
```

**Shows:**
- List of currently running monitors
- How long each has been running
- Which events/assets are being tracked

**Example:**
```
🚨 ACTIVE MONITORING

1. Non-Farm Payroll / BTC
   Running for: 45s

2. ECB Decision / ETH
   Running for: 12s
```

---

### 5. Stop All Monitoring
```
/crypto stop
```

**What it does:**
- Immediately stops all active price monitors
- Saves any partial data
- Cleans up resources

---

## How It Works

### Real-Time Monitoring Flow

```
1. User sends: /crypto alert NFP BTC
2. System gets current BTC price: $67,234
3. Sends confirmation: "Monitoring started..."
4. Every 5 seconds for 5 minutes:
   - Fetch latest BTC price from Binance
   - Store timestamp + price
5. After 5 minutes:
   - Calculate: high, low, change %
   - Determine: bullish/bearish/neutral
   - Get historical pattern data
   - Send detailed alert report
   - Save to alert history
```

### Auto-Monitor Flow

```
1. User sends: /crypto auto
2. System fetches next 2 hours of events
3. For each HIGH-impact event:
   - Calculate when event happens
   - Schedule monitoring to start 30s before
   - Schedule monitoring to run 5 minutes after
4. When event time arrives:
   - Automatically start price monitoring
   - Send real-time alert when complete
```

---

## Data Storage

All alerts are stored in `.claude/crypto-alerts.json`:

```json
{
  "alerts": [
    {
      "id": 1715776234567,
      "timestamp": "2026-05-15T09:45:23.456Z",
      "eventName": "Non-Farm Payroll",
      "symbol": "BTC",
      "preEventPrice": 67234.50,
      "postEventPrice": 67890.20,
      "priceChangePercent": 0.97,
      "highPrice": 68123.00,
      "lowPrice": 67100.00,
      "direction": "BULLISH",
      "volatilityLevel": "high",
      "monitoringDuration": 300000,
      "dataPoints": 61
    }
  ]
}
```

---

## Configuration

### Adjust Monitoring Parameters

Edit `crypto-alerts.js` to customize:

```javascript
// Monitoring duration (default: 5 minutes)
monitorDuration = 300000

// Check interval (default: every 5 seconds)
checkInterval = 5000

// Alert threshold (default: >1% movement)
alertThreshold = 1.0
```

### Example: Monitor for 10 Minutes

```javascript
await monitorEventImpact(bot, chatId, 'NFP', 'BTC', {
  monitorDuration: 600000,    // 10 minutes
  checkInterval: 3000,         // Every 3 seconds
  alertThreshold: 0.5          // Alert on >0.5%
});
```

---

## Understanding Alert Statistics

### Bullish vs Bearish
- **Bullish**: Price increased >0.5% post-event
- **Bearish**: Price decreased >0.5% post-event
- **Neutral**: Price changed ≤0.5%

### Impact Calculation
- **Average Impact** = average absolute price change across all alerts
- Example: If NFP historically causes 1.24% swings, that's the "Avg Impact"

### Confidence Score
- Based on historical pattern matching
- Higher = more reliable prediction
- Stored with each alert

---

## Common Use Cases

### Case 1: Monitor Specific Economic Event
```
Market situation: ECB rate decision happening soon
Action: /crypto alert ECB ETH
Result: Real-time tracking + alert when ECB decision impacts ETH
```

### Case 2: Scan for Opportunities
```
Time: Morning trading session
Action: /crypto auto
Result: Auto-monitors all high-impact events today
Use to: Catch opportunities as they happen
```

### Case 3: Analyze Patterns
```
After several days of trading:
Action: /crypto report 7
Result: See which events consistently move the market
Use to: Adjust trading strategy based on patterns
```

### Case 4: Emergency Stop
```
System overload or unexpected issues:
Action: /crypto stop
Result: All monitoring stops immediately
```

---

## Troubleshooting

### Issue: "Could not get current price"
**Cause:** Binance API temporarily unavailable  
**Solution:** Try again in 30 seconds, or check internet connection

### Issue: "No price data collected"
**Cause:** Network issue during monitoring period  
**Solution:** Re-run the alert, check connection

### Issue: Alerts not storing
**Cause:** `.claude` directory permission issue  
**Solution:** Ensure `.claude` folder has write permission

### Issue: Auto-monitor not starting
**Cause:** No high-impact events in next 2 hours  
**Solution:** Check `/crypto` to see upcoming events, use manual alert instead

---

## Performance & Limits

- **Max concurrent monitors**: Unlimited (but not recommended >5)
- **Data points per alert**: ~60 (one every 5 seconds for 5 min)
- **Storage**: ~1KB per alert (negligible)
- **API calls per alert**: ~61 (Binance price checks)
- **Rate limits**: Binance API allows 1200 requests/minute (no issues)

---

## Future Improvements

Planned features:
- 📧 Email notifications for alerts
- 📱 Push notifications to mobile
- 🔔 Custom alert thresholds
- 📈 Advanced pattern matching with ML
- 🌐 Multi-exchange price correlation
- 💾 Export alerts to CSV

---

## Questions?

Commands:
- `/crypto` - Show basic analysis
- `/crypto alert` - Manual event monitor
- `/crypto auto` - Auto-monitor next 2h
- `/crypto report` - View statistics
- `/crypto active` - View running monitors
- `/crypto stop` - Stop all monitoring
