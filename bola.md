# ⚽ BOLA.MD — Plan Fitur `/bola` (Piala Dunia 2026)

> Dokumen ini berisi rencana implementasi lengkap fitur `/bola` untuk prediksi pertandingan sepak bola,
> dimulai dari Piala Dunia FIFA 2026 (berlangsung Juni–Juli 2026 di USA/Canada/Mexico).
> Dibuat: 15 Juni 2026

---

## 🎯 TUJUAN

Menambahkan modul `/bola` yang mampu:
1. Menampilkan jadwal & hasil pertandingan Piala Dunia 2026 hari ini
2. Memberikan prediksi AI untuk pertandingan mendatang
3. Menampilkan klasemen grup terkini
4. Analisis head-to-head & form tim

---

## 📂 FILE YANG AKAN DIBUAT / DIMODIFIKASI

| File | Aksi | Keterangan |
|---|---|---|
| `bola.js` | **BUAT BARU** | Module utama — semua logic `/bola` |
| `api/webhook.js` | **MODIFIKASI** | Tambah handler `/bola` di if/else chain |
| `instruction.md` | **MODIFIKASI** | Update command registry & file index |

---

## 🔌 DATA SOURCE (FREE APIS)

### Opsi 1 — Football-Data.org (UTAMA)
```
Base URL : https://api.football-data.org/v4
Auth     : Header X-Auth-Token (free tier, 10 req/min)
Coverage : Piala Dunia 2026 (competition: WC)
Endpoints:
  GET /competitions/WC/matches          → jadwal & hasil semua match
  GET /competitions/WC/matches?matchday=N → match per matchday
  GET /competitions/WC/standings        → klasemen grup
  GET /competitions/WC/teams            → info tim
  GET /matches?ids=X                    → detail satu match
```
**Free tier:** 10 request/menit, data real-time
**API Key:** Butuh daftar di football-data.org (gratis)

### Opsi 2 — TheSportsDB (FALLBACK)
```
Base URL : https://www.thesportsdb.com/api/v1/json/3
Auth     : None (public, free)
Coverage : Event & team info (tidak selengkap football-data)
Endpoints:
  /searchevents.php?e=FIFA+World+Cup
  /lookupevent.php?id=<eventId>
  /lookupteam.php?id=<teamId>
```
**Kelebihan:** Zero auth, fallback kalau football-data habis quota

### Opsi 3 — OpenLigaDB (FALLBACK)
```
Base URL : https://api.openligadb.de
Auth     : None
Note     : Lebih ke liga Eropa, bisa fallback kalau WC tidak tersedia
```

### AI Prediction Engine — OpenRouter (SUDAH ADA)
```
Provider : OpenRouter (sudah ada di codebase — process.env.OPENROUTER_API_KEY)
Model    : openai/gpt-4o-mini atau mistralai/mixtral-8x7b (cost-efficient)
Input    : Form tim, head-to-head, statistik, kondisi terkini
Output   : Prediksi skor + analisis faktor penentu + odds estimasi
```

---

## ⚡ SUBCOMMANDS

```
/bola                    → Jadwal + hasil hari ini (default)
/bola jadwal             → Semua pertandingan mendatang (next 7 hari)
/bola hasil              → Hasil pertandingan terbaru (last 3)
/bola grup               → Klasemen semua grup
/bola prediksi           → Prediksi AI untuk match hari ini / besok
/bola prediksi ARG BRA   → Prediksi AI custom (nama tim bebas)
/bola h2h ARG BRA        → Head-to-head history kedua tim
```

---

## 🏗️ ARSITEKTUR MODULE `bola.js`

```javascript
// bola.js — struktur internal

// === CACHE ===
const _store = new Map();
async function cached(key, ttlMs, fn) { ... }  // pola dari instruction.md

// === CONSTANTS ===
const BASE_URL = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';
const REQ = {
  timeout: 12000,
  headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN }
};

// === FETCHERS ===
async function fetchTodayMatches()      // GET /competitions/WC/matches?dateFrom=today&dateTo=today
async function fetchUpcomingMatches()   // GET /competitions/WC/matches?status=SCHEDULED
async function fetchRecentResults()     // GET /competitions/WC/matches?status=FINISHED
async function fetchStandings()         // GET /competitions/WC/standings
async function fetchH2H(team1, team2)   // dari data matches + filter manual

// === AI PREDICTION ===
async function generatePrediction(match, h2hData)
  // Kirim ke OpenRouter dengan context:
  // - Form 5 pertandingan terakhir tiap tim
  // - Pertemuan head-to-head (H2H)
  // - Fase turnamen (grup/16 besar/dst)
  // - Faktor umum (kebugaran, tekanan, dll)

// === FORMATTERS (HTML, Bahasa Indonesia) ===
function formatTodayReport(matches)
function formatJadwalReport(matches)
function formatHasilReport(matches)
function formatGrupReport(standings)
function formatPrediksiReport(predictions)
function formatH2HReport(team1, team2, matches)

// === EXPORTS ===
module.exports = {
  runBola,            // /bola (default — hari ini)
  runBolaJadwal,      // /bola jadwal
  runBolaHasil,       // /bola hasil
  runBolaGrup,        // /bola grup
  runBolaPrediksi,    // /bola prediksi [TIM1 TIM2]
  runBolaH2H,         // /bola h2h TIM1 TIM2
};
```

