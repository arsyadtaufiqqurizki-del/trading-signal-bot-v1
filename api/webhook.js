const TelegramBot = require('node-telegram-bot-api');
const { runAnalysis } = require('../analyzer');
const { getNewsData } = require('../news');
const { runFastSignal } = require('../fast-analyzer');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    const msg = req.body.message;
    if (msg && msg.text) {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (text.startsWith('/start')) {
        await bot.sendMessage(chatId,
          `Halo! Saya adalah <b>AI Trading Assistant</b> Anda.\n\nGunakan perintah berikut:\n\n` +
          `⚡ /fast — <b>Sinyal instan sekarang</b> (cepat, 1 sinyal, rules fleksibel)\n` +
          `🔍 /high — Scanning high-probability setup (analisis mendalam, RR 1:2)\n` +
          `📰 /news — Berita market &amp; crypto terbaru\n` +
          `✅ /status — Cek status bot`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/fast')) {
        await runFastSignal(bot, chatId);
      } else if (text.startsWith('/high')) {
        await runAnalysis(bot, chatId, false);
      } else if (text.startsWith('/status')) {
        await bot.sendMessage(chatId,
          `✅ <b>Bot Active &amp; Running di Vercel Serverless</b>\nSistem siap menganalisis market kapan saja.\n\n` +
          `⚡ /fast — Sinyal instan (1 sinyal, rules longgar)\n` +
          `🔍 /high — High-probability setup (RR minimal 1:2)`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/news')) {
        await bot.sendMessage(chatId, '⏳ Sedang menarik berita terkini...');
        const newsMessage = await getNewsData();
        await bot.sendMessage(chatId, newsMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
    }
  }
  // Vercel Serverless harus memberikan response 200 ke Telegram API agar tidak terjadi timeout/retry.
  res.status(200).send('OK');
};
