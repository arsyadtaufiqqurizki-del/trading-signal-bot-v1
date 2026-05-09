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
        await bot.sendMessage(chatId, '⏳ Sedang menganalisis tren industri via RSS Feeds...');
        try {
          const socialScanner = require('../social_scanner');
          const trendAnalyzer = require('../trend_analyzer');

          const articles = await socialScanner.scanAllFeeds();
          const { trends, activityCount } = trendAnalyzer.analyze(articles);

          if (trends.length === 0) {
            let debugMsg = `📉 <b>SOCIAL TREND SCANNER</b>\n📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n`;
            debugMsg += `Tidak ditemukan lonjakan keyword signifikan hari ini.\n\n<b>Aktivitas Terdeteksi:</b>\n`;

            Object.entries(activityCount).forEach(([kw, count]) => {
              debugMsg += `• ${kw}: ${count} mentions\n`;
            });
            debugMsg += `\n<i>Saran: Coba cek kembali dalam 12 jam ke depan.</i>`;
            await bot.sendMessage(chatId, debugMsg, { parse_mode: 'HTML' });
          } else {
            let reportMsg = `🚨 <b>SOCIAL TREND REPORT</b>\n📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n`;

            trends.forEach(t => {
              reportMsg += `🔥 <b>TRENDING NOW: [${t.keyword}]</b>\n`;
              reportMsg += `Status: <b>${t.status}</b> (${t.count} sumber)\n\n`;
              reportMsg += `📰 <b>Headline Terbaru:</b>\n`;

              t.articles.forEach(art => {
                reportMsg += `• "${art.title}" — <b>${art.source}</b>\n🔗 <a href="${art.link}">Baca Artikel</a>\n\n`;
              });

              reportMsg += `💡 <b>Marketing Insight:</b>\n${trendAnalyzer.getInsight(t.keyword)}\n`;
              reportMsg += `--------------------------------------------\n\n`;
            });

            await bot.sendMessage(chatId, reportMsg, { parse_mode: 'HTML', disable_web_page_preview: false });
          }
        } catch (e) {
          console.error(`[Trend Error] ${e.message}`);
          await bot.sendMessage(chatId, `❌ <b>System Error:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
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
