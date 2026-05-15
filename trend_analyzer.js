'use strict';

class TrendAnalyzer {
  constructor() {
    this.categories = {
      marketing: ['Digital Marketing', 'TikTok Ads', 'SEO', 'KOL', 'Affiliate', 'Content Creator'],
      ai: ['AI Agent', 'AI', 'ChatGPT', 'Gemini'],
      ecommerce: ['Shopee', 'Tokopedia', 'Lazada'],
      social: ['TikTok', 'Instagram', 'Threads', 'LinkedIn', 'YouTube'],
      tools: ['Canva', 'Notion', 'Web3']
    };

    this.watchlist = [...new Set(Object.values(this.categories).flat())];

    // Cache: { timestamp, activityCount }
    this._cache = null;
  }

  getKeywordsByCategory(category) {
    if (!category) return this.watchlist;
    return this.categories[category.toLowerCase()] || this.watchlist;
  }

  analyze(articles, category) {
    const keywords = this.getKeywordsByCategory(category);
    const trendMap = {};
    const activityCount = {};

    keywords.forEach(kw => activityCount[kw] = 0);

    articles.forEach(article => {
      const textToScan = `${article.title} ${article.content}`.toLowerCase();
      keywords.forEach(kw => {
        if (textToScan.includes(kw.toLowerCase())) {
          activityCount[kw]++;
          if (!trendMap[kw]) trendMap[kw] = [];
          if (trendMap[kw].length < 3) {
            trendMap[kw].push({
              title: article.title,
              link: article.link,
              source: article.source,
              pubDate: article.pubDate
            });
          }
        }
      });
    });

    // Velocity: compare with previous cache
    const prevCount = this._cache ? this._cache.activityCount : null;
    const velocity = {};
    keywords.forEach(kw => {
      if (prevCount && prevCount[kw] !== undefined) {
        const delta = activityCount[kw] - prevCount[kw];
        velocity[kw] = delta;
      } else {
        velocity[kw] = null; // no previous data
      }
    });

    // Save new cache
    this._cache = { timestamp: Date.now(), activityCount: { ...activityCount } };

    const trends = Object.keys(trendMap)
      .map(kw => ({
        keyword: kw,
        articles: trendMap[kw],
        count: activityCount[kw],
        status: this.determineStatus(activityCount[kw]),
        velocity: velocity[kw]
      }))
      .sort((a, b) => b.count - a.count);

    return { trends, activityCount };
  }

  determineStatus(count) {
    if (count >= 15) return 'Sangat Viral';
    if (count >= 7) return 'Sedang Tren';
    return 'Mulai Naik';
  }

