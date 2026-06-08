# 🤖 AGENTS.md — AI Agent Instructions

> **PENTING:** Sebelum melakukan apapun, baca `instruction.md` terlebih dahulu.
> File ini berisi pemahaman lengkap tentang seluruh codebase (35 files, ~10.000+ lines).
> Tidak perlu membaca file source code secara manual — instruction.md sudah mencakup semuanya.

---

## 🚀 Quick Start untuk AI Agent

1. **Baca `instruction.md`** — pemahaman lengkap codebase
2. **Baca `inovation.md`** — roadmap fitur yang sudah ada dan yang akan datang
3. **Baca `signal_high_upgrade.md`** — roadmap upgrade `/high`
4. **Baca `upgrade_v1.md`** — roadmap upgrade v1

---

## 📂 File Index

| File | Purpose |
|---|---|
| `instruction.md` | **BACA INI DULU** — Knowledge base lengkap codebase |
| `inovation.md` | Innovation roadmap (17 items, priority matrix) |
| `signal_high_upgrade.md` | /high signal upgrade roadmap (13 items) |
| `upgrade_v1.md` | v1 upgrade roadmap (15 items) |

---

## ⚡ Perintah yang Sering Dibutuhkan

```bash
# Syntax check semua file
node -c deribit.js && node -c outlook.js && node -c api/webhook.js

# Jalankan bot
node server.js              # Production mode
node index.js               # One-shot CLI scan

# Git workflow
git add <files> && git commit -m "feat: <description>" && git push
```

---

## ⚠️ Rules

1. **JANGAN baca file source code** kecuali instruction.md tidak cukup
2. **Selalu baca `instruction.md`** sebelum memodifikasi apapun
3. **Ikuti code patterns** yang sudah ada di instruction.md (cache pattern, lazy imports, HTML formatting, dll)
4. **Semua output UI dalam Bahasa Indonesia** — code English, output Indonesia
5. **Pastikan syntax check pass** (`node -c <file>`) sebelum commit
