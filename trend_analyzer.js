'use strict';

/**
 * TrendAnalyzer analyzes Google News articles to find keyword frequency in Indonesia.
 */
class TrendAnalyzer {
  constructor() {
    // Updated watchlist for better relevance in the Indonesian market
    this.watchlist = ['AI Agent', 'Digital Marketing', 'Web3', 'Content Creator', 'TikTok Ads', 'Shopee', 'Tokopedia', 'AI', 'SEO', 'KOL', 'Affiliate'];
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

  determineStatus(count) {
    if (count >= 15) return 'Sangat Viral';
    if (count >= 7) return 'Sedang Tren';
    return 'Mulai Naik';
  }

  /**
   * Generates marketing insights specific to the Indonesian market.
   */
  getInsight(keyword) {
    const insights = {
      'AI Agent': 'Pasar Indonesia mulai melirik AI untuk CS otomatis. Fokus pada konten "Cara AI bantu UMKM".',
      'TikTok Ads': 'TikTok Shop & Affiliate sangat kuat di ID. Buat konten optimasi konversi via Live Streaming.',
      'Digital Marketing': 'Trend "Local Pride" sedang kuat. Integrasikan strategi marketing dengan nilai lokal.',
      'Web3': 'Kripto masih populer di ID. Fokus pada edukasi keamanan aset dan utilitas nyata Web3.',
      'Content Creator': 'Era "Nano-Influencer" lebih dipercaya di Indonesia. Saran: Kolaborasi dengan banyak kreator kecil.',
      'SEO': 'Pencarian lokal (Local SEO) sangat penting untuk bisnis fisik di ID. Optimasi Google Maps/My Business.',
      'AI': 'Adopsi AI untuk produktivitas kerja sedang meledak di kota besar. Buat tips "Kerja Cepat pakai AI".',
      'Social Media': 'Interaksi di kolom komentar sangat tinggi di ID. Fokus pada strategi "Engagement First".',
      'Shopee': 'Optimasi promo tanggal kembar (Double Day) adalah wajib untuk peningkatan sales di Indonesia.',
      'Tokopedia': 'Fokus pada segmentasi pengguna yang mencari kualitas dan kepercayaan brand.',
      'KOL': 'Pemilihan KOL yang memiliki persona "Relatable" lebih efektif daripada yang sekadar mewah.',
      'Affiliate': 'Program affiliate berbasis komisi rendah namun volume tinggi sangat efektif untuk market ID.'
    };
    return insights[keyword] || 'Topik ini sedang naik daun di Indonesia. Analisis kompetitor lokal dan buat konten yang relevan.';
  }
}

module.exports = new TrendAnalyzer();
