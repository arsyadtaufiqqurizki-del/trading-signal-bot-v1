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
          `📈 /trend — <b>Analisis Tren Sosmed</b> (Deteksi viralitas untuk marketing)\n` +
          `✅ /status — Cek status bot`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/fast')) {
        await runFastSignal(bot, chatId);
      } else if (text.startsWith('/high')) {
        await runAnalysis(bot, chatId, false);
      } else if (text.startsWith('/trend')) {
        await bot.sendMessage(chatId, '⏳ Sedang memindai tren di X &amp; TikTok...');
        try {
          const { scanAllPlatforms } = require('../social_scanner');
          const { analyze } = require('../trend_analyzer');
          
          const watchlist = ['AI Agent', 'Digital Marketing', 'Web3', 'Content Creator', 'TikTok Ads'];
          const rawData = await scanAllPlatforms(watchlist);
          const trends = analyze(rawData);

          if (trends.length === 0) {
            // DEBUG MODE: Show actual counts if no trend is found
            let debugMsg = '📉 Tidak ada lonjakan tren signifikan saat ini.\n\n<b>Data Terdeteksi:</b>\n';
            rawData.forEach(item => {
              debugMsg += `• ${item.keyword}: ${item.count} mentions (${item.platform})\n`;
            });
            await bot.sendMessage(chatId, debugMsg, { parse_mode: 'HTML' });
          } else {
            let trendMsg = `🚨 <b>SOCIAL TREND ALERT</b>\n\n`;
            trends.forEach(t => {
              trendMsg += `${t.status} <b>${t.keyword}</b>\n` +
                          `📈 Growth: ${t.growth}%\n` +
                          `🌐 Platform: ${t.platform}\n` +
                          `🎯 Confidence: ${t.confidence}\n` +
                          `----------------------------\n`;
            });
            await bot.sendMessage(chatId, trendMsg, { parse_mode: 'HTML' });
          }
        } catch (e) {
          console.error(`[Trend Error] ${e.message}`);
          await bot.sendMessage(chatId, `❌ <b>System Error:</b>\n<code>${e.message}</code>\n\nSilakan kirimkan pesan error ini kepada developer untuk diperbaiki.`, { parse_mode: 'HTML' });
        }
      } else if (text.startsWith('/news')) {
        await bot.sendMessage(chatId, '⏳ Sedang menarik berita terkini...');
        const newsMessage = await getNewsData();
        await bot.sendMessage(chatId, newsMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
      } else if (text.startsWith('/status')) {
        await bot.sendMessage(chatId,
          `✅ <b>Bot Active &amp; Running di Vercel Serverless</b>\nSistem siap menganalisis market kapan saja.\n\n` +
          `⚡ /fast — Sinyal instan (1 sinyal, rules longgar)\n` +
          `🔍 /high — High-probability setup (RR minimal 1:2)\n` +
          `📈 /trend — Analisis Tren Sosmed`,
          { parse_mode: 'HTML' }
        );
      }
    }
  }
  // Vercel Serverless harus memberikan response 200 ke Telegram API agar tidak terjadi timeout/retry.
  res.status(200).send('OK');
};
