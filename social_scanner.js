'use strict';

const axios = require('axios');

/**
 * SocialScanner handles the data fetching from various social media APIs.
 * It acts as the bridge between the bot and the Official APIs.
 */
class SocialScanner {
  constructor() {
    this.xBearerToken = process.env.X_BEARER_TOKEN;
    this.tiktokApiKey = process.env.TIKTOK_API_KEY;
    this.xBaseUrl = 'https://api.twitter.com/2';
    this.tiktokBaseUrl = 'https://open.tiktokapis.com/v2';
  }

  /**
   * Fetches recent mentions/tweets for a given set of keywords from X (Twitter).
   * @param {string[]} keywords - List of keywords to monitor.
   * @returns {Promise<Array>} - Array of data containing keyword and its current volume/tweets.
   */
  async fetchXTrends(keywords) {
    if (!this.xBearerToken) {
      console.error('[SocialScanner] X_BEARER_TOKEN is missing');
      return [];
    }

    const results = [];
    try {
      for (const keyword of keywords) {
        // X API v2 Search endpoint
        // query: keyword -is:retweet (to avoid noise from retweets)
        const query = `${encodeURIComponent(keyword)} -is:retweet`;
        const response = await axios.get(`${this.xBaseUrl}/tweets/search/recent?query=${query}&max_results=10`, {
          headers: { Authorization: `Bearer ${this.xBearerToken}` }
        });

        // In a real scenario, we'd use count metrics from the API.
        // For this implementation, we simulate the volume based on the response.
        results.push({
          platform: 'X',
          keyword: keyword,
          count: response.data.meta?.result_count || 0,
          recentTweets: response.data.data || []
        });
      }
    } catch (error) {
      console.error(`[SocialScanner] Error fetching from X: ${error.message}`);
    }
    return results;
  }

  /**
   * Fetches trend data from TikTok API.
   * Note: TikTok API has very strict access requirements.
   * @param {string[]} keywords - List of keywords to monitor.
   * @returns {Promise<Array>} - Array of trend data.
   */
  async fetchTikTokTrends(keywords) {
    if (!this.tiktokApiKey) {
      console.error('[SocialScanner] TIKTOK_API_KEY is missing');
      return [];
    }

    const results = [];
    try {
      for (const keyword of keywords) {
        // This is a conceptual implementation as TikTok's API endpoints vary by app permission
        const response = await axios.get(`${this.tiktokBaseUrl}/research/keyword/trend`, {
          params: { keyword: keyword },
          headers: { Authorization: `Bearer ${this.tiktokApiKey}` }
        });

        results.push({
          platform: 'TikTok',
          keyword: keyword,
          count: response.data?.data?.volume || 0,
          meta: response.data?.data || {}
        });
      }
    } catch (error) {
      console.error(`[SocialScanner] Error fetching from TikTok: ${error.message}`);
    }
    return results;
  }

  /**
   * Aggregates data from all supported platforms.
   * @param {string[]} keywords - List of keywords to monitor.
   */
  async scanAllPlatforms(keywords) {
    const [xData, tiktokData] = await Promise.all([
      this.fetchXTrends(keywords),
      this.fetchTikTokTrends(keywords)
    ]);

    return [...xData, ...tiktokData];
  }
}

module.exports = new SocialScanner();
