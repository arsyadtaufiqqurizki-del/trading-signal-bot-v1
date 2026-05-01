const { GoogleGenerativeAI } = require('@google/generative-ai');
const Parser = require('rss-parser');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const parser = new Parser();

async function getNewsData() {
    // 1. Cek apakah ada API Key Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return "⚠️ <b>Error</b>: <code>GEMINI_API_KEY</code> belum dipasang di file .env atau Vercel Secrets.\nFormat laporan profesional seperti ini membutuhkan kecerdasan buatan (AI) untuk menyusun sentimen pasar, insight, dan ringkasan makro.";
    }

    try {
        // 2. Tarik Data Mentah Market (IHSG, BBCA, BTC)
        const ihsg = await yahooFinance.quote('^JKSE').catch(() => null);
        const bbca = await yahooFinance.quote('BBCA.JK').catch(() => null);
        const btc = await yahooFinance.quote('BTC-USD').catch(() => null);

        let rawMarketData = `Data Mentah Market:\n`;
        if (ihsg) rawMarketData += `IHSG: Harga ${ihsg.regularMarketPrice}, Perubahan ${ihsg.regularMarketChange} (${ihsg.regularMarketChangePercent}%)\n`;
        if (bbca) rawMarketData += `BBCA: Harga ${bbca.regularMarketPrice}, Perubahan ${bbca.regularMarketChangePercent}%, Volume ${bbca.regularMarketVolume}\n`;
        if (btc) rawMarketData += `BTC-USD: Harga ${btc.regularMarketPrice}, Perubahan ${btc.regularMarketChangePercent}%\n`;

        // 3. Tarik Berita Mentah (Top Indonesia & Global)
        const feeds = [
            { name: "Top Indonesia News", url: 'https://www.cnbcindonesia.com/news/rss' },
            { name: "Global Macro & Business", url: 'http://feeds.bbci.co.uk/news/business/rss.xml' }
        ];
        
        let rawNews = `\nData Berita Terbaru:\n`;
        for (const feedObj of feeds) {
            try {
                const feed = await parser.parseURL(feedObj.url);
                rawNews += `Sumber: ${feedObj.name}\n`;
                for (let i = 0; i < Math.min(5, feed.items.length); i++) {
                    const item = feed.items[i];
                    rawNews += `- ${item.title} (Link: ${item.link})\n`;
                }
            } catch (error) {
                console.error(`Gagal narik RSS dari ${feedObj.url}`);
            }
        }

        // 4. Proses dengan Gemini AI
        const genAI = new GoogleGenerativeAI(geminiKey);
        // Kita pakai gemini-2.0-flash. Pastikan API key user punya akses (bukan limit 0).
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Lu adalah analis finansial institusional tingkat dewa. Buatlah "Daily Market Intelligence Briefing" menggunakan data mentah berikut ini:

${rawMarketData}
${rawNews}

Wajib gunakan format output di bawah ini persis, gunakan bahasa Indonesia (semi-formal, profesional), pakai bullet points, sertakan emoji yang relevan, dan pastikan setiap section terisi insight yang tajam (gunakan data mentah dan pemahaman makroekonomi lu). 
IMPORTANT: Generate response in pure HTML format compatible with Telegram (use <b> for bold, <i> for italic, <a> for links). Do NOT use markdown like ** or ##.

FORMAT WAJIB:
<b>📊 DAILY MARKET INTELLIGENCE</b>
📅 <i>[Masukkan Tanggal & Waktu Update Saat Ini]</i>

<b>🇮🇩 Market Indonesia (IHSG)</b>
▪️ Harga Terkini: [Harga IHSG]
▪️ Perubahan: [Poin] ([%]%)
▪️ Sentimen Pasar: [Bullish/Bearish/Sideways]
▪️ Faktor Penggerak: [Analisis singkat]

<b>🏢 Saham Blue Chip (BBCA)</b>
▪️ Harga Terkini: Rp [Harga BBCA]
▪️ Perubahan: [%]%
▪️ Volume: [Volume]
▪️ Insight: [Analisis teknikal/fundamental singkat]

<b>🪙 Cryptocurrency (Bitcoin)</b>
▪️ Harga Terkini: $[Harga BTC]
▪️ Perubahan 24 Jam: [%]%
▪️ Market Sentiment: [Fear/Greed]
▪️ Insight: [Analisis singkat BTC]

<b>📰 Berita Top Indonesia</b>
[Tulis 3-5 berita ekonomi/bisnis paling penting hari ini]
▪️ <b>[Judul Berita]</b>
[Ringkasan 2-3 kalimat]
<a href="[Link Berita]">Baca selengkapnya</a>

<b>🌍 Kondisi Makro Global</b>
▪️ Ringkasan: [Kondisi inflasi, geopolitik, growth outlook dari berita global]
▪️ Dampak Market: [Risk-on / Risk-off]

<b>🏦 Kebijakan Suku Bunga (The Fed)</b>
▪️ Update Terkini: [Situasi suku bunga terkini AS]
▪️ Suku Bunga Saat Ini: [Berapa %]
▪️ Nada Kebijakan: [Hawkish / Dovish]

Buat se-profesional mungkin layaknya laporan untuk hedge fund manager.`;

        const result = await model.generateContent(prompt);
        let finalMessage = result.response.text();
        
        return finalMessage;

    } catch (error) {
        console.error("Error processing news with AI:", error);
        return `❌ <b>Gagal memproses AI</b>: <code>${error.message}</code>\n\nPastikan API Key Gemini Anda valid dan tidak terkena limit kuota.`;
    }
}

module.exports = { getNewsData };
