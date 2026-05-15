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
          `🔐 /crypto — <b>Dampak berita ekonomi ke market</b>\n` +
          `📰 /news — Berita market &amp; crypto terbaru\n` +
          `📈 /trend — <b>Analisis Tren Sosmed</b>\n\n` +
          `<b>🚨 Real-time Alerts:</b>\n` +
          `🚨 /crypto alert NFP BTC — Monitor event dampak\n` +
          `⚙️ /crypto auto — Auto-monitor upcoming events (next 2h)\n` +
          `📊 /crypto report — Lihat statistik alerts\n` +
          `🔴 /crypto active — Lihat monitoring aktif\n` +
          `⛔ /crypto stop — Hentikan semua monitoring\n\n` +
          `<b>📊 Performance Tracking:</b>\n` +
          `📝 /result — Catat hasil trade\n` +
          `📊 /stats — Lihat statistik &amp; win rate\n` +
          `⏳ /pending — Lihat sinyal yang belum dicatat`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/fast')) {
        const { runFastSignal } = require('../fast-analyzer');
        await runFastSignal(bot, chatId);
      } else if (text.startsWith('/high')) {
        const args = text.trim().split(/\s+/);
        const keyword = args[1];
        if (keyword) {
          const { runAnalysisPair } = require('../analyzer');
          await runAnalysisPair(bot, chatId, keyword);
        } else {
          const { runAnalysis } = require('../analyzer');
          await runAnalysis(bot, chatId, false);
        }
      } else if (text.startsWith('/trend')) {
        await bot.sendMessage(chatId, '⏳ Sedang menganalisis tren...');
        const socialScanner = require('../social_scanner');
        const trendAnalyzer = require('../trend_analyzer');
        const watchlist = trendAnalyzer.watchlist;
        const articles = await socialScanner.scanKeywords(watchlist);
        const { trends } = trendAnalyzer.analyze(articles);

        if (trends.length === 0) {
          await bot.sendMessage(chatId, `📉 Tidak ditemukan lonjakan keyword signifikan hari ini.`, { parse_mode: 'HTML' });
        } else {
          const now = new Date().toLocaleString('id-ID', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', second: '2-digit' 
          });
          
          let report = `🇮🇩 <b>INDONESIA TREND REPORT</b>\n`;
          report += `📅 <i>${now}</i>\n`;
          report += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
          
          const topTrends = trends.slice(0, 5);
          
          topTrends.forEach((t, index) => {
            const insight = trendAnalyzer.getInsight(t.keyword);
            
            // Status Badge
            let badge = '🟢'; // Mulai Naik
            if (t.status === 'Sangat Viral') badge = '🔴';
            else if (t.status === 'Sedang Tren') badge = '🟡';

            report += `${index + 1}. 🔥 <b>${t.keyword.toUpperCase()}</b>\n`;
            report += `└ ${badge} <code>${t.status}</code>\n`;
            report += `└ <i>Insight: ${insight}</i>\n`;
            
            if (t.articles && t.articles.length > 0) {
              report += `└ 📰 <b>Headline Terbaru:</b>\n`;
              t.articles.slice(0, 2).forEach(art => {
                const pubDate = art.pubDate 
                  ? new Date(art.pubDate).toLocaleString('id-ID', { 
                      weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                    }) 
                  : 'Tgl tidak tersedia';
                
                report += `  • [${pubDate}] "${art.title}"\n`;
                report += `    🔗 <a href="${art.link}">Baca Selengkapnya</a>\n`;
              });
            }
            
            // Add divider if not the last item
            if (index < topTrends.length - 1) {
              report += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            }
          });

          report += `\n\n💡 <i>Gunakan /create [keyword] untuk buat script konten viral!</i>`;
          
          await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
        }
      } else if (text.startsWith('/crypto')) {
        const args = text.trim().split(/\s+/);

        if (args[1] === 'auto') {
          // Auto-monitor upcoming high-impact events
          const { autoMonitorUpcomingEvents } = require('../crypto-alerts');
          await autoMonitorUpcomingEvents(bot, chatId, 2);
        } else if (args[1] === 'alert') {
          // Manual alert for specific event
          if (!args[2]) {
            await bot.sendMessage(chatId, `❓ <b>Usage:</b>\n<code>/crypto alert NFP BTC</code>\n\nEvents: NFP, CPI, PPI, Fed Rate, ECB, etc`, { parse_mode: 'HTML' });
          } else {
            const eventName = args[2];
            const symbol = args[3] || 'BTC';
            const { monitorEventImpact } = require('../crypto-alerts');
            await monitorEventImpact(bot, chatId, eventName, symbol);
          }
        } else if (args[1] === 'report') {
          // View alert statistics
          const { getAlertReport } = require('../crypto-alerts');
          const days = args[2] ? parseInt(args[2]) : 7;
          const report = await getAlertReport(days);
          await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
        } else if (args[1] === 'active') {
          // View active alerts
          const { getActiveAlerts } = require('../crypto-alerts');
          const active = getActiveAlerts();

          if (active.length === 0) {
            await bot.sendMessage(chatId, `✅ No active alerts running`);
          } else {
            let msg = `🚨 <b>ACTIVE MONITORING</b>\n\n`;
            active.forEach((a, i) => {
              msg += `${i+1}. ${a.eventName} / ${a.symbol}\n`;
              msg += `   Running for: ${((Date.now() - a.startTime)/1000).toFixed(0)}s\n`;
            });
            await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
          }
        } else if (args[1] === 'stop') {
          // Stop monitoring
          const { getActiveAlerts } = require('../crypto-alerts');
          const priceMonitor = require('../price-monitor');
          priceMonitor.stopAllMonitoring();
          await bot.sendMessage(chatId, `⛔ All monitoring stopped`);
        } else {
          // Default: show crypto analysis
          await bot.sendMessage(chatId, '⏳ Menganalisis dampak ekonomi terhadap market...');
          const { runCryptoImpactAnalysis } = require('../crypto-analyzer');
          const report = await runCryptoImpactAnalysis();
          await bot.sendMessage(chatId, report, { parse_mode: 'HTML', disable_web_page_preview: true });
        }
      } else if (text.startsWith('/create')) {
        const args = text.split(' ').slice(1).join(' ');
        if (!args) {
          await bot.sendMessage(chatId, '❓ <b>Keyword tidak ditemukan!</b>', { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chatId, `⏳ Meracik script untuk <b>"${args}"</b>...`);
          const contentGenerator = require('../content_generator');
          const result = await contentGenerator.generateHooks(args);
          
          if (!result || !result.text) {
            await bot.sendMessage(chatId, `❌ <b>Gagal meracik konten.</b>\nAI tidak memberikan respons untuk keyword tersebut. Coba gunakan keyword marketing yang lebih spesifik!`, { parse_mode: 'HTML' });
            return;
          }

          let formatted = result.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*/g, '•').replace(/#/g, '');
          
          const finalMessage = `🎬 <b>CONTENT STRATEGY: ${args}</b>\n\n${formatted}\n\n--------------------------------------------\nGenerated by: ${result.model}`;
          
          await bot.sendMessage(chatId, finalMessage, { parse_mode: 'HTML' });
        }
      } else if (text.startsWith('/news')) {
        await bot.sendMessage(chatId, '⏳ Sedang menarik berita terkini...');
        const { getNewsData } = require('../news');
        const newsMessage = await getNewsData();
        await bot.sendMessage(chatId, newsMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
      } else if (text.startsWith('/result')) {
        const parts = text.trim().split(/\s+/);
        if (parts.length < 4) {
          await bot.sendMessage(chatId,
            `❓ <b>Format salah!</b>\n\n` +
            `Gunakan:\n<code>/result PAIR DIRECTION OUTCOME</code>\n\n` +
            `Contoh:\n` +
            `• <code>/result BTC LONG TP1</code>\n` +
            `• <code>/result ETH SHORT TP2</code>\n` +
            `• <code>/result SOL LONG SL</code>\n` +
            `• <code>/result BNB SHORT BE</code>\n\n` +
            `Outcome: <b>TP1</b>, <b>TP2</b>, <b>SL</b>, <b>BE</b> (breakeven)`,
            { parse_mode: 'HTML' }
          );
        } else {
          const [, pair, direction, result] = parts;
          const validDir    = ['LONG', 'SHORT'];
          const validResult = ['TP1', 'TP2', 'SL', 'BE'];

          if (!validDir.includes(direction.toUpperCase())) {
            await bot.sendMessage(chatId, `❌ Direction harus <b>LONG</b> atau <b>SHORT</b>.`, { parse_mode: 'HTML' });
          } else if (!validResult.includes(result.toUpperCase())) {
            await bot.sendMessage(chatId, `❌ Outcome harus: <b>TP1</b>, <b>TP2</b>, <b>SL</b>, atau <b>BE</b>.`, { parse_mode: 'HTML' });
          } else {
            const { updateResult } = require('../performance');
            const updated = await updateResult(pair, direction, result);

            if (!updated) {
              await bot.sendMessage(chatId,
                `❌ Tidak ada sinyal OPEN untuk <b>${pair.toUpperCase()} ${direction.toUpperCase()}</b>.\n\n` +
                `Gunakan /pending untuk lihat sinyal yang menunggu hasil.`,
                { parse_mode: 'HTML' }
              );
            } else {
              const emoji   = { TP1: '✅', TP2: '🏆', SL: '❌', BE: '➖' }[updated.result];
              const pnlStr  = updated.pnl > 0 ? `+${updated.pnl}R` : updated.pnl === 0 ? '0R' : `${updated.pnl}R`;
              await bot.sendMessage(chatId,
                `${emoji} <b>Hasil Berhasil Dicatat!</b>\n\n` +
                `Pair      : <b>${updated.pair} ${updated.direction}</b>\n` +
                `Outcome   : <b>${updated.result}</b>\n` +
                `PnL       : <b>${pnlStr}</b>\n` +
                `Setup     : ${updated.setupType}\n\n` +
                `Ketik /stats untuk melihat statistik lengkap.`,
                { parse_mode: 'HTML' }
              );
            }
          }
        }

      } else if (text.startsWith('/stats')) {
        const parts = text.trim().split(/\s+/);
        let days = 30;
        if (parts[1] === 'all')              days = 0;
        else if (parts[1] && !isNaN(parts[1])) days = parseInt(parts[1]);

        const { getStats } = require('../performance');
        const stats = await getStats(days);

        if (stats.empty) {
          const pendingInfo = stats.open.length > 0
            ? `\n\n${stats.open.length} sinyal masih OPEN — gunakan /result untuk mencatat hasilnya.`
            : '';
          await bot.sendMessage(chatId,
            `📊 <b>PERFORMANCE STATS</b>\n\n` +
            `Belum ada data trade selesai dalam ${days === 0 ? 'semua waktu' : `${days} hari terakhir`}.${pendingInfo}\n\n` +
            `Setiap sinyal /high otomatis tersimpan. Catat hasilnya dengan:\n<code>/result PAIR DIR OUTCOME</code>`,
            { parse_mode: 'HTML' }
          );
        } else {
          const { wins, losses, breaks, winRate, totalPnl, pairMap, setupMap, sessionMap, closed, open } = stats;
          const pnlPrefix = totalPnl > 0 ? '+' : '';

          let msg = `📊 <b>PERFORMANCE REPORT — ${days === 0 ? 'All Time' : `${days} Hari Terakhir`}</b>\n`;
          msg += `────────────────────\n`;
          msg += `Total Trade  : ${closed.length} selesai | ${open.length} pending\n`;
          msg += `Win (TP)     : ${wins.length}\n`;
          msg += `Loss (SL)    : ${losses.length}\n`;
          msg += `Breakeven    : ${breaks.length}\n`;
          msg += `Win Rate     : <b>${winRate}%</b>\n`;
          msg += `Total PnL    : <b>${pnlPrefix}${totalPnl}R</b>\n\n`;

          msg += `<b>📈 Per Pair:</b>\n`;
          Object.entries(pairMap)
            .sort((a, b) => b[1].total - a[1].total)
            .forEach(([pair, d]) => {
              const wr    = ((d.wins / d.total) * 100).toFixed(0);
              const emoji = wr >= 60 ? '✅' : wr >= 40 ? '⚠️' : '❌';
              const pnl   = d.pnl >= 0 ? `+${d.pnl}R` : `${d.pnl}R`;
              msg += `${emoji} ${pair}: ${d.wins}/${d.total} (${wr}%) ${pnl}\n`;
            });

          msg += `\n<b>🎯 Per Setup:</b>\n`;
          Object.entries(setupMap).forEach(([setup, d]) => {
            const wr    = ((d.wins / d.total) * 100).toFixed(0);
            const emoji = wr >= 60 ? '✅' : wr >= 40 ? '⚠️' : '❌';
            msg += `${emoji} ${setup}: ${wr}% (${d.total} sinyal)\n`;
          });

          msg += `\n<b>🕐 Per Session:</b>\n`;
          Object.entries(sessionMap).forEach(([sess, d]) => {
            const wr    = ((d.wins / d.total) * 100).toFixed(0);
            const emoji = wr >= 60 ? '✅' : wr >= 40 ? '⚠️' : '❌';
            msg += `${emoji} ${sess}: ${wr}% (${d.total} sinyal)\n`;
          });

          msg += `\n💡 <i>Gunakan /stats 7, /stats 30, atau /stats all</i>`;
          await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        }

      } else if (text.startsWith('/pending')) {
        const { getPending } = require('../performance');
        const pending = await getPending();

        if (pending.length === 0) {
          await bot.sendMessage(chatId,
            `✅ <b>Tidak ada sinyal pending.</b>\n\nSemua sinyal sudah dicatat hasilnya.`,
            { parse_mode: 'HTML' }
          );
        } else {
          let msg = `⏳ <b>SINYAL PENDING (${pending.length})</b>\n────────────────────\n`;
          pending.forEach((s, i) => {
            const sentDate = new Date(s.sentAt).toLocaleString('id-ID', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
            });
            msg += `${i + 1}. <b>${s.pair} ${s.direction}</b>\n`;
            msg += `   Entry: ${s.entry} | TP1: ${s.tp1} | SL: ${s.sl}\n`;
            msg += `   Score: ${s.confluenceScore} | ${s.setupType}\n`;
            msg += `   Dikirim: ${sentDate}\n\n`;
          });
          msg += `Catat hasil: <code>/result PAIR DIR OUTCOME</code>`;
          await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
        }

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
