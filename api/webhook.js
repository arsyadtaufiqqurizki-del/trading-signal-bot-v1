const TelegramBot = require('node-telegram-bot-api');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('Bot is running');
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('[CRITICAL ERROR] TELEGRAM_BOT_TOKEN is missing in Environment Variables!');
    return res.status(500).send('Missing Bot Token');
  }

  const bot = new TelegramBot(token);
  const msg = req.body.message;

  if (msg && msg.text) {
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    console.log(`[Webhook Received] ChatID: ${chatId} | Text: ${text}`);

    try {
      if (text.startsWith('/start')) {
        await bot.sendMessage(chatId,
          `Halo! Saya adalah <b>AI Trading Assistant</b> Anda.\n\nGunakan perintah berikut:\n\n` +
          `⚡ /fast — <b>Sinyal instan sekarang</b>\n` +
          `🔍 /high — Scanning high-probability setup\n` +
          `📰 /news — Berita market &amp; crypto terbaru\n` +
          `📈 /trend — <b>Analisis Tren Sosmed</b>\n` +
          `✅ /status — Cek status bot`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/fast')) {
        const { runFastSignal } = require('../fast-analyzer');
        await runFastSignal(bot, chatId);
      } else if (text.startsWith('/high')) {
        const { runAnalysis } = require('../analyzer');
        await runAnalysis(bot, chatId, false);
      } else if (text.startsWith('/trend')) {
        await bot.sendMessage(chatId, '⏳ Sedang menganalisis tren...');
        const socialScanner = require('../social_scanner');
        const trendAnalyzer = require('../trend_analyzer');
        const watchlist = trendAnalyzer.watchlist;
        const articles = await socialScanner.scanKeywords(watchlist);
        const { trends, activityCount } = trendAnalyzer.analyze(articles);

        if (trends.length === 0) {
          await bot.sendMessage(chatId, `📉 Tidak ditemukan lonjakan keyword signifikan hari ini.`, { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chatId, `🇮🇩 <b>INDONESIA TREND REPORT</b>`, { parse_mode: 'HTML' });
          for (const t of trends) {
            await bot.sendMessage(chatId, `🔥 <b>TRENDING NOW: [${t.keyword}]</b>\nStatus: ${t.status}`, { parse_mode: 'HTML' });
          }
        }
      } else if (text.startsWith('/create')) {
        const args = text.split(' ').slice(1).join(' ');
        if (!args) {
          await bot.sendMessage(chatId, '❓ <b>Keyword tidak ditemukan!</b>', { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chatId, `⏳ Meracik script untuk <b>"${args}"</b>...`);
          const contentGenerator = require('../content_generator');
          const result = await contentGenerator.generateHooks(args);
          let formatted = result.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*/g, '•').replace(/#/g, '');
          await bot.sendMessage(chatId, `🎬 <b>CONTENT STRATEGY: ${args}</b>\n\n${formatted}`, { parse_mode: 'HTML' });
        }
      } else if (text.startsWith('/news')) {
        await bot.sendMessage(chatId, '⏳ Sedang menarik berita terkini...');
        const { getNewsData } = require('../news');
        const newsMessage = await getNewsData();
        await bot.sendMessage(chatId, newsMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
      } else if (text.startsWith('/status')) {
        await bot.sendMessage(chatId, `✅ <b>Bot Active &amp; Running</b>\nSistem siap!`, { parse_mode: 'HTML' });
      } else if (text.startsWith('/cek_versi')) {
        await bot.sendMessage(chatId, `🚀 <b>Sistem Terupdate!</b>\nServer Time: ${new Date().toLocaleString('id-ID')}`, { parse_mode: 'HTML' });
      }
    } catch (e) {
      console.error(`[Handler Error] ${e.message}`);
      await bot.sendMessage(chatId, `❌ <b>System Error:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' }).catch(() => {});
    }
  }
  res.status(200).send('OK');
};