---

## 📊 FORMAT OUTPUT (CONTOH)

### `/bola` — Jadwal & Hasil Hari Ini
```
⚽ PIALA DUNIA 2026 — Hari Ini (16 Juni 2026)
━━━━━━━━━━━━━━━━━━━━━━━━

🟢 BERLANGSUNG
🏟️ Grup A · Matchday 2
🇧🇷 Brasil vs 🇦🇷 Argentina  3' (live)
📊 0 - 0

━━━━━━━━━━━━━━━━━━━━━━━━
⏳ JADWAL SELANJUTNYA
🕐 21:00 WIB · Grup B · Matchday 1
🇫🇷 Perancis vs 🇩🇪 Jerman

🕐 23:00 WIB · Grup C · Matchday 1
🇪🇸 Spanyol vs 🇵🇹 Portugal

━━━━━━━━━━━━━━━━━━━━━━━━
✅ HASIL TADI
🏆 Grup D · Matchday 1
🇯🇵 Jepang 2 - 1 🇲🇽 Meksiko
⏱️ FT · 90'

Ketik /bola prediksi untuk analisis AI
Ketik /bola grup untuk klasemen lengkap
```

### `/bola prediksi` — Prediksi AI
```
🤖 PREDIKSI AI · Piala Dunia 2026
━━━━━━━━━━━━━━━━━━━━━━━━

🆚 Perancis vs Jerman
📅 Rabu, 17 Juni 2026 · 21:00 WIB
🏟️ Grup B · Matchday 1 · SoFi Stadium, LA

━━━━━━━━━━━━━━━━━━━━━━━━
🔵 PERANCIS
Form: ✅✅✅✅✅ (5W-0D-0L terakhir)
Kekuatan: Mbappe, Griezmann, lini depan tajam
Kelemahan: Cedera Varane, lini tengah rentan

🔴 JERMAN
Form: ✅✅✅❌✅ (4W-0D-1L terakhir)
Kekuatan: Pressing tinggi, Havertz
Kelemahan: Kiper belum mantap

━━━━━━━━━━━━━━━━━━━━━━━━
📊 HEAD-TO-HEAD (5 Terakhir)
🇫🇷 3 Menang | Seri 1 | 🇩🇪 1 Menang
Rata-rata gol: 2.4 per laga

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PREDIKSI AI
Skor: Perancis 2 - 1 Jerman
Kepercayaan: ████████░░ 78%
Pencetak gol: Mbappe, Griezmann

📌 Faktor penentu:
• Perancis unggul 3-1 H2H terbaru
• Mbappe dalam performa puncak
• Jerman lebih rawan serangan balik

⚽ Over 2.5 Goals: 70% kemungkinan
🟨 Kartu Merah: Risiko rendah

⚠️ Disclaimer: Prediksi AI berbasis data historis,
bukan jaminan hasil. Gunakan sebagai referensi saja.
```

### `/bola grup` — Klasemen Grup
```
📋 KLASEMEN PIALA DUNIA 2026
━━━━━━━━━━━━━━━━━━━━━━━━

🅰️ GRUP A
# Tim           M  W  D  L  GF GA  Pts
1 🇧🇷 Brasil     2  2  0  0   5  1   6
2 🇸🇦 Arab Saudi 2  1  0  1   2  3   3
3 🇲🇽 Meksiko    2  1  0  1   3  4   3
4 🇵🇱 Polandia   2  0  0  2   1  3   0

🅱️ GRUP B
# Tim           M  W  D  L  GF GA  Pts
1 🇫🇷 Perancis   1  0  0  0   0  0   0
2 🇩🇪 Jerman     1  0  0  0   0  0   0
...

Diperbarui: 15 Jun 2026 · 22:45 WIB
```

---

## 🔧 WEBHOOK HANDLER (api/webhook.js)

### Tambahkan di /bola section (sebelum `/status`):
```javascript
} else if (text.startsWith('/bola')) {
  const args = text.trim().split(/\s+/);
  const sub  = args[1]?.toLowerCase();

  if (sub === 'jadwal') {
    const { runBolaJadwal } = require('../bola');
    await runBolaJadwal(bot, chatId);

  } else if (sub === 'hasil') {
    const { runBolaHasil } = require('../bola');
    await runBolaHasil(bot, chatId);

  } else if (sub === 'grup') {
    const { runBolaGrup } = require('../bola');
    await runBolaGrup(bot, chatId);

  } else if (sub === 'prediksi') {
    const team1 = args[2]?.toUpperCase();
    const team2 = args[3]?.toUpperCase();
    const { runBolaPrediksi } = require('../bola');
    await runBolaPrediksi(bot, chatId, team1, team2);

  } else if (sub === 'h2h') {
    const team1 = args[2] || '';
    const team2 = args[3] || '';
    const { runBolaH2H } = require('../bola');
    await runBolaH2H(bot, chatId, team1, team2);

  } else {
    const { runBola } = require('../bola');
    await runBola(bot, chatId);
  }
```

