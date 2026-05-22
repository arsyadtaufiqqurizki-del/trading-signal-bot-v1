'use strict';

const axios = require('axios');

/**
 * ContentGenerator uses OpenRouter AI to generate viral content scripts.
 * OpenRouter provides a stable, unified interface for multiple high-end AI models.
 */
class ContentGenerator {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = 'google/gemini-flash-1.5';
  }

  // ─── Internal: call OpenRouter with fallback ───────────────────────────────
  async _callAI(systemPrompt, userPrompt) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is missing in .env');
    }

    const modelsToTry = [
      'openai/gpt-oss-120b:free',
      'minimax/minimax-m2.5:free',
      'google/gemma-4-31b-it',
      'nousresearch/hermes-3-llama-3.1-405b:free'
    ];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[ContentGenerator] Attempting OpenRouter call to: ${modelName}`);

        const response = await axios.post(
          this.apiUrl,
          {
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt   }
            ],
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://gemini-cli.vercel.app',
              'X-Title': 'Gemini CLI Trend Bot'
            }
          }
        );

        const text = response.data.choices[0]?.message?.content;
        if (!text || !text.trim()) {
          console.log(`[ContentGenerator] Model ${modelName} returned empty content, skipping...`);
          lastError = 'empty response';
          continue;
        }
        return { text, model: modelName };

      } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[ContentGenerator] Model ${modelName} failed: ${errorMsg}`);
        lastError = errorMsg;
      }
    }

    throw new Error(`All OpenRouter models failed. Last error: ${lastError}`);
  }

  // ─── Helper: build trend context string ───────────────────────────────────
  getTrendContext(keyword) {
    try {
      const trendAnalyzer = require('./trend_analyzer');
      const cache = trendAnalyzer._cache;
      if (!cache) return null;

      // Cari keyword atau substring yang cocok di cache
      const lowerKw = keyword.toLowerCase();
      for (const [kw, count] of Object.entries(cache.activityCount)) {
        if (kw.toLowerCase().includes(lowerKw) || lowerKw.includes(kw.toLowerCase())) {
          if (count > 0) {
            const status = count >= 15 ? 'SANGAT VIRAL 🔥' : count >= 7 ? 'SEDANG TRENDING 📈' : 'MULAI NAIK ⬆️';
            return `Topik "${keyword}" sedang ${status} dengan ${count} artikel yang terdeteksi hari ini di Indonesia.`;
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  // ─── Helper: system prompt dasar ──────────────────────────────────────────
  _baseSystem() {
    return 'Kamu adalah seorang pakar Viral Content Strategist khusus pasar Indonesia (TikTok, Instagram Reels, YouTube Shorts, Twitter/X). Kamu menciptakan konten yang menghentikan scroll, memancing engagement, dan mendorong konversi. Gunakan Bahasa Indonesia yang modern, relatable, dan persuasif.';
  }

  // ─── 1. DEFAULT: 3 angle umum (backward-compatible) ──────────────────────
  async generateHooks(keyword) {
    const trendCtx = this.getTrendContext(keyword);
    const trendNote = trendCtx ? `\n\n📊 KONTEKS TREN AKTUAL: ${trendCtx} Manfaatkan momentum ini.` : '';

    const userPrompt = `Buat 3 content angle berbeda untuk keyword: "${keyword}".${trendNote}

INSTRUKSI PENTING:
1. JANGAN tulis kalimat pembuka seperti "Berikut skripnya..." atau "Tentu saja!".
2. JANGAN tambahkan catatan atau rangkuman di akhir.
3. Berikan HANYA script-nya saja.

Untuk setiap angle, gunakan format PERSIS ini:
🎯 Angle: [Nama Angle]
🪝 Hook: "[Kalimat pembuka yang powerful]"
💎 Value: [Isi konten / pesan utama]
📣 CTA: "[Call to action yang persuasif]"
--------------------------------------------

Persyaratan:
- Gabungkan bahasa profesional dan catchy dalam Bahasa Indonesia yang santai, modern, dan persuasif.
- Fokus pada psychological trigger: FOMO, Rasa Ingin Tahu, Pain Point.
- Hooks harus berani dan menarik perhatian.`;

    return this._callAI(this._baseSystem(), userPrompt);
  }

  // ─── 2. PLATFORM TARGETING ─────────────────────────────────────────────────
  async generateByPlatform(keyword, platform, trendCtx = null) {
    const trendNote = trendCtx ? `\n\n📊 KONTEKS TREN: ${trendCtx} Manfaatkan momentum ini dalam konten.` : '';

    const platformConfigs = {
      tiktok: {
        emoji: '🎵',
        label: 'TikTok',
        systemExtra: 'Spesialis TikTok content creator Indonesia. Kamu paham algoritma TikTok, hook 3 detik, trending sound, dan POV format.',
        prompt: `Buat 3 TikTok content script untuk keyword: "${keyword}".${trendNote}

Untuk setiap script, gunakan format ini:
🎵 TIKTOK SCRIPT #[N]
━━━━━━━━━━━━━━━━━━━━
⏱️ Hook (0–3 detik): "[Kalimat hook yang bikin penonton TIDAK bisa skip]"
🎬 Format: [POV / Duet / Stitch / Tutorial / Storytelling / Day in My Life]
📝 Script Narasi:
[Script lengkap dengan timing, misalnya: (0-3s) teks... (3-10s) teks... (10-30s) teks...]
🔊 Sound/Audio Suggestion: [Tipe musik atau trending sound yang cocok]
📣 CTA Akhir: "[CTA yang natural di TikTok]"
#️⃣ Hashtag: [5 hashtag relevan campuran niche + medium]
━━━━━━━━━━━━━━━━━━━━`
      },

      ig: {
        emoji: '📸',
        label: 'Instagram',
        systemExtra: 'Spesialis Instagram content creator Indonesia. Kamu ahli Reels, Carousel, dan Stories yang menghasilkan save & share tinggi.',
        prompt: `Buat 3 Instagram content script untuk keyword: "${keyword}".${trendNote}

Untuk setiap script, gunakan format ini:
📸 INSTAGRAM CONTENT #[N]
━━━━━━━━━━━━━━━━━━━━
🎬 Format: [Reels / Carousel / Single Post / Stories]
🖼️ Visual Description: [Deskripsi visual pembuka yang menarik]
🪝 Hook Reels (3 detik pertama): "[Hook kuat]"
📝 Caption Lengkap:
[Caption siap pakai dengan baris pendek, emoji strategis, dan spasi yang enak dibaca. Maksimal 10 baris]
#️⃣ Hashtag: [10 hashtag: 3 niche + 4 medium + 3 broad]
📊 Tip Engagement: [1 tips untuk boost engagement seperti pertanyaan, poll, dll]
━━━━━━━━━━━━━━━━━━━━`
      },

      yt: {
        emoji: '▶️',
        label: 'YouTube',
        systemExtra: 'Spesialis YouTube content creator Indonesia. Kamu ahli dalam judul clickbait etis, thumbnail concept, dan retention hook.',
        prompt: `Buat 3 YouTube content idea untuk keyword: "${keyword}".${trendNote}

Untuk setiap idea, gunakan format ini:
▶️ YOUTUBE CONTENT #[N]
━━━━━━━━━━━━━━━━━━━━
📌 Judul Video: "[Judul clickbait yang kuat — maks 60 karakter]"
🖼️ Thumbnail Concept: [Deskripsi visual thumbnail yang eye-catching: warna, teks overlay, ekspresi]
⏱️ Hook (15 detik pertama): "[Narasi hook pembuka yang membuat penonton tidak klik skip]"
📋 Outline Video:
  00:00 — Intro & Hook
  [Timestamp] — [Poin 1]
  [Timestamp] — [Poin 2]
  [Timestamp] — [Poin 3]
  [Timestamp] — Outro & CTA
📣 CTA Like & Subscribe: "[Kalimat CTA yang natural]"
🏷️ Tags SEO: [7 tag YouTube relevan]
━━━━━━━━━━━━━━━━━━━━`
      },

      thread: {
        emoji: '🧵',
        label: 'Twitter/X Thread',
        systemExtra: 'Spesialis Twitter/X Thread writer Indonesia. Kamu ahli membuat thread viral yang di-RT dan di-bookmark ribuan kali.',
        prompt: `Buat 1 viral Twitter/X Thread untuk keyword: "${keyword}".${trendNote}

Gunakan format ini:
🧵 VIRAL THREAD
━━━━━━━━━━━━━━━━━━━━
Tweet 1 (HOOK — bikin orang mau baca): 
"[Tweet pertama yang memancing rasa ingin tahu. Harus ada cliffhanger atau angka menarik]"

Tweet 2:
"[Isi — poin pertama yang mengejutkan atau bernilai tinggi]"

Tweet 3:
"[Isi — poin kedua, tambahkan data atau cerita]"

Tweet 4:
"[Isi — poin ketiga]"

Tweet 5:
"[Isi — poin keempat atau twist yang mengejutkan]"

Tweet 6:
"[Isi — kesimpulan atau insight besar]"

Tweet 7 (CTA):
"[Tweet penutup: minta RT, follow, atau klik link. Juga minta reply dengan pertanyaan menarik]"

📈 Engagement Tip: [Satu strategi boost thread ini]
━━━━━━━━━━━━━━━━━━━━`
      },

      email: {
        emoji: '📧',
        label: 'Email Marketing',
        systemExtra: 'Spesialis email marketing copywriter Indonesia. Kamu ahli subject line yang open rate tinggi dan body email yang mengkonversi.',
        prompt: `Buat 3 email marketing copy untuk keyword: "${keyword}".${trendNote}

Untuk setiap email, gunakan format ini:
📧 EMAIL MARKETING #[N]
━━━━━━━━━━━━━━━━━━━━
📌 Subject Line: "[Subject line yang membuat orang klik — maks 50 karakter]"
👁️ Preview Text: "[Teks preview singkat yang melengkapi subject — maks 90 karakter]"
👋 Salam Pembuka: [Pilihan salam yang personal dan hangat]
📝 Body Email:
[Body email 3–5 paragraf pendek yang mengalir, personal, dan mengarah ke konversi. Gunakan bahasa yang seperti menulis ke satu orang]
📣 CTA Button: "[Teks tombol CTA yang jelas dan action-oriented]"
💡 Strategi: [Satu insight mengapa email ini efektif]
━━━━━━━━━━━━━━━━━━━━`
      }
    };

    const cfg = platformConfigs[platform];
    if (!cfg) throw new Error(`Platform tidak dikenal: ${platform}`);

    const system = this._baseSystem() + ' ' + cfg.systemExtra;
    return this._callAI(system, cfg.prompt);
  }

  // ─── 3. MODE KONTEN SPESIFIK ───────────────────────────────────────────────
  async generateByMode(keyword, mode, trendCtx = null) {
    const trendNote = trendCtx ? `\n\n📊 KONTEKS TREN: ${trendCtx} Manfaatkan momentum ini.` : '';

    const modeConfigs = {
      hook: {
        emoji: '🪝',
        label: 'Power Hooks',
        prompt: `Buat 7 hook pembuka konten yang paling powerful untuk keyword: "${keyword}".${trendNote}

JANGAN tulis pengantar. Langsung berikan daftarnya.

Gunakan format ini:
🪝 POWER HOOKS — "${keyword}"
━━━━━━━━━━━━━━━━━━━━

Hook #1 · [Tipe: FOMO]
"[Hook]"

Hook #2 · [Tipe: Curiosity Gap]
"[Hook]"

Hook #3 · [Tipe: Pain Point]
"[Hook]"

Hook #4 · [Tipe: Shocking Fact]
"[Hook]"

Hook #5 · [Tipe: Social Proof]
"[Hook]"

Hook #6 · [Tipe: Question]
"[Hook]"

Hook #7 · [Tipe: Contrarian]
"[Hook]"
━━━━━━━━━━━━━━━━━━━━
💡 Tips: Hook terbaik untuk platform video adalah #[N] karena [alasan singkat].`
      },

      script: {
        emoji: '📝',
        label: 'Full Script',
        prompt: `Buat full narasi script konten video 45–60 detik untuk keyword: "${keyword}".${trendNote}

Gunakan format ini:
📝 FULL VIDEO SCRIPT
━━━━━━━━━━━━━━━━━━━━
🎯 Angle: [Nama pendekatan konten]
⏱️ Durasi Target: 45–60 detik

[00:00–00:05] HOOK:
"[Narasi hook pembuka]"
🎬 Visual: [Deskripsi visual/action yang dilakukan]

[00:05–00:20] PROBLEM / SETUP:
"[Narasi membangun masalah atau konteks]"
🎬 Visual: [Deskripsi]

[00:20–00:40] CORE VALUE / SOLUSI:
"[Narasi isi utama — nilai yang diberikan ke penonton]"
🎬 Visual: [Deskripsi]

[00:40–00:55] CLIMAX / INSIGHT:
"[Narasi insight besar atau twist]"
🎬 Visual: [Deskripsi]

[00:55–01:00] CTA:
"[Narasi call to action yang natural]"

📊 Total kata kira-kira: [N] kata
━━━━━━━━━━━━━━━━━━━━`
      },

      caption: {
        emoji: '✍️',
        label: 'Caption Ready',
        prompt: `Buat 3 caption siap pakai untuk konten sosial media tentang: "${keyword}".${trendNote}

JANGAN tulis pengantar. Langsung berikan captionnya.

Gunakan format ini untuk setiap caption:
✍️ CAPTION #[N] · [Tipe: Storytelling / Edukasi / Jualan / dll]
━━━━━━━━━━━━━━━━━━━━
[Caption lengkap siap pakai. Baris pendek (maks 7 kata per baris). Gunakan emoji yang relevan dan strategis. Akhiri dengan pertanyaan untuk engagement atau CTA yang kuat.]

#️⃣ [hashtag1] [hashtag2] [hashtag3] [hashtag4] [hashtag5] [hashtag6] [hashtag7] [hashtag8] [hashtag9] [hashtag10]
━━━━━━━━━━━━━━━━━━━━`
      },

      ideas: {
        emoji: '💡',
        label: '10 Ide Konten',
        prompt: `Generate 10 ide konten kreatif untuk topik: "${keyword}".${trendNote}

JANGAN tulis pengantar. Langsung berikan daftarnya.

Gunakan format ini:
💡 10 IDE KONTEN — "${keyword}"
━━━━━━━━━━━━━━━━━━━━

1. [Format: TikTok/IG/YT] "[Judul ide konten yang spesifik]"
   → [1 kalimat kenapa ide ini akan perform bagus]

2. [Format] "[Judul]"
   → [Alasan]

3. [Format] "[Judul]"
   → [Alasan]

4. [Format] "[Judul]"
   → [Alasan]

5. [Format] "[Judul]"
   → [Alasan]

6. [Format] "[Judul]"
   → [Alasan]

7. [Format] "[Judul]"
   → [Alasan]

8. [Format] "[Judul]"
   → [Alasan]

9. [Format] "[Judul]"
   → [Alasan]

10. [Format] "[Judul]"
    → [Alasan]
━━━━━━━━━━━━━━━━━━━━
🏆 Quick Win: Mulai dari ide #[N] karena paling mudah diproduksi dan berpotensi viral.`
      },

      viral: {
        emoji: '🔥',
        label: 'Formula Viral',
        prompt: `Analisis formula konten viral untuk topik: "${keyword}" dan berikan contoh implementasinya.${trendNote}

Gunakan format ini:
🔥 VIRAL CONTENT FORMULA — "${keyword}"
━━━━━━━━━━━━━━━━━━━━

📊 Analisis Potensi Viral:
• Target Audience: [Siapa yang paling likely share konten ini]
• Trigger Emosi Utama: [Emosi apa yang mendorong share — Kagum / Tertawa / Marah / Haru / dll]
• Format Terbaik: [TikTok Duet / Tutorial / POV / dll dan kenapa]
• Waktu Posting Optimal: [Hari dan jam berdasarkan algoritma Indonesia]

🧬 Formula Viral:
[Hook] → [Pattern Interrupt] → [Value Bomb] → [Twist/Surprise] → [CTA yang Natural]

💥 Contoh Implementasi:
🪝 Hook: "[Hook berdasarkan formula]"
📝 Script Singkat: "[Script 30 detik berdasarkan formula viral]"
🎬 Visual Cue: "[Deskripsi visual yang akan viral]"

📈 Prediksi Performa:
• Jika hook kuat: kemungkinan masuk FYP/Explore tinggi
• Engagement driver: [Apa yang akan bikin orang comment]
• Share trigger: [Apa yang bikin orang tag temannya]
━━━━━━━━━━━━━━━━━━━━`
      }
    };

    const cfg = modeConfigs[mode];
    if (!cfg) throw new Error(`Mode tidak dikenal: ${mode}`);

    return this._callAI(this._baseSystem(), cfg.prompt);
  }

  // ─── 4. TONE SELECTOR ──────────────────────────────────────────────────────
  async generateByTone(keyword, tone, trendCtx = null) {
    const trendNote = trendCtx ? `\n\n📊 KONTEKS TREN: ${trendCtx} Manfaatkan momentum ini.` : '';

    const toneConfigs = {
      formal: {
        emoji: '👔',
        label: 'Formal & Profesional',
        systemExtra: 'Kamu adalah copywriter B2B profesional Indonesia. Gaya bahasa formal, kredibel, data-driven, cocok untuk LinkedIn dan email korporat.',
        prompt: `Buat 3 konten profesional bertema: "${keyword}" untuk audiens bisnis.${trendNote}

Gunakan format ini:
👔 KONTEN FORMAL #[N]
━━━━━━━━━━━━━━━━━━━━
🎯 Platform: [LinkedIn / Email Newsletter / Presentasi]
📌 Judul/Headline: "[Headline yang otoritatif dan data-driven]"
📝 Konten:
[Paragraf profesional 3–4 baris. Gunakan data, insight industri, atau studi kasus. Hindari slang. Bahasa baku tapi tidak kaku.]
📣 CTA Profesional: "[CTA yang elegan dan tidak pushy]"
━━━━━━━━━━━━━━━━━━━━`
      },

      santai: {
        emoji: '😎',
        label: 'Santai & Gen Z',
        systemExtra: 'Kamu adalah content creator Gen Z Indonesia yang relatable dan viral. Gunakan bahasa gaul, slang kekinian, akrab, dan autentik.',
        prompt: `Buat 3 konten santai bertema: "${keyword}" untuk Gen Z Indonesia.${trendNote}

Gunakan format ini:
😎 KONTEN SANTAI #[N]
━━━━━━━━━━━━━━━━━━━━
🎯 Vibe: [Relatable / Lucu / Shocking / dll]
🪝 Opening: "[Pembuka yang super casual dan relatable — bisa pakai kata "guys", "bestie", "ngl", "literally", dll]"
📝 Konten:
[Isi konten santai, pendek-pendek, pakai bahasa Gen Z yang autentik. Boleh pakai humor, self-deprecating, atau twist yang tidak terduga.]
📣 CTA Casual: "[CTA yang terasa natural, bukan jualan]"
━━━━━━━━━━━━━━━━━━━━`
      },

      'hard-sell': {
        emoji: '💰',
        label: 'Hard Sell & Direct Response',
        systemExtra: 'Kamu adalah direct response copywriter terbaik Indonesia. Setiap kata diarahkan untuk konversi: klik, beli, daftar. Tidak basa-basi.',
        prompt: `Buat 3 copy hard-sell untuk produk/jasa bertema: "${keyword}".${trendNote}

Gunakan format ini:
💰 HARD SELL COPY #[N]
━━━━━━━━━━━━━━━━━━━━
🎯 Approach: [Fear of Missing Out / Social Proof / Scarcity / Benefit-First]
📣 Headline Killer: "[Headline yang langsung ke manfaat atau penawaran]"
📝 Body Copy:
[Copy langsung ke inti: masalah → solusi → bukti → urgensi. Singkat, padat, setiap kalimat mendorong pembaca ke action.]
⚡ Urgensi/Scarcity: "[Elemen urgency: limited time, limited stock, dll]"
🔘 CTA Button Text: "[Teks CTA yang jelas seperti: Dapatkan Sekarang / Claim Diskon / Daftar Gratis]"
━━━━━━━━━━━━━━━━━━━━`
      },

      story: {
        emoji: '📖',
        label: 'Storytelling',
        systemExtra: 'Kamu adalah storyteller konten Indonesia terbaik. Kamu membuat cerita yang emosional, personal, dan bikin audiens terhubung secara mendalam.',
        prompt: `Buat 3 konten format storytelling bertema: "${keyword}".${trendNote}

Gunakan format ini:
📖 STORYTELLING #[N]
━━━━━━━━━━━━━━━━━━━━
🎭 Story Arc: [Underdog / Transformation / Behind the Scene / Pengalaman Pribadi]
🪝 Opening Scene: "[Kalimat pembuka yang langsung masuk ke tengah cerita — bukan "Dulu aku..." tapi langsung ke momen]"
📝 Alur Cerita:
SETUP: [Situasi awal — perkenalkan karakter/masalah]
KONFLIK: [Titik kritis — masalah atau keputusan besar]
RESOLUSI: [Bagaimana masalah teratasi atau pelajaran didapat]
TAKEAWAY: [Insight yang bisa diambil pembaca/penonton]
📣 CTA Emosional: "[CTA yang mengajak audiens berbagi atau relate]"
━━━━━━━━━━━━━━━━━━━━`
      },

      edukasi: {
        emoji: '🎓',
        label: 'Edukatif & How-To',
        systemExtra: 'Kamu adalah content educator Indonesia terbaik. Kamu membuat konten edukasi yang mudah dipahami, terstruktur, dan memberikan nilai nyata.',
        prompt: `Buat 3 konten edukatif / how-to bertema: "${keyword}".${trendNote}

Gunakan format ini:
🎓 KONTEN EDUKASI #[N]
━━━━━━━━━━━━━━━━━━━━
📚 Format: [Tutorial Step-by-Step / Listicle / Explainer / Debunking Mitos]
📌 Judul: "[Judul yang jelas menyebut apa yang akan dipelajari]"
🪝 Hook Edukasi: "[Fakta mengejutkan atau pertanyaan yang bikin penasaran untuk membuka konten]"
📝 Isi Edukasi:
Poin 1: [Langkah atau informasi pertama — singkat dan jelas]
Poin 2: [Lanjutan]
Poin 3: [Lanjutan]
Poin 4: [Jika perlu]
✅ Kesimpulan: "[Ringkasan 1 kalimat + apa yang harus dilakukan setelah ini]"
📣 CTA Edukatif: "[Ajak save, share ke teman yang butuh, atau coba sekarang]"
━━━━━━━━━━━━━━━━━━━━`
      }
    };

    const cfg = toneConfigs[tone];
    if (!cfg) throw new Error(`Tone tidak dikenal: ${tone}`);

    const system = this._baseSystem() + ' ' + cfg.systemExtra;
    return this._callAI(system, cfg.prompt);
  }

  // ─── 5. CONTENT PACK LENGKAP ───────────────────────────────────────────────
  async generateContentPack(keyword, trendCtx = null) {
    const trendNote = trendCtx ? `\n📊 KONTEKS TREN AKTUAL: ${trendCtx}` : '';

    const system = this._baseSystem() + ' Kamu sekarang membuat Content Strategy Pack yang komprehensif — satu paket lengkap untuk satu keyword.';

    const userPrompt = `Buat CONTENT PACK lengkap untuk keyword: "${keyword}".${trendNote}

Gunakan format PERSIS ini (jangan tambah atau kurangi section):

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 SECTION 1 · TOP 3 HOOKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hook A (FOMO): "[Hook]"
Hook B (Curiosity): "[Hook]"
Hook C (Pain Point): "[Hook]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 SECTION 2 · FULL SCRIPT (45 detik)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Script narasi lengkap dengan timing singkat. Gunakan spasi antar baris untuk keterbacaan.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
#️⃣ SECTION 3 · HASHTAG SET
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Niche (5): [hashtag1] [hashtag2] [hashtag3] [hashtag4] [hashtag5]
Medium (4): [hashtag6] [hashtag7] [hashtag8] [hashtag9]
Broad (3): [hashtag10] [hashtag11] [hashtag12]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 SECTION 4 · BEST TIME TO POST
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Platform terbaik: [TikTok / IG / YT Shorts]
Hari terbaik: [Hari dalam seminggu]
Jam optimal: [Rentang jam WIB berdasarkan perilaku pengguna Indonesia]
Frekuensi ideal: [Berapa kali per minggu]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔊 SECTION 5 · AUDIO & VISUAL TIPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Audio/Sound: [Tipe musik atau mood audio yang cocok]
Visual Opening: [Deskripsi frame pertama yang eye-catching]
Text Overlay: [Teks yang perlu ditampilkan di layar]
Transisi: [Tipe transisi yang trending dan cocok]

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SECTION 6 · PREDIKSI PERFORMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Potensi viral: [Rendah / Sedang / Tinggi / Sangat Tinggi] — [alasan singkat]
Engagement driver: [Apa yang bikin orang comment]
Share trigger: [Apa yang bikin orang tag temannya]
Monetisasi angle: [Bagaimana topik ini bisa dimonetisasi]
━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    return this._callAI(system, userPrompt);
  }

  // ─── 6. COMPARE KEYWORDS ──────────────────────────────────────────────────
  async compareKeywords(kw1, kw2) {
    const system = this._baseSystem() + ' Kamu adalah content strategist yang ahli dalam keyword research dan analisis potensi konten.';

    const userPrompt = `Bandingkan potensi konten dari dua keyword berikut untuk pasar Indonesia:
Keyword A: "${kw1}"
Keyword B: "${kw2}"

Gunakan format ini PERSIS:

⚔️ KEYWORD BATTLE
━━━━━━━━━━━━━━━━━━━━
"${kw1}"  vs  "${kw2}"
━━━━━━━━━━━━━━━━━━━━

📊 PERBANDINGAN:

│ Kriteria          │ ${kw1.padEnd(14)} │ ${kw2.padEnd(14)} │
│ Potensi Viral     │ [Skor /10]       │ [Skor /10]       │
│ Target Audience   │ [Deskripsi]      │ [Deskripsi]      │
│ Platform Terbaik  │ [Platform]       │ [Platform]       │
│ Kompetisi Konten  │ [Rendah/Tinggi]  │ [Rendah/Tinggi]  │
│ Monetisasi        │ [Potensi]        │ [Potensi]        │
│ Trend Longevity   │ [Evergreen/Tren] │ [Evergreen/Tren] │

🏆 PEMENANG: "${kw1}" ATAU "${kw2}"?
[Nyatakan pemenang dengan jelas dan berikan 2–3 alasan konkret]

🪝 HOOK TERBAIK MASING-MASING:
• ${kw1}: "[Hook terbaik untuk keyword ini]"
• ${kw2}: "[Hook terbaik untuk keyword ini]"

💡 REKOMENDASI STRATEGI:
[Satu paragraf strategi: apakah sebaiknya fokus satu keyword, atau combine keduanya? Bagaimana caranya?]
━━━━━━━━━━━━━━━━━━━━`;

    return this._callAI(system, userPrompt);
  }
}

module.exports = new ContentGenerator();
