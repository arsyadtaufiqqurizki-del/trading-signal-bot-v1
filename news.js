const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 4500 });

// ─── HELPER ──────────────────────────────────────────────────────────────────
function fmt(num, decimals = 2) {
    if (num == null || isNaN(num)) return 'N/A';
    return Number(num).toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtVol(vol) {
    if (!vol || isNaN(vol)) return 'N/A';
    if (vol >= 1_000_000_000) return (vol / 1_000_000_000).toFixed(2) + ' M';
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(2) + ' Jt';
    return vol.toLocaleString('id-ID');
}

function arrow(change) {
    if (change == null || isNaN(change)) return '➖';
    return change >= 0 ? '🟢' : '🔴';
}

function changeSign(change) {
    if (change == null || isNaN(change)) return '±0,00';
    return (change >= 0 ? '+' : '') + fmt(change) + '%';
}

async function yahooQuote(ticker) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketBot/2.0)' },
            timeout: 4500
        });
        const result = resp.data?.chart?.result?.[0];
        if (!result) return null;

        const meta = result.meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const change = prevClose ? ((price - prevClose) / prevClose * 100) : null;
        const changeAbs = prevClose ? (price - prevClose) : null;
        const volume = meta.regularMarketVolume;

        return { price, prevClose, change, changeAbs, volume };
    } catch (e) {
        return null;
    }
}