### Tambahkan di menu `/start`:
```
⚽ /bola — Prediksi & hasil Piala Dunia 2026
```

---

## 🌍 FLAG EMOJI MAP

Peta bendera utama yang perlu di-hardcode untuk render Telegram:
```javascript
const FLAG = {
  'Brazil': '🇧🇷', 'Argentina': '🇦🇷', 'France': '🇫🇷',
  'Germany': '🇩🇪', 'Spain': '🇪🇸', 'Portugal': '🇵🇹',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Netherlands': '🇳🇱', 'Italy': '🇮🇹',
  'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Mexico': '🇲🇽',
  'USA': '🇺🇸', 'Canada': '🇨🇦', 'Morocco': '🇲🇦',
  'Senegal': '🇸🇳', 'Nigeria': '🇳🇬', 'Australia': '🇦🇺',
  'Poland': '🇵🇱', 'Croatia': '🇭🇷', 'Serbia': '🇷🇸',
  'Switzerland': '🇨🇭', 'Belgium': '🇧🇪', 'Denmark': '🇩🇰',
  'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴',
  'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷', 'Qatar': '🇶🇦',
  // ... lengkap 48 tim WC 2026
};
```

---

## ⚙️ ENV VARIABLE BARU

| Variable | Deskripsi | Cara Dapat |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | API key football-data.org | Daftar gratis di football-data.org |

---

## 📋 CACHE STRATEGY

| Data | TTL | Key |
|---|---|---|
| Match hari ini | 5 menit | `bola_today` |
| Jadwal mendatang | 30 menit | `bola_upcoming` |
| Hasil terbaru | 10 menit | `bola_results` |
| Klasemen grup | 15 menit | `bola_standings` |
| Prediksi AI | 60 menit | `bola_pred_<team1>_<team2>` |
| H2H data | 24 jam | `bola_h2h_<team1>_<team2>` |

---

## 🚀 LANGKAH IMPLEMENTASI

### Fase 1 — Setup & Data ✅ SELESAI
- [x] Daftar API key di football-data.org — `FOOTBALL_DATA_TOKEN` aktif
- [x] Buat `bola.js` dengan fetchers + cache (6 handlers, TTL per kategori)
- [x] Test endpoint: 4 match hari ini berhasil diambil real-time
- [x] Standings 12 grup berhasil diambil
- [x] Syntax check passed (`node -c bola.js`)
- [x] Token disimpan di `.env`

### Fase 2 — Command Default `/bola` ✅ SELESAI
- [x] `runBola()` — tampilkan match hari ini (live + upcoming + hasil)
- [x] Format HTML dengan emoji bendera + waktu WIB
- [x] Tambah handler `/bola` + semua subcommand di `api/webhook.js`
- [x] Tambah entri `/bola` di menu `/start`
- [x] Test syntax: `node -c bola.js` ✅ | `node -c api/webhook.js` ✅

### Fase 3 — Subcommands Data (45 menit)
- [ ] `runBolaJadwal()` — jadwal 7 hari ke depan
- [ ] `runBolaHasil()` — hasil 3 pertandingan terakhir
- [ ] `runBolaGrup()` — klasemen semua grup (A–L, total 12 grup WC 2026)
- [ ] `runBolaH2H()` — head-to-head 2 tim

### Fase 4 — AI Prediction (45 menit)
- [ ] `generatePrediction()` — OpenRouter prompt engineering
- [ ] `runBolaPrediksi()` — prediksi match hari ini
- [ ] `runBolaPrediksi(team1, team2)` — prediksi custom
- [ ] Format output dengan confidence bar

### Fase 5 — Polish & Deploy (15 menit)
- [ ] Update `/start` menu
- [ ] Update `instruction.md`
- [ ] `node -c bola.js` syntax check
- [ ] Commit & push → auto-deploy ke Cloud Run

---

## ⚠️ CATATAN PENTING

1. **WC 2026 berlangsung sekarang** (Juni–Juli 2026) — data real-time krusial
2. **football-data.org free tier**: 10 req/menit — wajib pakai cache agresif
3. **Bendera emoji**: render di Telegram mobile ✅, desktop kadang tidak tampil
4. **Prediksi AI**: selalu tambahkan disclaimer "bukan jaminan hasil"
5. **Waktu**: semua waktu dikonversi ke WIB (UTC+7) menggunakan `utils.js`
6. **Output Bahasa Indonesia** — sesuai aturan codebase
7. **12 Grup** di WC 2026 (48 tim, bukan 32 seperti sebelumnya)

---

## 🔗 REFERENSI

- [football-data.org docs](https://www.football-data.org/documentation/quickstart)
- [TheSportsDB API](https://www.thesportsdb.com/api.php)
- [FIFA World Cup 2026 info](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026)
