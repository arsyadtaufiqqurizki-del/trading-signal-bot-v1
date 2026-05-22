'use strict';

const express = require('express');
const cors = require('cors');
const webhookHandler = require('./api/webhook');
const { scanAllPairs, analyzeAsset, fetchBtcTrends, PAIRS } = require('./scanner');
const { getStats, getPending, updateResult } = require('./performance');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB } = require('./utils');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ─── API ENDPOINTS FOR WEB DASHBOARD ───

// 1. Top Signals
app.get('/api/signals/top', async (req, res) => {
  try {
    const signals = await scanAllPairs();
    res.json({ success: true, data: signals });
  } catch (error) {
    console.error('[API ERROR] /api/signals/top:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Deep Analysis for a specific symbol
app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Find existing config in PAIRS list, or create a dynamic one
    let pairConfig = PAIRS.find(p => p.symbol === symbol + 'USDT' || p.name.toUpperCase() === symbol + '/USDT');

    if (!pairConfig) {
      pairConfig = { symbol: symbol + 'USDT', name: symbol + '/USDT', htf: '4h', ltf: '1h', exec: '15m', tier: 4 };
    }

    const { btcTrend1h, btcTrend4h } = await fetchBtcTrends();
    const { signal, debug } = await analyzeAsset(pairConfig, btcTrend1h, btcTrend4h);

    if (!signal) {
      return res.json({ 
        success: true, 
        signal: null, 
        debug: debug,
        message: 'No high-probability setup found for this pair.' 
      });
    }

    res.json({ success: true, signal, debug });
  } catch (error) {
    console.error('[API ERROR] /api/analyze/:symbol:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Performance Statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[API ERROR] /api/stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Pending Signals
app.get('/api/signals/pending', async (req, res) => {
  try {
    const pending = await getPending();
    res.json({ success: true, data: pending });
  } catch (error) {
    console.error('[API ERROR] /api/signals/pending:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Update Signal Result (TP1, TP2, SL)
app.post('/api/signals/update', async (req, res) => {
  try {
    const { pair, direction, result } = req.body;
    if (!pair || !direction || !result) {
      return res.status(400).json({ success: false, error: 'Missing pair, direction, or result' });
    }
    const updated = await updateResult(pair, direction, result);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Signal not found' });
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[API ERROR] /api/signals/update:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Market Sentiment & Trending
app.get('/api/market/sentiment', async (req, res) => {
  try {
    const sentiment = await getGlobalSentiment();
    const trending = await getTrendingCoins();
    res.json({ 
      success: true, 
      data: { 
        sentiment, 
        trending,
        timestamp: nowWIB()
      } 
    });
  } catch (error) {
    console.error('[API ERROR] /api/market/sentiment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── EXISTING ENDPOINTS ───

app.post('/api/webhook', async (req, res) => {
  try {
    await webhookHandler(req, res);
  } catch (error) {
    console.error('[SERVER ERROR] Webhook failed:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/api/cron', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).send('Unauthorized');
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('[CRON] TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID tidak ada.');
    return res.status(500).send('Missing env vars');
  }

  try {
    const TelegramBot = require('node-telegram-bot-api');
    const { runAnalysis } = require('./analyzer');
    const bot = new TelegramBot(token);

    console.log(`[CRON] Menjalankan auto-scan /high pada ${new Date().toISOString()}`);
    await runAnalysis(bot, chatId, true);
    console.log('[CRON] Auto-scan selesai.');
    res.status(200).send('OK');
  } catch (error) {
    console.error('[CRON ERROR]', error.message);
    res.status(500).send('Sinyal analisis gagal dijalankan via cron.');
  }
});

app.get('/', (req, res) => {
  res.status(200).send('Bot Server is running and healthy!');
});

app.listen(PORT, () => {
  console.log(`[SERVER] Bot is listening on port ${PORT}`);
  console.log(`[SERVER] Webhook URL: https://your-cloud-run-url/api/webhook`);
});

