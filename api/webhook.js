const TelegramBot = require('node-telegram-bot-api');

function parseContentAngles(text) {
  // Split on each new 🎯 block or the ---- separator
  const rawBlocks = text.split(/(?=🎯)|[-─]{4,}/g);
  const angleBlocks = rawBlocks.filter(b => b.trim() && b.includes('🎯'));

  return angleBlocks.map(block => {
    // Capture text right after 🎯, stopping before the next section emoji
    const rawAngle  = (block.match(/🎯([^🪝💎📣\n]+)/i) || [])[1]?.trim() || 'Angle';
    // Strip "Angle N ·" or "Angle:" prefix so we're left with just the angle type/title
    const angleName = rawAngle.replace(/^Angle\s*\d*\s*[·:\-]?\s*/i, '').trim() || rawAngle;
    const hook      = (block.match(/🪝\s*Hook\s*:\s*"?([^"\n]+)"?/i) || [])[1]?.trim() || '';
    const value     = (block.match(/💎\s*Value\s*:\s*([\s\S]+?)(?=📣|$)/i) || [])[1]?.trim() || '';
    const cta       = (block.match(/📣\s*CTA\s*:\s*"?([^"\n]+)"?/i) || [])[1]?.trim() || '';
    return { angleName, hook, value, cta };
  });
}