  getInsight(keyword) {
    const insights = {
      'AI Agent': 'Pasar Indonesia mencatat lonjakan minat terhadap otomasi layanan berbasis AI, khususnya di segmen UMKM dan customer service. Permintaan solusi percakapan otomatis meningkat signifikan di kota-kota tier 1 dan 2.',
      'TikTok Ads': 'TikTok Shop mendominasi ekosistem social commerce Indonesia dengan pertumbuhan volume transaksi yang konsisten. Live Shopping dan program afiliasi menjadi kanal konversi dengan ROI tertinggi di segmen usia 18–35 tahun.',
      'Digital Marketing': 'Strategi pemasaran berbasis identitas lokal menunjukkan tingkat keterlibatan yang lebih tinggi dibandingkan pendekatan global. Merek yang mengintegrasikan narasi budaya Indonesia mencatat peningkatan kepercayaan konsumen.',
      'Web3': 'Diskursus aset kripto di Indonesia tetap tinggi, meski pergeseran fokus dari spekulasi ke utilitas nyata mulai terlihat. Edukasi terkait keamanan aset digital menjadi kebutuhan utama audiens segmen pemula.',
      'Content Creator': 'Nano dan micro-influencer dengan basis komunitas niche menunjukkan tingkat konversi yang lebih unggul dibandingkan kreator besar. Otentisitas konten menjadi faktor penentu utama kepercayaan audiens Indonesia.',
      'SEO': 'Pencarian berbasis lokasi (Local SEO) mengalami peningkatan permintaan seiring dengan pertumbuhan bisnis fisik pasca-pandemi. Optimasi profil Google Business menjadi prioritas strategi visibilitas digital UMKM.',
      'AI': 'Adopsi kecerdasan buatan untuk peningkatan produktivitas kerja mencatat akselerasi di kalangan profesional urban Indonesia. Segmen pendidikan dan keuangan menjadi sektor dengan tingkat adopsi tertinggi.',
      'ChatGPT': 'Penetrasi ChatGPT di kalangan pelajar dan tenaga kerja muda Indonesia tergolong tinggi secara regional. Penggunaan didominasi untuk pembuatan konten, penelitian awal, dan produktivitas harian.',
      'Gemini': 'Google Gemini mulai membangun posisi kompetitif di pasar Indonesia, didukung integrasi ekosistem Google yang sudah mapan. Komparasi performa antar platform AI generatif menjadi konten dengan engagement tinggi.',
      'Shopee': 'Promo berbasis tanggal kembar (Double Day) tetap menjadi pendorong volume penjualan terbesar di platform Shopee Indonesia. Data menunjukkan lonjakan transaksi hingga 3x lipat pada periode kampanye.',
      'Tokopedia': 'Segmen pengguna Tokopedia yang mengutamakan kualitas dan kepercayaan brand menunjukkan nilai transaksi rata-rata lebih tinggi. Program loyalty dan ulasan terverifikasi menjadi faktor diferensiasi utama.',
      'Lazada': 'Lazada mempertahankan relevansinya melalui program voucher dan cashback yang menyasar segmen konsumen sensitif harga. Kategori elektronik dan fashion masih menjadi penggerak utama transaksi.',
      'KOL': 'Riset pasar menunjukkan bahwa KOL dengan persona "relatable" dan kedekatan komunitas menghasilkan tingkat konversi lebih tinggi dibandingkan selebriti. Keaslian narasi menjadi kriteria seleksi utama brand lokal.',
      'Affiliate': 'Model afiliasi bervolume tinggi dengan komisi kompetitif terbukti efektif di pasar Indonesia yang price-conscious. Platform marketplace mendominasi sebagai mitra program afiliasi terpilih.',
      'TikTok': 'Algoritma TikTok Indonesia masih memberikan distribusi organik yang signifikan bagi konten berdurasi 15–30 detik. Tingkat keterlibatan pada platform ini tercatat sebagai yang tertinggi di antara platform media sosial utama.',
      'Instagram': 'Instagram Reels mempertahankan posisinya sebagai format konten dengan jangkauan terluas di platform. Fitur Stories dengan tautan langsung efektif sebagai jembatan antara konten dan konversi.',
      'Threads': 'Threads menunjukkan pertumbuhan basis pengguna aktif di Indonesia dengan kurva adopsi yang stabil. Peluang early mover masih terbuka bagi merek yang konsisten dalam strategi konten berbasis percakapan.',
      'LinkedIn': 'Segmen profesional dan pelaku bisnis Indonesia semakin aktif di LinkedIn sebagai platform thought leadership. Konten narasi di balik operasional bisnis mencatat tingkat resonansi tinggi pada demografis ini.',
      'YouTube': 'Konten tutorial dan edukasi format panjang mempertahankan posisi dominan di YouTube Indonesia. YouTube Shorts mulai merebut segmen yang sebelumnya dikuasai TikTok, khususnya pada kategori hiburan.',
      'Canva': 'Canva mencatat penetrasi yang sangat tinggi di segmen UMKM dan kreator konten independen Indonesia. Konten bertema panduan fitur baru dan template tematik secara konsisten menghasilkan keterlibatan tinggi.',
      'Notion': 'Notion diadopsi secara luas oleh komunitas startup dan pelajar Indonesia sebagai alat manajemen kerja dan studi. Konten berbasis template Notion pada platform TikTok edukasi mencatat tren viral yang berulang.'
    };
    return insights[keyword] || 'Topik ini mencatat peningkatan volume pemberitaan di Indonesia. Analisis kompetitor dan tren konten lokal disarankan sebagai langkah awal.';
  }
}

module.exports = new TrendAnalyzer();
