const TelegramBot = require('node-telegram-bot-api');
const { runAnalysis } = require('../analyzer');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const msg = req.body.message;
    if (msg && msg.text) {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (text.startsWith('/start')) {
        await bot.sendMessage(chatId, `Halo! Saya adalah <b>AI Trading Assistant</b> Anda.\n\nSaya dirancang untuk mendeteksi *High-Probability Setups* dengan Risk/Reward minimal 1:2.\n\nGunakan perintah berikut:\n/scan - Untuk melakukan scanning koin sekarang\n/status - Untuk melihat status bot`, { parse_mode: "HTML" });
      } else if (text.startsWith('/scan')) {
        await runAnalysis(bot, chatId, false);
      } else if (text.startsWith('/status')) {
        await bot.sendMessage(chatId, `✅ <b>Bot Active & Running di Vercel Serverless</b>\nSistem siap menganalisis market kapan saja Anda mengetik /scan. Otomatis scan setiap 1 jam berjalan di latar belakang.`, { parse_mode: "HTML" });
      }
    }
  }
  // Vercel Serverless harus memberikan response 200 ke Telegram API agar tidak terjadi timeout/retry.
  res.status(200).send('OK');
};
