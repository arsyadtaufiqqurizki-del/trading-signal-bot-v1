'use strict';

const express = require('express');
const app = express();
const webhookHandler = require('./api/webhook');
require('dotenv').config();

const PORT = process.env.PORT || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

/**
 * Google Cloud Run expects the application to listen on the PORT 
 * provided by the environment variable.
 */
app.post('/api/webhook', async (req, res) => {
  try {
    await webhookHandler(req, res);
  } catch (error) {
    console.error('[SERVER ERROR] Webhook failed:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Health check endpoint for Google Cloud Run
app.get('/', (req, res) => {
  res.status(200).send('Bot Server is running and healthy! 🚀');
});

app.listen(PORT, () => {
  console.log(`[SERVER] Bot is listening on port ${PORT}`);
  console.log(`[SERVER] Webhook URL: https://your-cloud-run-url/api/webhook`);
});
