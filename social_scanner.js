'use strict';

const Parser = require('rss-parser');

/**
 * SocialScanner — Multi-source news scanner for Indonesia.
 * Sources: Google News ID, Detik.com, Kompas.com, Kumparan.
 * Each article gets a recency score (0–1) based on pubDate.
 */
class SocialScanner {
  constructor() {
    this.parser = new Parser({ timeout: 12000 });
    this.googleBase = 'https://news.google.com/rss/search';
    this.googleParams = { hl: 'id', gl: 'ID', ceid: 'ID:id' };

    // Static Indonesian RSS feeds (not keyword-specific)
    this.staticFeeds = [
      { url: 'https://www.detik.com/tag/digital-marketing/rss-feed',  source: 'Detik.com' },
      { url: 'https://tekno.kompas.com/rss/feed.xml',                  source: 'Kompas Tekno' },
      { url: 'https://money.kompas.com/rss/feed.xml',                  source: 'Kompas Money' },
      { url: 'https://www.cnbcindonesia.com/tech/rss',                  source: 'CNBC Indonesia Tech' },
    ];
  }

  /**
   * Calculate recency score (0.0–1.0) for an article.
   * 1.0 = published in the last hour, 0.0 = older than 48 hours.
   */
  _recencyScore(pubDate) {
    if (!pubDate) return 0.3;
    try {
      const ageMs = Date.now() - new Date(pubDate).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours <= 1)  return 1.0;
      if (ageHours <= 6)  return 0.85;
      if (ageHours <= 12) return 0.65;
      if (ageHours <= 24) return 0.45;
      if (ageHours <= 48) return 0.25;
      return 0.1;
    } catch {
      return 0.3;
    }
  }

  /**
   * Fetch articles from Google News RSS for a specific keyword.
   */
  async _fetchGoogleNews(keyword) {
    try {
      const url = `${this.googleBase}?q=${encodeURIComponent(keyword + ' Indonesia')}&hl=${this.googleParams.hl}&gl=${this.googleParams.gl}&ceid=${this.googleParams.ceid}`;
      const feedData = await this.parser.parseURL(url);
      return feedData.items.map(item => ({
        title:          item.title || '',
        link:           item.link || '',
        content:        item.contentSnippet || item.content || '',
        source:         item.source ? item.source.title : 'Google News ID',
        pubDate:        item.pubDate || null,
        matchedKeyword: keyword,
        recencyScore:   this._recencyScore(item.pubDate),
      }));
    } catch (e) {
      console.error(`[SocialScanner] Google News failed for "${keyword}": ${e.message}`);
      return [];
    }
  }

  /**
   * Fetch all static RSS feeds and filter by keyword relevance.
   */
  async _fetchStaticFeeds(keywords) {
    const allArticles = [];
    const kwLower = keywords.map(k => k.toLowerCase());

    await Promise.allSettled(
      this.staticFeeds.map(async (feed) => {
        try {
          const feedData = await this.parser.parseURL(feed.url);
          for (const item of feedData.items) {
            const text = `${item.title || ''} ${item.contentSnippet || item.content || ''}`.toLowerCase();
            const matched = kwLower.find(kw => text.includes(kw));
            if (matched) {
              allArticles.push({
                title:          item.title || '',
                link:           item.link || '',
                content:        item.contentSnippet || item.content || '',
                source:         feed.source,
                pubDate:        item.pubDate || null,
                matchedKeyword: keywords[kwLower.indexOf(matched)],
                recencyScore:   this._recencyScore(item.pubDate),
              });
            }
          }
        } catch (e) {
          console.error(`[SocialScanner] Static feed failed (${feed.source}): ${e.message}`);
        }
      })
    );

    return allArticles;
  }

  /**
   * Main scanner: fetch from Google News (per keyword) + static feeds.
   * @param {string[]} keywords - Keywords to search for.
   * @returns {Promise<Array>} - Deduplicated list of articles with recencyScore.
   */
  async scanKeywords(keywords) {
    try {
      const [googleResults, staticResults] = await Promise.all([
        // Google News: one query per keyword (parallel)
        Promise.all(keywords.map(kw => this._fetchGoogleNews(kw))).then(r => r.flat()),
        // Static feeds: all at once, filtered by keyword
        this._fetchStaticFeeds(keywords),
      ]);

      const combined = [...googleResults, ...staticResults];

      // Deduplicate by title similarity (strip whitespace + lowercase)
      const seen = new Set();
      return combined.filter(a => {
        const key = a.title.toLowerCase().replace(/\s+/g, ' ').trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    } catch (error) {
      console.error(`[SocialScanner] Critical error: ${error.message}`);
      return [];
    }
  }
}

module.exports = new SocialScanner();