function formatAngleCard(num, angle) {
  const div = '━━━━━━━━━━━━━━━━━━━━';
  const lines = [
    div,
    `🎯 <b>Angle ${num} · ${angle.angleName}</b>`,
    div,
    '',
    `🪝 <b>Hook</b>`,
    `<i>"${angle.hook}"</i>`,
    '',
    `💎 <b>Value</b>`,
    angle.value,
    '',
    `📣 <b>CTA</b>`,
    `<i>"${angle.cta}"</i>`,
  ];
  return lines.join('\n');
}

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
          `🔭 /outlook — <b>Market outlook 7-day: bias score, skenario &amp; kalender event</b>\n` +
          `🏦 /stock — <b>Outlook saham Indonesia: IHSG &amp; LQ45</b>\n` +
          `⚡ /fast — <b>Sinyal instan sekarang</b>\n` +
          `🔍 /high — Scanning high-probability setup\n` +
          `📐 /quant — <b>Quant analysis: momentum screener &amp; stat report</b>\n` +
          `🔄 /quant reversion — <b>Mean reversion scan: cari coin overextended</b>\n` +
          `⛓️ /onchain — <b>Analisis on-chain: MVRV, TVL, Fear &amp; Greed</b>\n` +
          `💥 /liq — <b>Likuidasi &amp; Long/Short Ratio futures market</b>\n` +
          `🎯 /poly — <b>Polymarket: sinyal dari prediction market global</b>\n` +
          `🔐 /crypto — <b>Dampak berita ekonomi ke market</b>\n` +
          `📰 /news — Berita market &amp; crypto terbaru\n` +
          `📡 /blom — <b>Bloomberg Intelligence: berita keuangan global terkini</b>\n` +
          `📈 /trend — <b>Analisis Tren Sosmed</b>\n\n` +
          `<b>🏦 Stock Sub-commands:</b>\n` +
          `📊 /stock BBCA — Analisis teknikal saham spesifik\n` +
          `<i>Semua kode saham IDX didukung: BBRI, TLKM, GOTO, dll</i>\n\n` +
          `<b>🔭 Outlook Sub-commands:</b>\n` +
          `🪙 /outlook BTC — Outlook spesifik per pair (BTC, ETH, SOL, dll)\n` +
          `🏭 /outlook sector — Sector rotation heatmap (L1, DeFi, AI, Meme, dll)\n` +
          `🌐 /outlook macro — Kalender ekonomi &amp; risk minggu ini\n` +
          `📐 /outlook scenario — 3 skenario Bull/Base/Bear detail\n\n` +
          `<b>🚨 Real-time Alerts:</b>\n` +
          `🚨 /crypto alert NFP BTC — Monitor event dampak\n` +
          `⚙️ /crypto auto — Auto-monitor upcoming events (next 2h)\n` +
          `📊 /crypto report — Lihat statistik alerts\n` +
          `🔴 /crypto active — Lihat monitoring aktif\n` +
          `⛔ /crypto stop — Hentikan semua monitoring\n\n` +
          `<b>📊 Performance Tracking:</b>\n` +
          `📝 /result — Catat hasil trade\n` +
          `📊 /stats — Lihat statistik &amp; win rate\n` +
          `⏳ /pending — Lihat sinyal yang belum dicatat\n\n` +
          `<b>ℹ️ Info:</b>\n` +
          `📋 /list coin — Lihat daftar coin di /high &amp; /fast`,
          { parse_mode: 'HTML' }
        );
      } else if (text.startsWith('/outlook')) {
        const args     = text.trim().split(/\s+/);
        const sub      = args[1]?.toLowerCase();
        const keywords = ['macro', 'scenario', 'sector'];

        if (sub === 'macro') {
          const { runOutlookMacro } = require('../outlook');
          await runOutlookMacro(bot, chatId);
        } else if (sub === 'scenario') {
          const { runOutlookScenario } = require('../outlook');
          await runOutlookScenario(bot, chatId);
        } else if (sub === 'sector') {
          const { runOutlookSector } = require('../outlook');
          await runOutlookSector(bot, chatId);
        } else if (sub && !keywords.includes(sub)) {
          // Treat as pair keyword — e.g. /outlook BTC
          const { runOutlookPair } = require('../outlook');
          await runOutlookPair(bot, chatId, sub);
        } else {
          const { runOutlook } = require('../outlook');
          await runOutlook(bot, chatId);
        }
      } else if (text.startsWith('/stock')) {
        const args    = text.trim().split(/\s+/);
        const ticker  = args[1];

        if (ticker) {
          const { runStockDetail } = require('../stock');
          await runStockDetail(bot, chatId, ticker);
        } else {
          const { runStockOverview } = require('../stock');
          await runStockOverview(bot, chatId);
        }
      } else if (text.startsWith('/liq')) {
        const args    = text.trim().split(/\s+/);
        const sub     = args[1]?.toLowerCase();

        if (!sub) {
          const { runLiqOverview } = require('../liq');
          await runLiqOverview(bot, chatId);
        } else if (sub === 'whale') {
          const { runLiqWhale } = require('../liq');
          await runLiqWhale(bot, chatId);
        } else {
          const { runLiqPair } = require('../liq');
          await runLiqPair(bot, chatId, sub);
        }
      } else if (text.startsWith('/poly')) {
        const args = text.trim().split(/\s+/);
        const sub  = args[1]?.toLowerCase();
        const validSubs = ['btc', 'eth', 'macro', 'hot'];

        if (sub && !validSubs.includes(sub)) {
          await bot.sendMessage(chatId,
            `❓ <b>Sub-command tidak valid.</b>\n\nGunakan:\n` +
            `• <code>/poly</code> — Overview semua markets + sinyal komposit\n` +
            `• <code>/poly btc</code> — Market spesifik Bitcoin\n` +
            `• <code>/poly eth</code> — Market spesifik Ethereum\n` +
            `• <code>/poly macro</code> — Fed, inflasi, resesi\n` +
            `• <code>/poly hot</code> — Markets dengan aktivitas 24h tertinggi`,
            { parse_mode: 'HTML' }
          );
        } else if (!sub) {
          const { runPolyOverview } = require('../polymarket');
          await runPolyOverview(bot, chatId);
        } else {
          const { runPolyCategory } = require('../polymarket');
          await runPolyCategory(bot, chatId, sub);
        }
      } else if (text.startsWith('/quant')) {
        const args = text.trim().split(/\s+/);
        if (args[1] === 'reversion') {
          const { runQuantReversion } = require('../quant');
          await runQuantReversion(bot, chatId);
        } else {
          const { runQuantAnalysis } = require('../quant');
          await runQuantAnalysis(bot, chatId);
        }
      } else if (text.startsWith('/onchain')) {
        const args   = text.trim().split(/\s+/);
        const target = args[1]?.toLowerCase();
        const valid  = ['btc', 'eth', 'defi'];

        if (target && !valid.includes(target)) {
          await bot.sendMessage(chatId,
            `❓ <b>Target tidak valid.</b>\n\nGunakan:\n` +
            `• <code>/onchain</code> — Overview semua metrics\n` +
            `• <code>/onchain btc</code> — BTC: MVRV, NVT, Hash Rate\n` +
            `• <code>/onchain eth</code> — ETH: Staking + DeFi TVL\n` +
            `• <code>/onchain defi</code> — DeFi TVL &amp; Top Chains`,
            { parse_mode: 'HTML' }
          );
        } else {
          const { runOnchainAnalysis } = require('../onchain');
          await runOnchainAnalysis(bot, chatId, target || 'all');
        }
      } else if (text.startsWith('/fast')) {
        const args = text.trim().split(/\s+/);
        const keyword = args[1];
        if (keyword) {
          const { runFastSignalPair } = require('../fast-analyzer');
          await runFastSignalPair(bot, chatId, keyword);
        } else {
          const { runFastSignal } = require('../fast-analyzer');
          await runFastSignal(bot, chatId);
        }
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
      } else if (text.startsWith('/list')) {
        const args = text.trim().split(/\s+/);
        const sub  = args[1]?.toLowerCase();

        if (sub !== 'coin') {
          await bot.sendMessage(chatId,
            `❓ <b>Sub-command tidak valid.</b>\n\nGunakan:\n` +
            `• <code>/list coin</code> — Lihat daftar coin di /high &amp; /fast`,
            { parse_mode: 'HTML' }
          );
        } else {
          const { PAIRS }                      = require('../scanner');
          const { PRO_PAIRS }                  = require('../fast-scanner');

          const TIER_LABEL = {
            1: '🏆 Tier 1 — Mega Cap',
            2: '🔵 Tier 2 — Large Cap',
            3: '🟡 Tier 3 — Established Altcoin',
            4: '🔴 Tier 4 — High Momentum',
          };

          function buildCoinList(pairs, hasTier) {
            if (hasTier) {
              const grouped = {};
              for (const p of pairs) {
                if (!grouped[p.tier]) grouped[p.tier] = [];
                grouped[p.tier].push(p.name);
              }
              return Object.keys(grouped).sort().map(t =>
                `${TIER_LABEL[t]}:\n` + grouped[t].map(n => `  • ${n}`).join('\n')
              ).join('\n\n');
            }
            return pairs.map(p => `  • ${p.name}`).join('\n');
          }

          const highList = buildCoinList(PAIRS, true);
          const fastList = buildCoinList(PRO_PAIRS, false);

          await bot.sendMessage(chatId,
            `📋 <b>Daftar Coin Terdaftar</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `🔍 <b>/high</b> — ${PAIRS.length} Coin\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `${highList}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `⚡ <b>/fast</b> — ${PRO_PAIRS.length} Coin\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `${fastList}`,
            { parse_mode: 'HTML' }
          );
        }
      } else if (text.startsWith('/trend')) {
        const args = text.trim().split(/\s+/);
        const category = args[1] && !args[1].startsWith('/') ? args[1].toLowerCase() : null;

        const validCategories = ['marketing', 'ai', 'ecommerce', 'social', 'tools'];
        if (category && !validCategories.includes(category)) {
          await bot.sendMessage(chatId,
            `❓ <b>Kategori tidak valid.</b>\n\nKategori tersedia:\n` +
            `• <code>/trend</code> — Semua tren\n` +
            `• <code>/trend marketing</code> — Digital Marketing, SEO, KOL, dll\n` +
            `• <code>/trend ai</code> — AI, ChatGPT, Gemini\n` +
            `• <code>/trend ecommerce</code> — Shopee, Tokopedia, Lazada\n` +
            `• <code>/trend social</code> — TikTok, Instagram, Threads\n` +
            `• <code>/trend tools</code> — Canva, Notion, Web3`,
            { parse_mode: 'HTML' }
          );
        } else {
          const categoryLabel = category ? ` [${category.toUpperCase()}]` : '';
          await bot.sendMessage(chatId, `⏳ Sedang menganalisis tren${categoryLabel}...`);

          const socialScanner = require('../social_scanner');
          const trendAnalyzer = require('../trend_analyzer');
          const keywords = trendAnalyzer.getKeywordsByCategory(category);
          const articles = await socialScanner.scanKeywords(keywords);
          const { trends } = trendAnalyzer.analyze(articles, category);

          if (trends.length === 0) {
            await bot.sendMessage(chatId, `Tidak ditemukan lonjakan topik signifikan pada periode ini.`, { parse_mode: 'HTML' });
          } else {
            const now = new Date();
            const dateStr = now.toLocaleString('id-ID', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
            const timeStr = now.toLocaleString('id-ID', {
              hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
            });

            const topTrends = trends.slice(0, 7);
            const totalArticles = trends.reduce((s, t) => s + t.count, 0);
            const topKw = topTrends[0];

            const categoryScope = category
              ? category.charAt(0).toUpperCase() + category.slice(1)
              : 'Semua Kategori';

            // --- Velocity helper ---
            const velLabel = (v) => {
              if (v === null || v === undefined) return '';
              if (v > 0) return `  ↑ +${v} vs sesi lalu`;
              if (v < 0) return `  ↓ ${v} vs sesi lalu`;
              return '  → Stabil';
            };

            // --- Status label ---
            const statusLabel = (s) => {
              if (s === 'Sangat Viral') return 'VIRAL';
              if (s === 'Sedang Tren') return 'TRENDING';
              return 'NAIK';
            };

            // ── MASTHEAD ──
            let report = `<b>TREND INTELLIGENCE</b>\n`;
            report += `<i>Indonesia Digital Monitor · ${categoryScope}</i>\n`;
            report += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            report += `${dateStr}  ·  ${timeStr} WIB\n`;
            report += `Artikel dianalisis: <b>${totalArticles}</b> sumber\n\n`;

            // ── EXECUTIVE SUMMARY ──
            report += `<b>RINGKASAN</b>\n`;
            report += `<i>${topTrends.length} topik terdeteksi aktif. `;
            if (topKw.velocity !== null && topKw.velocity > 0) {
              report += `Momentum tertinggi: <b>${topKw.keyword}</b> dengan akselerasi +${topKw.velocity} artikel dari sesi sebelumnya.</i>\n`;
            } else {
              report += `Topik paling dominan: <b>${topKw.keyword}</b> dengan ${topKw.count} artikel.</i>\n`;
            }
            report += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            // ── SECTION HELPER ──
            const renderItem = (t, rank, compact = false) => {
              const insight = trendAnalyzer.getInsight(t.keyword);
              const vel = velLabel(t.velocity);
              const status = statusLabel(t.status);
              let block = '';

              if (compact) {
                block += `<b>No.${rank}  ${t.keyword.toUpperCase()}</b>\n`;
                block += `<code>${status}</code>  ·  ${t.count} artikel${vel}\n`;
                if (t.articles && t.articles.length > 0) {
                  const art = t.articles[0];
                  const pd = art.pubDate
                    ? new Date(art.pubDate).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  block += `▸ <a href="${art.link}">${art.title}</a>\n`;
                }
                block += '\n';
              } else {
                block += `<b>No.${rank}  ${t.keyword.toUpperCase()}</b>\n`;
                block += `<code>${status}</code>  ·  ${t.count} artikel${vel}\n\n`;
                block += `<i>${insight}</i>\n`;
                if (t.articles && t.articles.length > 0) {
                  block += `\n<b>Berita Terpilih:</b>\n`;
                  t.articles.slice(0, 2).forEach(art => {
                    const pd = art.pubDate
                      ? new Date(art.pubDate).toLocaleString('id-ID', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—';
                    block += `▸ <i>${pd}</i>\n`;
                    block += `  "<a href="${art.link}">${art.title}</a>"\n`;
                  });
                }
                block += '\n';
              }
              return block;
            };

            // ── HEADLINE UTAMA (#1) ──
            report += `<b>HEADLINE UTAMA</b>\n`;
            report += `─────────────────────────\n`;
            report += renderItem(topTrends[0], 1, false);

            // ── TREN AKTIF (#2–#4) ──
            if (topTrends.length > 1) {
              report += `─────────────────────────\n`;
              report += `<b>TREN AKTIF</b>\n`;
              report += `─────────────────────────\n`;
              topTrends.slice(1, 4).forEach((t, i) => {
                report += renderItem(t, i + 2, false);
              });
            }

            // ── DIPANTAU (#5–#7, compact) ──
            if (topTrends.length > 4) {
              report += `─────────────────────────\n`;
              report += `<b>DIPANTAU</b>\n`;
              report += `─────────────────────────\n`;
              topTrends.slice(4).forEach((t, i) => {
                report += renderItem(t, i + 5, true);
              });
            }

            // ── FOOTER ──
            report += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            report += `Produksi konten untuk tren #1:\n`;
            report += `<code>/create ${topKw.keyword}</code>\n\n`;
            report += `<i>Filter laporan: /trend marketing · /trend ai · /trend ecommerce · /trend social · /trend tools</i>`;

            await bot.sendMessage(chatId, report, { parse_mode: 'HTML', disable_web_page_preview: true });
          }
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
          await bot.sendMessage(chatId, `⏳ Meracik script untuk <b>"${args}"</b>...`, { parse_mode: 'HTML' });
          const contentGenerator = require('../content_generator');
          const result = await contentGenerator.generateHooks(args);

          if (!result || !result.text) {
            await bot.sendMessage(chatId, `❌ <b>Gagal meracik konten.</b>\nAI tidak memberikan respons untuk keyword tersebut. Coba gunakan keyword marketing yang lebih spesifik!`, { parse_mode: 'HTML' });
            return;
          }

          const angles = parseContentAngles(result.text);

          // Header
          await bot.sendMessage(chatId,
            `🎬 <b>CONTENT STRATEGY</b>\n` +
            `<i>"${args}"</i>\n\n` +
            `<b>${angles.length} angle</b> siap · <code>${result.model.split('/').pop()}</code>`,
            { parse_mode: 'HTML' }
          );

          // One card per angle
          for (let i = 0; i < angles.length; i++) {
            await bot.sendMessage(chatId, formatAngleCard(i + 1, angles[i]), { parse_mode: 'HTML' });
          }
        }
      } else if (text.startsWith('/news')) {
        await bot.sendMessage(chatId, '⏳ Sedang menarik berita terkini...');
        const { getNewsData } = require('../news');
        const newsMessage = await getNewsData();
        await bot.sendMessage(chatId, newsMessage, { parse_mode: 'HTML', disable_web_page_preview: true });
      } else if (text.startsWith('/blom')) {
        const args = text.trim().split(/\s+/);
        const sub  = args[1]?.toLowerCase();
        const validSubs = ['markets', 'economy', 'crypto', 'stocks'];

        if (sub && !validSubs.includes(sub)) {
          await bot.sendMessage(chatId,
            `❓ <b>Sub-command tidak valid.</b>\n\nGunakan:\n` +
            `• <code>/blom</code> — Overview semua berita keuangan global\n` +
            `• <code>/blom markets</code> — Berita pasar &amp; saham\n` +
            `• <code>/blom economy</code> — Makroekonomi global\n` +
            `• <code>/blom crypto</code> — Crypto &amp; digital assets\n` +
            `• <code>/blom stocks</code> — Saham &amp; ekuitas`,
            { parse_mode: 'HTML' }
          );
        } else if (sub && validSubs.includes(sub)) {
          const { runBloombergCategory } = require('../bloomberg');
          await runBloombergCategory(bot, chatId, sub);
        } else {
          const { runBloombergOverview } = require('../bloomberg');
          await runBloombergOverview(bot, chatId);
        }
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
