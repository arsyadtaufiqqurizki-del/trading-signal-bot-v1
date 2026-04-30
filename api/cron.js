const TelegramBot = require('node-telegram-bot-api');
const { runAnalysis } = require('../analyzer');

const token = process.env.TELEGRAM_BOT_TOKEN;
const defaultChatId = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
  // Hanya jalankan jika ada Chat ID default
  if (defaultChatId) {
    // True menandakan Silent Mode (tidak kirim pesan 'Memulai...' atau 'No Trade Today')
    await runAnalysis(bot, defaultChatId, true);
  }
  
  res.status(200).send('Cron job success');
};
