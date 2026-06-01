# 🔍 /high Signal — Upgrade Roadmap

> Tracking progress upgrade fitur `/high` (High Probability Signal Scanner)
> ✅ = Sudah diimplementasi | ⬜ = Belum

---

## ✅ COMPLETED

### 1. Funding Rate Integration `DONE`

**Tanggal:** 2025-07-19
**Commit:** `3db25e9`

- Mengambil funding rate dari Binance Futures API
- Scoring confluence:
  - `> +0.08%` → Crowded Long ⚠️ (warning + contrarian bonus +2 ke short)
  - `+0.02% ~ +0.08%` → Healthy Demand ✅ (+1 long)
  - `< -0.08%` → Crowded Short ⚠️ (warning + contrarian bonus +2 ke long)
  - `-0.08% ~ -0.02%` → Selling Pressure ✅ (+1 short)
  - `-0.02% ~ +0.02%` → Neutral (no change)
- Display di output: label status + emoji indicator
- **File:** `binance.js`, `scanner.js`, `analyzer.js`

---

### 2. Open Interest Change Integration `DONE`

**Tanggal:** 2025-07-19
**Commit:** `3db25e9`

- Mengambil OI history 1h dari Binance Futures API
- Hitung % change antara 2 snapshot terakhir
- Scoring confluence berdasarkan kombinasi OI + Price direction:
  - `OI > +2%` + Price ↑ → Trend Strength (+2 long)
  - `OI > +2%` + Price ↓ → New Shorts Entering (+2 short)
  - `OI > +0.5%` + Price ↑ → Buying Interest (+1 long)
  - `OI < -2%` + Price ↑ → Short Covering Warning (+1 short)
  - `OI < -2%` + Price ↓ → Capitulation Exhaustion (+1 long)
- Display di output: label status + emoji indicator
- **File:** `binance.js`, `scanner.js`, `analyzer.js`

---

## ⬜ PENDING — High Priority

### 3. Signal Cooldown / Dedup `P1`

**Problem:** Pair yang sama bisa di-signal berulang kali → spam ke user

**Solution:**
```javascript
// In-memory cooldown map
const SIGNAL_COOLDOWN = new Map(); // pair → lastSignalTimestamp
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 jam

function isOnCooldown(pair) {
  const last = SIGNAL_COOLDOWN.get(pair);
  return last && (Date.now() - last) < COOLDOWN_MS;
}
```

**Estimated Effort:** 15 menit (~20 lines)

---

### 4. Economic Calendar Filter `P1`

**Problem:** Signal teknikal bisa invalid saat ada event makro besar (NFP, CPI, FOMC)

**Solution:**
- Check `economic-calendar.js` sebelum generate signal
- Jika ada high-impact event dalam 2 jam → warning di output

**File yang sudah ada:** `economic-calendar.js`

**Estimated Effort:** 1-2 jam (~40 lines)

---

### 5. Session Score Integration `P2`

**Problem:** Session info hanya sebagai label, tidak mempengaruhi scoring

**Solution:**
```javascript
// Tambah setelah confluence scoring
const sessionInfo = getSessionInfo();
if (sessionInfo.optimal) {
  longScore += 1; longFactors.push('Optimal Session ✅');
  shortScore += 1; shortFactors.push('Optimal Session ✅');
}
```

**Estimated Effort:** 5 menit (~10 lines)

---

## ⬜ PENDING — Medium Priority

### 6. Adaptive Threshold per Market Regime `P2`

**Problem:** Threshold sama untuk semua kondisi market

**Solution:**
```javascript
// RANGING → naikkan minConfluence (lebih selektif)
// TRENDING → threshold standar
// VOLATILE → naikkan minRR requirement
function getAdaptiveConfig(baseCfg, regime) {
  if (regime === 'RANGING')  return { ...baseCfg, minConfluence: baseCfg.minConfluence + 1 };
  if (regime === 'VOLATILE') return { ...baseCfg, minRR: baseCfg.minRR + 0.5 };
  return baseCfg;
}
```

**Estimated Effort:** 1-2 jam (~40 lines)

---

### 7. BTC Key Level Proximity Check `P2`

**Problem:** Tidak ada check "BTC sedang di resistance kuat" yang bisa invalidate altcoin longs