async function getNewsData() {
    try {
        // 1. Tarik Data Mentah
        const [ihsg, bbca, btcResp, fngResp, newsResults, globalNews, cnnGuardianNews] = await Promise.allSettled([
            yahooQuote('^JKSE'),
            yahooQuote('BBCA.JK'),
            axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { timeout: 4500 }),
            axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 4500 }),
            Promise.all([
                parser.parseURL('https://www.cnbcindonesia.com/news/rss').catch(() => ({ items: [] })),
                parser.parseURL('https://feed.bisnis.com/biz/home/articles/rss').catch(() => ({ items: [] }))
            ]),
            Promise.all([
                parser.parseURL('http://feeds.bbci.co.uk/news/business/rss.xml').catch(() => ({ items: [] })),
                parser.parseURL('https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml').catch(() => ({ items: [] }))
            ]),
            Promise.all([
                parser.parseURL('http://rss.cnn.com/rss/edition_business.rss').catch(() => ({ items: [] })),
                parser.parseURL('http://rss.cnn.com/rss/edition_world.rss').catch(() => ({ items: [] })),
                parser.parseURL('https://www.theguardian.com/business/rss').catch(() => ({ items: [] })),
                parser.parseURL('https://www.theguardian.com/world/rss').catch(() => ({ items: [] }))
            ])
        ]);

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Jakarta' });
        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        const sep = '─────────────────────────────';

        let lines = [];
        lines.push(`<b>📊 DAILY MARKET INTELLIGENCE REPORT</b>`);
        lines.push(`📅 ${today}`);
        lines.push(`🕙 Update otomatis · ${time} WIB`);
        lines.push(sep);

        // --- SEKSI 1: IHSG ---
        lines.push(`\n<b>🇮🇩 PASAR INDONESIA — IDX Composite (IHSG)</b>`);
        if (ihsg.status === 'fulfilled' && ihsg.value) {
            const d = ihsg.value;
            const a = arrow(d.change);
            let sentiment = 'Sideways ↔️';
            let desc = 'Pergerakan masih terbatas, pelaku pasar wait-and-see.';
            if (d.change >= 1.0) { sentiment = 'Bullish 🚀'; desc = 'Tekanan beli mendominasi, pasar optimis.'; }
            else if (d.change <= -1.0) { sentiment = 'Bearish 🔻'; desc = 'Tekanan jual meningkat, sentimen negatif.'; }
            lines.push(`${a} Harga: <b>${fmt(d.price)}</b> poin`);
            lines.push(`📈 Perubahan: ${changeSign(d.change)} (${d.changeAbs >= 0 ? '+' : ''}${fmt(d.changeAbs)})`);
            lines.push(`🧭 Sentimen: <b>${sentiment}</b>`);
            lines.push(`💬 <i>${desc}</i>`);
        } else {
            lines.push(`⚠️ Data IHSG tidak dapat ditarik.`);
        }
        lines.push(sep);

        // --- SEKSI 2: BBCA ---
        lines.push(`\n<b>🏦 SAHAM BLUE CHIP — Bank Central Asia (BBCA)</b>`);
        if (bbca.status === 'fulfilled' && bbca.value) {
            const d = bbca.value;
            const a = arrow(d.change);
            let insight = 'Monitor area support/resistance terdekat.';
            if (d.change >= 2) insight = 'Momentum beli kuat. Perhatikan breakout resistance.';
            else if (d.change <= -2) insight = 'Tekanan jual signifikan. Waspadai breakdown support.';
            lines.push(`${a} Harga: <b>Rp${fmt(d.price, 0)}</b>`);
            lines.push(`📈 Perubahan: ${changeSign(d.change)} (Rp${d.changeAbs >= 0 ? '+' : ''}${fmt(d.changeAbs, 0)})`);
            lines.push(`📦 Volume: ${fmtVol(d.volume)} lot`);
            lines.push(`💡 Insight: <i>${insight}</i>`);
        } else {
            lines.push(`⚠️ Data BBCA tidak dapat ditarik.`);
        }
        lines.push(sep);

        // --- SEKSI 3: BITCOIN ---
        lines.push(`\n<b>₿ CRYPTOCURRENCY — Bitcoin (BTC/USD)</b>`);
        let btcPrice = null, btcChange = null;
        if (btcResp.status === 'fulfilled') {
            const d = btcResp.value.data?.bitcoin;
            btcPrice = d?.usd;
            btcChange = d?.usd_24h_change;
        }
        if (btcPrice) {
            const a = arrow(btcChange);
            lines.push(`${a} Harga: <b>$${fmt(btcPrice)}</b>`);
            lines.push(`📈 24h Change: ${changeSign(btcChange)}`);
            if (fngResp.status === 'fulfilled') {
                const f = fngResp.value.data?.data?.[0];
                const emoji = Number(f.value) >= 60 ? '😤' : Number(f.value) >= 40 ? '😐' : '😨';
                lines.push(`🧠 Fear & Greed Index: ${emoji} ${f.value}/100 — <i>${f.value_classification}</i>`);
            }
            let btcInsight = 'Pantau area OB (Order Block) terdekat.';
            if (btcChange <= -4) btcInsight = 'Sell-off signifikan. Konfirmasi BOS bawah sebelum entry.';
            lines.push(`💡 Insight: <i>${btcInsight}</i>`);
        } else {
            lines.push(`⚠️ Data Bitcoin tidak dapat ditarik.`);
        }
        lines.push(sep);

        // --- SEKSI 4: BERITA ---
        lines.push(`\n<b>📰 BERITA EKONOMI & BISNIS TOP INDONESIA</b>`);
        let hasNews = false;
        if (newsResults.status === 'fulfilled') {
            const allItems = [];
            newsResults.value.forEach(r => { if (r.items) allItems.push(...r.items.slice(0, 15)); });
            allItems.sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0));
            
            const uniqueItems = [];
            const seen = new Set();
            for (const item of allItems) {
                if (item.title) {
                    const key = item.title.toLowerCase().substring(0, 40);
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueItems.push(item);
                    }
                }
            }
            
            const top10 = uniqueItems.slice(0, 10);
            if (top10.length > 0) {
                hasNews = true;
                top10.forEach((item, i) => {
                    lines.push(`\n${i + 1}. <b>${item.title.trim()}</b>`);
                    lines.push(`🔗 ${item.link}`);
                });
            }
        }
        if (!hasNews) lines.push(`\n❌ Tidak ada berita terbaru saat ini`);
        lines.push(sep);

        // --- SEKSI 4.5: BERITA GLOBAL ---
        lines.push(`\n<b>🌍 BERITA GLOBAL (CNN & THE GUARDIAN)</b>`);
        let hasGlobalNews = false;
        if (cnnGuardianNews && cnnGuardianNews.status === 'fulfilled') {
            const allGlobalItems = [];
            cnnGuardianNews.value.forEach(r => { if (r.items) allGlobalItems.push(...r.items.slice(0, 15)); });
            allGlobalItems.sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0));
            
            const uniqueGlobalItems = [];
            const seenGlobal = new Set();
            for (const item of allGlobalItems) {
                if (item.title) {
                    const key = item.title.toLowerCase().substring(0, 40);
                    if (!seenGlobal.has(key)) {
                        seenGlobal.add(key);
                        uniqueGlobalItems.push(item);
                    }
                }
            }
            
            const top10Global = uniqueGlobalItems.slice(0, 10);
            if (top10Global.length > 0) {
                hasGlobalNews = true;
                top10Global.forEach((item, i) => {
                    lines.push(`\n${i + 1}. <b>${item.title.trim()}</b>`);
                    lines.push(`🔗 ${item.link}`);
                });
            }
        }
        if (!hasGlobalNews) lines.push(`\n❌ Tidak ada berita terbaru saat ini`);
        lines.push(sep);

        // --- SEKSI 5: MAKRO GLOBAL ---
        lines.push(`\n<b>🌍 KONDISI MAKRO GLOBAL</b>`);
        if (globalNews.status === 'fulfilled') {
            const headlines = globalNews.value.flatMap(r => r.items).map(i => i.title.toLowerCase()).join(' ');
            let riskMode = 'Netral ⚪', riskDesc = 'Pasar menunggu katalis dominan.';
            if (headlines.includes('inflation') || headlines.includes('cpi')) riskDesc = 'Inflasi masih menjadi perhatian utama bank sentral.';
            if (headlines.includes('war') || headlines.includes('conflict')) { riskMode = 'Risk-Off 🔴'; riskDesc = 'Ketegangan geopolitik meningkatkan ketidakpastian.'; }
            lines.push(`⚡ Mode Pasar: <b>${riskMode}</b>`);
            lines.push(`💬 <i>${riskDesc}</i>`);
        }
        lines.push(sep);

        lines.push(`\n⚠️ <i>Laporan informatif, bukan rekomendasi investasi.</i>`);
        lines.push(`🤖 <b>Market Intelligence System v2.0</b> (Tanpa AI)`);

        return lines.join('\n');

    } catch (error) {
        return `❌ <b>Gagal generate laporan:</b> ${error.message}`;
    }
}

module.exports = { getNewsData };
