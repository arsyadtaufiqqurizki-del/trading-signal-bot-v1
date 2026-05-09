'use strict';

/**
 * TrendAnalyzer handles the logic of identifying "breakouts" in social media volume.
 * It compares current data against baselines to determine if a trend is emerging.
 */
class TrendAnalyzer {
  constructor() {
    // In a production environment, this would be stored in a database.
    // Here we use a simple in-memory map for demonstration.
    this.baselines = {
      'AI Agent': 2,
      'Digital Marketing': 3,
      'Web3': 2,
      'Content Creator': 3,
      'TikTok Ads': 2
    };
    this.multiplier = 1.5; // Trigger alert if current volume > baseline * 1.5
  }

  /**
   * Analyzes the raw data from SocialScanner to find anomalies.
   * @param {Array} rawData - Array of data from SocialScanner.
   * @returns {Array} - Array of identified trends with analysis.
   */
  analyze(rawData) {
    const trends = [];

    rawData.forEach(item => {
      const keyword = item.keyword;
      const currentVolume = item.count;
      const baseline = this.baselines[keyword] || 50; // Default baseline if not found

      const growth = ((currentVolume - baseline) / baseline) * 100;
      const isTrending = currentVolume > (baseline * this.multiplier);

      if (isTrending) {
        trends.push({
          keyword: keyword,
          platform: item.platform,
          currentVolume: currentVolume,
          baseline: baseline,
          growth: growth.toFixed(1),
          status: '🚀 BREAKOUT',
          confidence: this.calculateConfidence(item, growth)
        });
      }
    });

    return trends;
  }

  /**
   * Calculates confidence based on growth and potentially other factors.
   */
  calculateConfidence(item, growth) {
    if (growth > 500) return 'Very High';
    if (growth > 200) return 'High';
    return 'Medium';
  }

  /**
   * Updates the baseline for a keyword.
   */
  updateBaseline(keyword, value) {
    this.baselines[keyword] = value;
  }
}

module.exports = new TrendAnalyzer();
