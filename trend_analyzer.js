'use strict';

const axios = require('axios');

class TrendAnalyzer {
  constructor() {
    this.categories = {
      marketing: ['Digital Marketing', 'TikTok Ads', 'SEO', 'KOL', 'Affiliate', 'Content Creator'],
      ai:        ['AI Agent', 'AI', 'ChatGPT', 'Gemini'],
      ecommerce: ['Shopee', 'Tokopedia', 'Lazada'],
      social:    ['TikTok', 'Instagram', 'Threads', 'LinkedIn', 'YouTube'],
      tools:     ['Canva', 'Notion', 'Web3'],
    };

    this.watchlist = [...new Set(Object.values(this.categories).flat())];

    // In-memory velocity cache (Cloud Run: stateless, resets on cold start)
    this._cache = null;
  }

  getKeywordsByCategory(category) {
    if (!category) return this.watchlist;
    return this.categories[category.toLowerCase()] || this.watchlist;
  }

  /**
   * Calculate a Trend Score (0–100) for a keyword.
   * Weighted: article count 40%, velocity 30%, avg recency 30%.
   */
  calculateTrendScore(count, velocity, avgRecency = 0.5) {
    // Normalize count (cap at 30 for full score)
    const countScore   = Math.min(count / 30, 1) * 40;

    // Normalize velocity (cap at +10 for full score; negative = penalty)
    const velRaw       = velocity !== null ? velocity : 0;
    const velNorm      = Math.max(-1, Math.min(velRaw / 10, 1));
    const velScore     = ((velNorm + 1) / 2) * 30; // map [-1,1] → [0,30]

    // Recency (0–1 from SocialScanner)
    const recencyScore = (avgRecency || 0.5) * 30;

    return Math.round(countScore + velScore + recencyScore);
  }

  /**
   * Render a visual progress bar for the Trend Score.
   * e.g. score=75 → "███████░░░"
   */
  renderScoreBar(score) {
    const filled = Math.round(score / 10);
    const empty  = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Status label based on score.
   */
  scoreStatus(score) {
    if (score >= 70) return { label: 'VIRAL 🔥',    emoji: '🔥' };
    if (score >= 45) return { label: 'TRENDING 📈',  emoji: '📈' };
    if (score >= 20) return { label: 'NAIK 📡',      emoji: '📡' };
    return           { label: 'PANTAU 👀',           emoji: '👀' };
  }

  /**
   * Generate 5 relevant hashtags for a keyword (Indonesia-focused).
   */
  generateHashtags(keyword, articles = []) {
    const base = keyword.replace(/\s+/g, '').toLowerCase();
    const kwCamel = keyword.replace(/\s+(.)/g, (_, c) => c.toUpperCase());

    // Extract notable words from article titles for extra context tags
    const titleWords = articles
      .flatMap(a => (a.title || '').split(/\s+/))
      .map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase())
      .filter(w => w.length > 4 && !['yang', 'untuk', 'dengan', 'dari', 'akan', 'dalam', 'pada', 'juga', 'lebih', 'sudah'].includes(w));

    const freq = {};
    titleWords.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    const topWords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([w]) => w);

    const tags = [
      `#${base}`,
      `#${base}indonesia`,
      `#${kwCamel}`,
      ...topWords.map(w => `#${w}`),
      '#digitalmarketing',
      '#kontenindonesia',
      '#trending',
    ];

