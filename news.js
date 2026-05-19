const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 10000 });

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

async function generateAIMarketSummary(marketContext) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    const modelsToTry = [
        'minimax/minimax-m2.5:free',
        'nousresearch/hermes-3-llama-3.1-405b:free',
        'google/gemma-4-31b-it'
    ];

    const prompt = `Kamu adalah analis pasar senior. Berdasarkan data pasar berikut, buat ringkasan analisis dalam Bahasa Indonesia yang tajam, informatif, dan actionable.

DATA PASAR HARI INI:
${marketContext}

Tulis analisis dengan format PERSIS seperti ini (gunakan HTML bold tag untuk judul):
<b>Sentimen Keseluruhan:</b> [Bullish/Bearish/Neutral] — [1 kalimat alasan utama]

<b>Katalis Utama:</b>
• [Faktor 1 yang paling mempengaruhi pasar]
• [Faktor 2]
• [Faktor 3]

<b>Perhatikan:</b> [1–2 kalimat tentang risiko atau peluang yang harus diwaspadai trader hari ini]

PENTING: Jangan tambahkan teks pembuka/penutup. Langsung mulai dengan "<b>Sentimen Keseluruhan:</b>".`;

    for (const model of modelsToTry) {
        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.4,
                    max_tokens: 400
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://gemini-cli.vercel.app',
                        'X-Title': 'Market Intel Bot'
                    },
                    timeout: 20000
                }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (text) return text.trim();
        } catch (e) {
            console.error(`[AI Summary] Model ${model} failed:`, e.message);
        }
    }
    return null;
}

async function yahooQuote(ticker) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const resp = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MarketBot/2.0)' },
            timeout: 10000
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
        const [ihsg, bbca, btcResp, fngResp, newsResults, globalNews] = await Promise.allSettled([
            yahooQuote('^JKSE'),
            yahooQuote('BBCA.JK'),
            axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', { timeout: 10000 }),
            axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 8000 }),
            Promise.all([
                parser.parseURL('https://www.cnbcindonesia.com/news/rss').catch(() => ({ items: [] })),
                parser.parseURL('https://feed.bisnis.com/biz/home/articles/rss').catch(() => ({ items: [] }))
            ]),
            Promise.all([
                parser.parseURL('http://feeds.bbci.co.uk/news/business/rss.xml').catch(() => ({ items: [] })),
                parser.parseURL('https://rss.nytimes.com/services/xml/rss/nyt/Economy.xml').catch(() => ({ items: [] })),
                parser.parseURL('https://www.cnbc.com/id/100003114/device/rss/rss.html').catch(() => ({ items: [] }))
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
        if (newsResults.status === 'fulfilled') {
            const allItems = newsResults.value.flatMap(r => r.items).slice(0, 4);
            allItems.forEach((item, i) => {
                lines.push(`\n${i + 1}. <b>${item.title.trim()}</b>`);
                lines.push(`🔗 <a href="${item.link}">Baca di CNBC/Bisnis</a>`);
            });
        }
        lines.push(sep);

        // --- SEKSI 5: MAKRO GLOBAL ---
        lines.push(`\n<b>🌍 KONDISI MAKRO GLOBAL</b>`);
        let globalHeadlinesForAI = [];
        if (globalNews.status === 'fulfilled') {
            const allGlobalItems = globalNews.value.flatMap(r => r.items).slice(0, 10);
            globalHeadlinesForAI = allGlobalItems.map(i => i.title);

            const lowerHeadlines = allGlobalItems.map(i => i.title).join('\n').toLowerCase();
            let riskMode = 'Netral ⚪', riskDesc = 'Pasar menunggu katalis dominan.';
            if (lowerHeadlines.includes('inflation') || lowerHeadlines.includes('cpi')) riskDesc = 'Inflasi masih menjadi perhatian utama bank sentral.';
            if (lowerHeadlines.includes('war') || lowerHeadlines.includes('conflict')) { riskMode = 'Risk-Off 🔴'; riskDesc = 'Ketegangan geopolitik meningkatkan ketidakpastian.'; }
            lines.push(`⚡ Mode Pasar: <b>${riskMode}</b>`);
            lines.push(`💬 <i>${riskDesc}</i>`);

            lines.push(`\n<b>Top Global Headlines:</b>`);
            allGlobalItems.slice(0, 3).forEach((item, i) => {
                lines.push(`\n${i + 1}. <b>${item.title.trim()}</b>`);
                lines.push(`🔗 <a href="${item.link}">Read More</a>`);
            });
        } else {
            lines.push(`⚠️ Data Makro Global tidak dapat ditarik.`);
        }
        lines.push(sep);

        // --- SEKSI 6: AI SUMMARY ---
        const ihsgData  = ihsg.status === 'fulfilled' && ihsg.value;
        const bbcaData  = bbca.status === 'fulfilled' && bbca.value;
        const btcData   = btcResp.status === 'fulfilled' ? btcResp.value.data?.bitcoin : null;
        const fngData   = fngResp.status === 'fulfilled' ? fngResp.value.data?.data?.[0] : null;
        const localNews = newsResults.status === 'fulfilled'
            ? newsResults.value.flatMap(r => r.items).slice(0, 4).map(i => i.title)
            : [];

        const marketContext = [
            ihsgData   ? `IHSG: ${fmt(ihsgData.price)} poin (${changeSign(ihsgData.change)})`                         : 'IHSG: data tidak tersedia',
            bbcaData   ? `BBCA: Rp${fmt(bbcaData.price, 0)} (${changeSign(bbcaData.change)})`                         : 'BBCA: data tidak tersedia',
            btcData    ? `BTC/USD: $${fmt(btcData.usd)} (24h ${changeSign(btcData.usd_24h_change)})`                   : 'BTC: data tidak tersedia',
            fngData    ? `Fear & Greed Index: ${fngData.value}/100 — ${fngData.value_classification}`                 : '',
            localNews.length ? `\nBerita Lokal Utama:\n${localNews.map((h, i) => `${i+1}. ${h}`).join('\n')}`         : '',
            globalHeadlinesForAI.length ? `\nBerita Global Utama:\n${globalHeadlinesForAI.slice(0, 5).map((h, i) => `${i+1}. ${h}`).join('\n')}` : ''
        ].filter(Boolean).join('\n');

        const aiSummary = await generateAIMarketSummary(marketContext);
        if (aiSummary) {
            lines.push(`\n<b>🤖 AI MARKET INTELLIGENCE</b>`);
            lines.push(aiSummary);
            lines.push(sep);
        }

        lines.push(`\n⚠️ <i>Laporan informatif, bukan rekomendasi investasi.</i>`);
        lines.push(`🤖 <b>Market Intelligence System v2.0</b>`);

        return lines.join('\n');

    } catch (error) {
        return `❌ <b>Gagal generate laporan:</b> ${error.message}`;
    }
}

module.exports = { getNewsData };
