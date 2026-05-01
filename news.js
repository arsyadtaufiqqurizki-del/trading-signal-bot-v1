const Parser = require('rss-parser');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const parser = new Parser();

async function getNewsData() {
    try {
        // 1. Tarik Data Mentah Market (IHSG, BBCA, BTC)
        const ihsg = await yahooFinance.quote('^JKSE').catch(() => null);
        const bbca = await yahooFinance.quote('BBCA.JK').catch(() => null);
        const btc = await yahooFinance.quote('BTC-USD').catch(() => null);

        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' });

        let finalMessage = `<b>📊 DAILY MARKET INTELLIGENCE</b>\n📅 <i>${today} WIB</i>\n\n`;

        // IHSG
        finalMessage += `<b>🇮🇩 Market Indonesia (IHSG)</b>\n`;
        if (ihsg) {
            const icon = ihsg.regularMarketChange >= 0 ? '🟢' : '🔴';
            finalMessage += `▪️ Harga Terkini: <b>${ihsg.regularMarketPrice.toLocaleString()}</b>\n`;
            finalMessage += `▪️ Perubahan: ${icon} ${ihsg.regularMarketChange.toFixed(2)} (${ihsg.regularMarketChangePercent.toFixed(2)}%)\n\n`;
        } else {
            finalMessage += `⚠️ Data IHSG gagal ditarik\n\n`;
        }

        // BBCA
        finalMessage += `<b>🏢 Saham Blue Chip (BBCA)</b>\n`;
        if (bbca) {
            const icon = bbca.regularMarketChange >= 0 ? '🟢' : '🔴';
            finalMessage += `▪️ Harga Terkini: <b>Rp ${bbca.regularMarketPrice.toLocaleString()}</b>\n`;
            finalMessage += `▪️ Perubahan: ${icon} ${bbca.regularMarketChangePercent.toFixed(2)}%\n`;
            finalMessage += `▪️ Volume: ${bbca.regularMarketVolume.toLocaleString()}\n\n`;
        } else {
            finalMessage += `⚠️ Data BBCA gagal ditarik\n\n`;
        }

        // BTC
        finalMessage += `<b>🪙 Cryptocurrency (Bitcoin)</b>\n`;
        if (btc) {
            const icon = btc.regularMarketChange >= 0 ? '🟢' : '🔴';
            finalMessage += `▪️ Harga Terkini: <b>$${btc.regularMarketPrice.toLocaleString()}</b>\n`;
            finalMessage += `▪️ Perubahan 24 Jam: ${icon} ${btc.regularMarketChangePercent.toFixed(2)}%\n\n`;
        } else {
            finalMessage += `⚠️ Data BTC gagal ditarik\n\n`;
        }

        // 2. Tarik Berita Mentah (Top Indonesia & Global)
        const feeds = [
            { name: "Berita Top Indonesia", url: 'https://www.cnbcindonesia.com/news/rss' },
            { name: "Berita Makro Global", url: 'http://feeds.bbci.co.uk/news/business/rss.xml' }
        ];

        for (const feedObj of feeds) {
            finalMessage += `<b>📰 ${feedObj.name}</b>\n`;
            try {
                const feed = await parser.parseURL(feedObj.url);
                for (let i = 0; i < Math.min(3, feed.items.length); i++) {
                    const item = feed.items[i];
                    finalMessage += `▪️ <b>${item.title}</b>\n<a href="${item.link}">Baca selengkapnya</a>\n\n`;
                }
            } catch (error) {
                finalMessage += `⚠️ Gagal menarik headline berita.\n\n`;
            }
        }

        finalMessage += `<i>(Catatan: Laporan ini adalah data mentah tanpa ringkasan Insight karena mode AI dimatikan)</i>`;

        return finalMessage;

    } catch (error) {
        console.error("Error fetching market intel:", error);
        return `❌ <b>Terjadi kesalahan sistem</b>: <code>${error.message}</code>`;
    }
}

module.exports = { getNewsData };
