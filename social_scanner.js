'use strict';

const Parser = require('rss-parser');

/**
 * SocialScanner now uses RSS feeds to track industry trends.
 * It fetches latest articles from trusted digital marketing and tech sources.
 */
class SocialScanner {
  constructor() {
    this.parser = new Parser();
    this.feeds = [
      { name: 'Social Media Today', url: 'https://www.socialmediatoday.com/feeds/news/' },
      { name: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
      { name: 'Marketing Brew', url: 'https://www.morningbrew.com/marketing/feed' },
      { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' }
    ];
  }

  /**
   * Fetches and aggregates articles from all configured RSS feeds.
   * @returns {Promise<Array>} - A list of all recent articles.
   */
  async scanAllFeeds() {
    const allArticles = [];
    
    try {
      const fetchPromises = this.feeds.map(async (feed) => {
        try {
          const feedData = await this.parser.parseURL(feed.url);
          return feedData.items.map(item => ({
            title: item.title,
            link: item.link,
            content: item.contentSnippet || item.content || '',
            source: feed.name,
            pubDate: item.pubDate
          }));
        } catch (e) {
          console.error(`[SocialScanner] Failed to fetch ${feed.name}: ${e.message}`);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      return results.flat();
    } catch (error) {
      console.error(`[SocialScanner] Critical error scanning feeds: ${error.message}`);
      return [];
    }
  }
}

module.exports = new SocialScanner();
