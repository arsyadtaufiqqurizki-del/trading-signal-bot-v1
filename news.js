const Parser = require('rss-parser');
const parser = new Parser();

async function getNewsData() {
    const feeds = [
        { name: "Global Crypto News", url: 'https://cryptopanic.com/news/rss/' },
        { name: "Global Business News", url: 'http://feeds.bbci.co.uk/news/business/rss.xml' }
    ];
    
    let result = '📰 <b>Top Market & Crypto News</b>\n\n';

    for (const feedObj of feeds) {
        try {
            const feed = await parser.parseURL(feedObj.url);
            result += `🌍 <b>${feedObj.name}</b>\n`;
            for (let i = 0; i < Math.min(5, feed.items.length); i++) {
                const item = feed.items[i];
                result += `▪️ <a href="${item.link}">${item.title}</a>\n`;
            }
            result += '\n';
        } catch (error) {
            console.error(`Gagal narik RSS dari ${feedObj.url}:`, error.message);
        }
    }
    
    return result;
}

module.exports = { getNewsData };