    // Unique + max 5
    return [...new Set(tags)].slice(0, 5);
  }

  /**
   * Main analysis: scan articles, calculate scores, velocity, hashtags.
   */
  analyze(articles, category) {
    const keywords    = this.getKeywordsByCategory(category);
    const trendMap    = {};
    const activityCount = {};
    const recencyMap  = {};   // keyword → sum of recency scores
    const recencyCount = {};  // keyword → number of articles with recency

    keywords.forEach(kw => {
      activityCount[kw] = 0;
      recencyMap[kw]    = 0;
      recencyCount[kw]  = 0;
    });

    articles.forEach(article => {
      const textToScan = `${article.title} ${article.content}`.toLowerCase();
      keywords.forEach(kw => {
        if (textToScan.includes(kw.toLowerCase())) {
          activityCount[kw]++;
          recencyMap[kw]   += (article.recencyScore || 0.5);
          recencyCount[kw]++;
          if (!trendMap[kw]) trendMap[kw] = [];
          if (trendMap[kw].length < 3) {
            trendMap[kw].push({
              title:    article.title,
              link:     article.link,
              source:   article.source,
              pubDate:  article.pubDate,
            });
          }
        }
      });
    });

    // Velocity: compare with previous cache
    const prevCount = this._cache ? this._cache.activityCount : null;
    const velocity  = {};
    keywords.forEach(kw => {
      velocity[kw] = (prevCount && prevCount[kw] !== undefined)
        ? activityCount[kw] - prevCount[kw]
        : null;
    });

    // Save new cache
    this._cache = { timestamp: Date.now(), activityCount: { ...activityCount } };

    const trends = Object.keys(trendMap)
      .map(kw => {
        const avgRecency = recencyCount[kw] > 0
          ? recencyMap[kw] / recencyCount[kw]
          : 0.5;
        const score = this.calculateTrendScore(activityCount[kw], velocity[kw], avgRecency);
        const { label: statusLabel, emoji: statusEmoji } = this.scoreStatus(score);
        const hashtags = this.generateHashtags(kw, trendMap[kw]);

        return {
          keyword:    kw,
          articles:   trendMap[kw],
          count:      activityCount[kw],
          status:     this._legacyStatus(activityCount[kw]),  // kept for compat
          statusLabel,
          statusEmoji,
          velocity:   velocity[kw],
          score,
          avgRecency,
          hashtags,
        };
      })
      .sort((a, b) => b.score - a.score);

    return { trends, activityCount };
  }

  /** Legacy status string (kept for backward compatibility) */
  _legacyStatus(count) {
    if (count >= 15) return 'Sangat Viral';
    if (count >= 7)  return 'Sedang Tren';
    return 'Mulai Naik';
  }

  /**
   * Get only "hot" trends — keywords with positive velocity (actively rising).
   */
  getHotTrends(trends) {
    return trends.filter(t => t.velocity !== null && t.velocity > 0)
                 .sort((a, b) => b.velocity - a.velocity);
  }

  /**
   * AI-powered dynamic insight via OpenRouter (async).
   * Falls back to static insight if AI is unavailable.
   */
  async getAIInsight(keyword, articles = []) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || articles.length === 0) {
      return this.getStaticInsight(keyword);
    }

    const headlines = articles.slice(0, 4).map(a => `• ${a.title}`).join('\n');
    const prompt =
      `Kamu adalah analis tren digital Indonesia. Berdasarkan berita terbaru berikut tentang "${keyword}":\n` +
      `${headlines}\n\n` +
      `Tulis 1 paragraf analisis singkat (maksimal 2 kalimat, bahasa Indonesia profesional) ` +
      `tentang mengapa topik ini sedang trending dan apa implikasinya bagi kreator konten atau pemasar digital. ` +
      `Jangan tambahkan pembuka/penutup, langsung ke isi analisis.`;

    const modelsToTry = [
      'google/gemma-4-31b-it',
      'nousresearch/hermes-3-llama-3.1-405b:free',
      'minimax/minimax-m2.5:free',
    ];

    for (const model of modelsToTry) {
      try {
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4,
            max_tokens: 180,
          },
          {
            headers: {
              'Authorization':  `Bearer ${apiKey}`,
              'Content-Type':   'application/json',
              'HTTP-Referer':   'https://gemini-cli.vercel.app',
              'X-Title':        'Trend Intel Bot',
            },
            timeout: 15000,
          }
        );
        const text = response.data?.choices?.[0]?.message?.content;
        if (text && text.trim().length > 20) return text.trim();
      } catch (e) {
        console.error(`[TrendAnalyzer] AI insight model ${model} failed:`, e.message);
      }
    }

    // Fallback to static
    return this.getStaticInsight(keyword);
  }

  /** Static fallback insights (preserved from original) */
  getStaticInsight(keyword) {
    const insights = {
      'AI Agent':          'Pasar Indonesia mencatat lonjakan minat terhadap otomasi layanan berbasis AI, khususnya di segmen UMKM dan customer service. Permintaan solusi percakapan otomatis meningkat signifikan di kota-kota tier 1 dan 2.',
      'TikTok Ads':        'TikTok Shop mendominasi ekosistem social commerce Indonesia dengan pertumbuhan volume transaksi yang konsisten. Live Shopping dan program afiliasi menjadi kanal konversi dengan ROI tertinggi di segmen usia 18–35 tahun.',
      'Digital Marketing': 'Strategi pemasaran berbasis identitas lokal menunjukkan tingkat keterlibatan yang lebih tinggi dibandingkan pendekatan global. Merek yang mengintegrasikan narasi budaya Indonesia mencatat peningkatan kepercayaan konsumen.',
      'Web3':              'Diskursus aset kripto di Indonesia tetap tinggi, meski pergeseran fokus dari spekulasi ke utilitas nyata mulai terlihat. Edukasi terkait keamanan aset digital menjadi kebutuhan utama audiens segmen pemula.',
      'Content Creator':   'Nano dan micro-influencer dengan basis komunitas niche menunjukkan tingkat konversi yang lebih unggul dibandingkan kreator besar. Otentisitas konten menjadi faktor penentu utama kepercayaan audiens Indonesia.',
      'SEO':               'Pencarian berbasis lokasi (Local SEO) mengalami peningkatan permintaan seiring dengan pertumbuhan bisnis fisik pasca-pandemi. Optimasi profil Google Business menjadi prioritas strategi visibilitas digital UMKM.',
      'AI':                'Adopsi kecerdasan buatan untuk peningkatan produktivitas kerja mencatat akselerasi di kalangan profesional urban Indonesia. Segmen pendidikan dan keuangan menjadi sektor dengan tingkat adopsi tertinggi.',
      'ChatGPT':           'Penetrasi ChatGPT di kalangan pelajar dan tenaga kerja muda Indonesia tergolong tinggi secara regional. Penggunaan didominasi untuk pembuatan konten, penelitian awal, dan produktivitas harian.',
      'Gemini':            'Google Gemini mulai membangun posisi kompetitif di pasar Indonesia, didukung integrasi ekosistem Google yang sudah mapan. Komparasi performa antar platform AI generatif menjadi konten dengan engagement tinggi.',
      'Shopee':            'Promo berbasis tanggal kembar (Double Day) tetap menjadi pendorong volume penjualan terbesar di platform Shopee Indonesia. Data menunjukkan lonjakan transaksi hingga 3x lipat pada periode kampanye.',
      'Tokopedia':         'Segmen pengguna Tokopedia yang mengutamakan kualitas dan kepercayaan brand menunjukkan nilai transaksi rata-rata lebih tinggi. Program loyalty dan ulasan terverifikasi menjadi faktor diferensiasi utama.',
      'Lazada':            'Lazada mempertahankan relevansinya melalui program voucher dan cashback yang menyasar segmen konsumen sensitif harga. Kategori elektronik dan fashion masih menjadi penggerak utama transaksi.',
      'KOL':               'Riset pasar menunjukkan bahwa KOL dengan persona "relatable" dan kedekatan komunitas menghasilkan tingkat konversi lebih tinggi dibandingkan selebriti. Keaslian narasi menjadi kriteria seleksi utama brand lokal.',
      'Affiliate':         'Model afiliasi bervolume tinggi dengan komisi kompetitif terbukti efektif di pasar Indonesia yang price-conscious. Platform marketplace mendominasi sebagai mitra program afiliasi terpilih.',
      'TikTok':            'Algoritma TikTok Indonesia masih memberikan distribusi organik yang signifikan bagi konten berdurasi 15–30 detik. Tingkat keterlibatan pada platform ini tercatat sebagai yang tertinggi di antara platform media sosial utama.',
      'Instagram':         'Instagram Reels mempertahankan posisinya sebagai format konten dengan jangkauan terluas di platform. Fitur Stories dengan tautan langsung efektif sebagai jembatan antara konten dan konversi.',
      'Threads':           'Threads menunjukkan pertumbuhan basis pengguna aktif di Indonesia dengan kurva adopsi yang stabil. Peluang early mover masih terbuka bagi merek yang konsisten dalam strategi konten berbasis percakapan.',
      'LinkedIn':          'Segmen profesional dan pelaku bisnis Indonesia semakin aktif di LinkedIn sebagai platform thought leadership. Konten narasi di balik operasional bisnis mencatat tingkat resonansi tinggi pada demografis ini.',
      'YouTube':           'Konten tutorial dan edukasi format panjang mempertahankan posisi dominan di YouTube Indonesia. YouTube Shorts mulai merebut segmen yang sebelumnya dikuasai TikTok, khususnya pada kategori hiburan.',
      'Canva':             'Canva mencatat penetrasi yang sangat tinggi di segmen UMKM dan kreator konten independen Indonesia. Konten bertema panduan fitur baru dan template tematik secara konsisten menghasilkan keterlibatan tinggi.',
      'Notion':            'Notion diadopsi secara luas oleh komunitas startup dan pelajar Indonesia sebagai alat manajemen kerja dan studi. Konten berbasis template Notion pada platform TikTok edukasi mencatat tren viral yang berulang.',
    };
    return insights[keyword] || 'Topik ini mencatat peningkatan volume pemberitaan di Indonesia. Analisis kompetitor dan tren konten lokal disarankan sebagai langkah awal.';
  }

  /** Alias for backward compatibility */
  getInsight(keyword) {
    return this.getStaticInsight(keyword);
  }

  /** Context string used by content_generator for /create */
  getTrendContext(keyword) {
    const cached = this._cache;
    if (!cached) return null;
    const count = cached.activityCount[keyword];
    if (!count || count < 3) return null;
    return `${keyword} sedang trending dengan ${count} artikel terbaru di Indonesia.`;
  }
}

module.exports = new TrendAnalyzer();
