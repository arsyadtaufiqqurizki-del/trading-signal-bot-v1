const axios = require('axios');
require('dotenv').config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = process.argv[2];

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN tidak ditemukan di .env");
  process.exit(1);
}

if (!url) {
  console.error("Usage: node set-webhook.js <YOUR_VERCEL_URL>");
  console.error("Example: node set-webhook.js https://my-bot-app.vercel.app/api/webhook");
  process.exit(1);
}

async function setWebhook() {
  try {
    const res = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
      url: url
    });
    console.log("Success:", res.data);
  } catch (err) {
    console.error("Error setting webhook:", err.response ? err.response.data : err.message);
  }
}

setWebhook();
