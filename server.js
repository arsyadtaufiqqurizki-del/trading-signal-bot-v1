'use strict';

const express = require('express');
const app = express();
const webhookHandler = require('./api/webhook');
require('dotenv').config();

const PORT = process.env.PORT || 8080;

app.use(express.json());

app.post('/api/webhook', async (req, res) => {
  try {
    await webhookHandler(req, res);
  } catch (error) {
    console.error('[SERVER ERROR] Webhook failed:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint dipanggil oleh Google Cloud Scheduler setiap jam
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
    res.status(500).send('Cron failed');
  }
});

// Health check
app.get('/', (req, res) => {
  res.status(200).send('Bot Server is running and healthy!');
});

app.listen(PORT, () => {
  console.log(`[SERVER] Bot is listening on port ${PORT}`);
  console.log(`[SERVER] Webhook URL: https://your-cloud-run-url/api/webhook`);
});
