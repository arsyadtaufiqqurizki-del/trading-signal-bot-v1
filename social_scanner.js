'use strict';

const Parser = require('rss-parser');

/**
 * SocialScanner now focuses on the Indonesia region using Google News RSS.
 * It dynamically generates search queries for each keyword to find relevant local news.
 */
class SocialScanner {
  constructor() {
    this.parser = new Parser();
    this.baseUrl = 'https://news.google.com/rss/search';
    this.params = {
      hl: 'id',
      gl: 'ID',
      ceid: 'ID:id'
    };
  }

  /**
   * Fetches articles from Google News for a specific set of keywords.
   * @param {string[]} keywords - List of keywords to search for in Indonesia.
   * @returns {Promise<Array>} - A list of all found articles.
   */
  async scanKeywords(keywords) {
    const allArticles = [];
    
    try {
      const fetchPromises = keywords.map(async (keyword) => {
        try {
          const url = `${this.baseUrl}?q=${encodeURIComponent(keyword)}&hl=${this.params.hl}&gl=${this.params.gl}&ceid=${this.params.ceid}`;
          const feedData = await this.parser.parseURL(url);
          
          return feedData.items.map(item => ({
            title: item.title,
            link: item.link,
            content: item.contentSnippet || item.content || '',
            source: item.source ? item.source.title : 'Google News ID',
            pubDate: item.pubDate,
            matchedKeyword: keyword
          }));
        } catch (e) {
          console.error(`[SocialScanner] Failed to fetch news for ${keyword}: ${e.message}`);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      return results.flat();
    } catch (error) {
      console.error(`[SocialScanner] Critical error scanning Google News ID: ${error.message}`);
      return [];
    }
  }
}

module.exports = new SocialScanner();