**Solution:**
```javascript
// Jika BTC near strong resistance → penalize semua alt longs
const btcKeyLevels = findKeyLevels(btcKlines4h, 5);
const btcNearResist = btcKeyLevels.find(l => 
  l.type === 'RESISTANCE' && l.strength === 'STRONG' && 
  Math.abs(btcPrice - l.price) / btcPrice < 0.01
);
if (btcNearResist && direction === 'LONG') {
  longScore -= 1; // penalty ringan
  longFactors.push('BTC Near Strong Resistance ⚠️');
}
```

**Estimated Effort:** 1 jam (~25 lines)

---

### 8. Volume Profile / POC (Point of Control) `P2`

**Problem:** Entry tidak mempertimbangkan area high-volume trading

**Solution:**
- Calculate POC dari volume profile 4H
- Jika price near POC → bonus confluence (+1)

**Estimated Effort:** 2 jam (~50 lines)

---

## ⬜ PENDING — Low Priority

### 9. Signal Expiry / TTL `P3`

**Problem:** Signal tidak punya waktu kadaluarsa → user bisa eksekusi signal stale

**Solution:**
- Tambah `expiresAt` field ke signal object (default 4 jam)
- Auto-mark as EXPIRED di `/pending`
- Warning jika user `/result` pada expired signal

**Estimated Effort:** 1 jam (~25 lines)

---

### 10. Trailing Stop Suggestion `P3`

**Problem:** Hanya TP1/TP2 fixed, tidak ada trailing stop

**Solution:**
```
Trailing Stop: Geser SL → Higher Low terakhir jika harga sentuh TP1
```

**Estimated Effort:** 30 menit (~15 lines)

---

### 11. Expected Move Calculation `P3`

**Problem:** TP berbasis fixed RR multiplier, tidak consider actual volatility

**Solution:**
```javascript
const expectedMove = atr * Math.sqrt(4); // 4 jam expected move
const tpRealistic = price + expectedMove;
```

**Estimated Effort:** 15 menit (~10 lines)

---

### 12. Pair-Specific Parameters `P3`

**Problem:** Semua pair pakai parameter yang sama (BTC vs PEPE sangat berbeda volatilitasnya)

**Solution:**
```javascript
// Tier 1 (BTC, ETH): lower ATR multiplier, higher RR
// Tier 4 (PEPE, SHIB): higher ATR multiplier, lower RR
function getTierConfig(tier, atrPct) {
  const base = TIER_CONFIG[tier];
  if (atrPct > 5) return { ...base, minRR: base.minRR + 0.3 };
  return base;
}
```

**Estimated Effort:** 1-2 jam (~30 lines)

---

### 13. Backtesting Validation `P3`

**Problem:** Tidak ada cara validasi performa scoring system secara historis

**Solution:**
- Jalankan scoring logic di data historis 30-90 hari
- Hitung win rate, profit factor, sharpe ratio
- Bandingkan sebelum/sesudah Funding+OI integration

**Estimated Effort:** 3-5 hari

---

## 📊 Progress Summary

| # | Feature | Status | Priority | Effort |
|---|---------|--------|----------|--------|
| 1 | Funding Rate Integration | ✅ Done | P0 | 30m |
| 2 | Open Interest Change | ✅ Done | P0 | 30m |
| 3 | Signal Cooldown | ⬜ Pending | P1 | 15m |
| 4 | Economic Calendar Filter | ⬜ Pending | P1 | 1-2h |
| 5 | Session Score Integration | ⬜ Pending | P2 | 5m |
| 6 | Adaptive Threshold | ⬜ Pending | P2 | 1-2h |
| 7 | BTC Key Level Check | ⬜ Pending | P2 | 1h |
| 8 | Volume Profile / POC | ⬜ Pending | P2 | 2h |
| 9 | Signal Expiry / TTL | ⬜ Pending | P3 | 1h |
| 10 | Trailing Stop Suggestion | ⬜ Pending | P3 | 30m |
| 11 | Expected Move Calc | ⬜ Pending | P3 | 15m |
| 12 | Pair-Specific Params | ⬜ Pending | P3 | 1-2h |
| 13 | Backtesting Validation | ⬜ Pending | P3 | 3-5d |

**Completed:** 2/13 (15%)
**Next Up:** Signal Cooldown (#3) — quickest win

---

## 📌 Notes

- **Last Updated:** 2025-07-19
- **Confluence Factors:** 16 aktif (sebelumnya 14)
- **Scoring Range:** ~0-25+ pts per direction
- Dokumen ini akan di-update setiap kali ada upgrade baru
