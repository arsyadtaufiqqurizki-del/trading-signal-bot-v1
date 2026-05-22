'use strict';

const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 12000 });

// ─── Bloomberg & Financial News RSS Sources ──────────────────────────────────
// Bloomberg doesn't have a public RSS anymore, so we use alternatives that
// cover the same Bloomberg-quality global financial news.
const BLOOMBERG_LIKE_FEEDS = [
    {
        name: 'Reuters Business',
        url: 'https://feeds.reuters.com/reuters/businessNews',
        icon: '📡'
    },
    {
        name: 'Financial Times',
        url: 'https://www.ft.com/?format=rss',
        icon: '🗞️'
    },
    {
        name: 'CNBC Markets',
        url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
        icon: '📺'
    },
    {
        name: 'CNBC World Economy',
        url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        icon: '🌐'
    },
    {
        name: 'MarketWatch',
        url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',
        icon: '📈'
    },
    {
        name: 'Investing.com News',
        url: 'https://www.investing.com/rss/news.rss',
        icon: '💹'
    },
];

// Category-specific feeds
const CATEGORY_FEEDS = {
    markets: [
        { name: 'CNBC Markets', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', icon: '📺' },
        { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', icon: '📈' },
    ],
    economy: [
        { name: 'Reuters Economics', url: 'https://feeds.reuters.com/reuters/businessNews', icon: '📡' },
        { name: 'CNBC Economy', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', icon: '🌐' },
    ],
    crypto: [
        { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', icon: '🪙' },
        { name: 'Decrypt', url: 'https://decrypt.co/feed', icon: '🔐' },
        { name: 'CryptoPanic', url: 'https://cryptopanic.com/news/rss/', icon: '⚡' },
    ],
    stocks: [
        { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews', icon: '📡' },
        { name: 'CNBC Investing', url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html', icon: '💼' },
    ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function timeSince(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m lalu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h lalu`;
    return `${Math.floor(hrs / 24)}d lalu`;
}

function cleanTitle(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
}

function categorizeNews(title) {
    const t = title.toLowerCase();
    if (/bitcoin|btc|ethereum|eth|crypto|defi|nft|blockchain|token/i.test(t)) return '🪙 Crypto';
    if (/fed|interest rate|inflation|cpi|ppi|gdp|unemployment|nfp|fomc|ecb/i.test(t)) return '🏦 Macro';
    if (/stock|equity|nasdaq|s&p|dow jones|wall street|ipo|earnings/i.test(t)) return '📊 Stocks';
    if (/oil|gold|commodity|brent|wti|silver|copper/i.test(t)) return '🛢️ Commodities';
    if (/forex|usd|eur|gbp|jpy|currency|dollar/i.test(t)) return '💱 Forex';
    if (/bond|yield|treasury|debt/i.test(t)) return '📜 Bonds';
    return '🌍 Global';
}

function marketImpact(title) {
    const t = title.toLowerCase();
    if (/surge|rally|soar|jump|gain|boom|bull|all.time.high|record high/i.test(t)) return '🟢 Bullish';
    if (/crash|plunge|drop|fall|decline|bear|sell.off|recession|crisis/i.test(t)) return '🔴 Bearish';
    if (/mixed|flat|unchanged|stabilize|pause|hold/i.test(t)) return '⚪ Neutral';
    return null;
}

// ─── AI SUMMARY ──────────────────────────────────────────────────────────────
async function generateBloombergAISummary(headlines, category) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    const modelsToTry = [
        'minimax/minimax-m2.5:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'google/gemma-4-31b-it'
    ];

    const catLabel = category ? ` sektor ${category.toUpperCase()}` : '';
    const prompt = `Kamu adalah senior market analyst sekelas Bloomberg Intelligence. Berdasarkan headlines berita keuangan global berikut${catLabel}, buat ringkasan analisis tajam dalam Bahasa Indonesia.

HEADLINES TERKINI:
${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Tulis dengan format PERSIS ini (gunakan HTML bold untuk judul):

<b>📡 Bloomberg Intelligence Flash:</b>
[1 kalimat ringkasan kondisi pasar global saat ini]

<b>🔥 Tema Dominan:</b>
• [Tema 1 — penjelasan singkat implikasi ke market]
• [Tema 2 — penjelasan singkat implikasi ke market]
• [Tema 3 — penjelasan singkat implikasi ke market]

<b>⚠️ Watch List Trader:</b>
[1–2 kalimat risiko atau peluang yang harus diperhatikan trader hari ini. Spesifik dengan aset atau pair yang relevan]

<b>🎯 Bias Sementara:</b> [Bullish/Bearish/Neutral] — [1 kalimat alasan]

PENTING: Langsung mulai dengan "<b>📡 Bloomberg Intelligence Flash:</b>". Jangan tambahkan pembuka/penutup.`;

    for (const model of modelsToTry) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.35,
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://gemini-cli.vercel.app',
                        'X-Title': 'Bloomberg Intel Bot'
                    },
                    timeout: 22000
                }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (text) return { text: text.trim(), model };
        } catch (e) {
            console.error(`[Bloomberg AI] Model ${model} failed:`, e.message);
        }
    }
    return null;
}

// ─── FETCH NEWS ───────────────────────────────────────────────────────────────
async function fetchFeedsSafe(feeds) {
    const results = await Promise.allSettled(
        feeds.map(f => parser.parseURL(f.url).then(data => ({ ...f, items: data.items || [] })))
    );
    return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
}

// ─── MAIN: Overview ──────────────────────────────────────────────────────────
async function runBloombergOverview(bot, chatId) {
    await bot.sendMessage(chatId, '⏳ <b>Menarik Bloomberg Intelligence...</b>\n<i>Agregasi berita pasar global terkini</i>', { parse_mode: 'HTML' });

    const now = new Date();
    const dateStr = now.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const timeStr = now.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const sep = '━━━━━━━━━━━━━━━━━━━━━━━━';

    // Fetch all feeds
    const feedData = await fetchFeedsSafe(BLOOMBERG_LIKE_FEEDS);
    const allItems = feedData
        .flatMap(f => f.items.map(item => ({ ...item, source: f.name, icon: f.icon })))
        .filter(item => item.title)
        .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
        .slice(0, 30);

    if (allItems.length === 0) {
        await bot.sendMessage(chatId, '❌ <b>Gagal menarik berita.</b>\nCoba lagi dalam beberapa menit.', { parse_mode: 'HTML' });
        return;
    }

    // Group by category
    const grouped = {};
    allItems.slice(0, 15).forEach(item => {
        const cat = categorizeNews(item.title);
        if (!grouped[cat]) grouped[cat] = [];
        if (grouped[cat].length < 3) grouped[cat].push(item);
    });

    let msg = `<b>📊 BLOOMBERG INTELLIGENCE REPORT</b>\n`;
    msg += `<i>Global Financial News Aggregator</i>\n`;
    msg += `${sep}\n`;
    msg += `📅 ${dateStr}\n`;
    msg += `🕙 Update: ${timeStr} WIB · ${allItems.length} headline dianalisis\n`;
    msg += `${sep}\n`;

    // Top headlines
    msg += `\n<b>🔥 TOP HEADLINES</b>\n`;
    allItems.slice(0, 5).forEach((item, i) => {
        const impact = marketImpact(item.title);
        const age = timeSince(item.pubDate);
        msg += `\n<b>${i + 1}. ${cleanTitle(item.title)}</b>\n`;
        if (impact) msg += `${impact}  `;
        msg += `${item.icon} ${item.source}`;
        if (age) msg += `  ·  🕐 ${age}`;
        msg += '\n';
        if (item.link) msg += `🔗 <a href="${item.link}">Baca selengkapnya</a>\n`;
    });

    msg += `\n${sep}\n`;

    // By category
    const catOrder = ['🪙 Crypto', '🏦 Macro', '📊 Stocks', '💱 Forex', '🛢️ Commodities'];
    const catToShow = catOrder.filter(c => grouped[c] && grouped[c].length > 0).slice(0, 3);

    if (catToShow.length > 0) {
        msg += `\n<b>📑 BERITA PER KATEGORI</b>\n`;
        catToShow.forEach(cat => {
            msg += `\n<b>${cat}</b>\n`;
            grouped[cat].forEach((item, i) => {
                const age = timeSince(item.pubDate);
                msg += `${i + 1}. <a href="${item.link || '#'}">${cleanTitle(item.title)}</a>`;
                if (age) msg += ` <i>(${age})</i>`;
                msg += '\n';
            });
        });
        msg += `\n${sep}\n`;
    }

    // Sources info
    const successSources = feedData.filter(f => f.items.length > 0).map(f => `${f.icon} ${f.name}`).join(' · ');
    msg += `\n<i>Sumber: ${successSources}</i>\n`;
    msg += `\n💡 <i>Sub-commands: /blom markets · /blom economy · /blom crypto · /blom stocks</i>`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });

    // AI Summary (separate message)
    const headlines = allItems.slice(0, 12).map(item => item.title);
    const aiResult = await generateBloombergAISummary(headlines, null);
    if (aiResult) {
        const modelShort = aiResult.model.split('/').pop().replace(/:free$/, '');
        const aiMsg =
            `${sep}\n` +
            `${aiResult.text}\n` +
            `${sep}\n\n` +
            `🤖 <i>Generated by <b>${modelShort}</b> via OpenRouter</i>\n` +
            `⚠️ <i>Bukan rekomendasi investasi. Selalu lakukan riset mandiri.</i>`;
        await bot.sendMessage(chatId, aiMsg, { parse_mode: 'HTML' });
    }
}

// ─── MAIN: Category ──────────────────────────────────────────────────────────
async function runBloombergCategory(bot, chatId, category) {
    const catFeeds = CATEGORY_FEEDS[category];
    if (!catFeeds) {
        await bot.sendMessage(chatId,
            `❓ <b>Kategori tidak valid.</b>\n\nGunakan:\n` +
            `• <code>/blom</code> — Overview semua berita global\n` +
            `• <code>/blom markets</code> — Berita pasar & saham\n` +
            `• <code>/blom economy</code> — Makroekonomi global\n` +
            `• <code>/blom crypto</code> — Crypto & digital assets\n` +
            `• <code>/blom stocks</code> — Saham & ekuitas`,
            { parse_mode: 'HTML' }
        );
        return;
    }

    const catNames = {
        markets: '📈 PASAR & SAHAM',
        economy: '🏦 MAKROEKONOMI GLOBAL',
        crypto: '🪙 CRYPTO & DIGITAL ASSETS',
        stocks: '📊 SAHAM & EKUITAS',
    };

    await bot.sendMessage(chatId,
        `⏳ <b>Menarik ${catNames[category] || category.toUpperCase()}...</b>`,
        { parse_mode: 'HTML' }
    );

    const now = new Date();
    const timeStr = now.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
    const sep = '━━━━━━━━━━━━━━━━━━━━━━━━';

    const feedData = await fetchFeedsSafe(catFeeds);
    const allItems = feedData
        .flatMap(f => f.items.map(item => ({ ...item, source: f.name, icon: f.icon })))
        .filter(item => item.title)
        .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
        .slice(0, 15);

    if (allItems.length === 0) {
        await bot.sendMessage(chatId, '❌ <b>Tidak ada berita tersedia saat ini.</b>\nCoba lagi dalam beberapa menit.', { parse_mode: 'HTML' });
        return;
    }

    let msg = `<b>📡 BLOOMBERG · ${catNames[category] || category.toUpperCase()}</b>\n`;
    msg += `${sep}\n`;
    msg += `🕙 ${timeStr} WIB · ${allItems.length} artikel terbaru\n`;
    msg += `${sep}\n`;

    allItems.slice(0, 8).forEach((item, i) => {
        const impact = marketImpact(item.title);
        const age = timeSince(item.pubDate);
        msg += `\n<b>${i + 1}. ${cleanTitle(item.title)}</b>\n`;
        let meta = `${item.icon} ${item.source}`;
        if (impact) meta = `${impact}  ·  ` + meta;
        if (age) meta += `  ·  🕐 ${age}`;
        msg += `${meta}\n`;
        if (item.link) msg += `🔗 <a href="${item.link}">Baca selengkapnya</a>\n`;
    });

    msg += `\n${sep}\n`;
    msg += `💡 <i>Kembali ke overview: /blom</i>`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'HTML', disable_web_page_preview: true });

    // AI Summary
    const headlines = allItems.slice(0, 10).map(item => item.title);
    const aiResult = await generateBloombergAISummary(headlines, category);
    if (aiResult) {
        const modelShort = aiResult.model.split('/').pop().replace(/:free$/, '');
        const aiMsg =
            `${sep}\n` +
            `${aiResult.text}\n` +
            `${sep}\n\n` +
            `🤖 <i>Generated by <b>${modelShort}</b> via OpenRouter</i>\n` +
            `⚠️ <i>Bukan rekomendasi investasi. Selalu lakukan riset mandiri.</i>`;
        await bot.sendMessage(chatId, aiMsg, { parse_mode: 'HTML' });
    }
}

module.exports = { runBloombergOverview, runBloombergCategory };
