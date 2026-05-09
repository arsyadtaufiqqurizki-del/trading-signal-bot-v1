'use strict';

/**
 * TrendAnalyzer analyzes RSS articles to find keyword frequency.
 * It groups articles by keyword to determine if a topic is "Trending".
 */
class TrendAnalyzer {
  constructor() {
    this.watchlist = ['AI Agent', 'Digital Marketing', 'Web3', 'Content Creator', 'TikTok Ads', 'AI', 'SEO', 'Social Media'];
  }

  /**
   * Analyzes the articles and groups them by watchlist keywords.
   * @param {Array} articles - List of articles from SocialScanner.
   * @returns {Object} - Analysis result containing trends and raw activity.
   */
  analyze(articles) {
    const trendMap = {};
    const activityCount = {};

    // Initialize activity count
    this.watchlist.forEach(kw => activityCount[kw] = 0);

    articles.forEach(article => {
      const textToScan = `${article.title} ${article.content}`.toLowerCase();
      
      this.watchlist.forEach(kw => {
        if (textToScan.includes(kw.toLowerCase())) {
          activityCount[kw]++;
          
          if (!trendMap[kw]) {
            trendMap[kw] = [];
          }
          
          // Limit to top 3 articles per keyword to keep report concise
          if (trendMap[kw].length < 3) {
            trendMap[kw].push({
              title: article.title,
              link: article.link,
              source: article.source
            });
          }
        }
      });
    });

    // Convert map to a sorted array of trends
    const trends = Object.keys(trendMap)
      .map(kw => ({
        keyword: kw,
        articles: trendMap[kw],
        count: activityCount[kw],
        status: this.determineStatus(activityCount[kw])
      }))
      .sort((a, b) => b.count - a.count);

    return {
      trends,
      activityCount
    };
  }

  /**
   * Determines the buzz level based on occurrence count.
   */
  determineStatus(count) {
    if (count >= 4) return 'High Buzz';
    if (count >= 2) return 'Medium Buzz';
    return 'Low Buzz';
  }

  /**
   * Generates a simple marketing insight based on the keyword.
   */
  getInsight(keyword) {
    const insights = {
      'AI Agent': 'Industri bergeser dari chatbot statis ke AI Agent otonom. Cocok untuk konten perbandingan efisiensi.',
      'TikTok Ads': 'Algoritma TikTok semakin mengutamakan konten native. Buat konten yang tidak terlihat seperti iklan.',
      'Digital Marketing': 'Tren omni-channel sedang naik. Fokus pada integrasi pengalaman user di berbagai platform.',
      'Web3': 'Adopsi massal membutuhkan UX yang lebih simpel. Buat konten edukasi "Web3 untuk Pemula".',
      'Content Creator': 'Ekonomi kreator kini fokus pada komunitas kecil (niche) daripada massa luas.',
      'SEO': 'SGE (Search Generative Experience) mengubah cara orang mencari informasi. Optimasi untuk jawaban AI.',
      'AI': 'Efisiensi produksi konten meningkat. Fokus pada "Kurasi Manusia" untuk menjaga kualitas.',
      'Social Media': 'Video pendek masih mendominasi, namun durasi menengah mulai naik kembali.'
    };
    return insights[keyword] || 'Topik ini sedang naik daun. Analisis kompetitor dan buat konten yang menjawab masalah user.';
  }
}

module.exports = new TrendAnalyzer();
