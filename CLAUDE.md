# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

Before making changes, read `instruction.md` — it is a maintained, exhaustive knowledge base of this codebase (architecture, every module's purpose, code patterns, dependency graph). `AGENTS.md` states the project's own rule: prefer reading `instruction.md` over reading source files directly when possible, and update `instruction.md` when you learn something new about a file that isn't already captured there.

Other roadmap docs (not required reading, but useful for context on planned work): `inovation.md`, `signal_high_upgrade.md`, `upgrade_v1.md`, `CRYPTO_ALERTS_GUIDE.md`.

## Commands

```bash
# Syntax-check a file before committing (no test framework exists in this repo)
node -c <file>.js

# Run the bot
node server.js          # Production mode — Express server + Telegram webhook + scheduler
node index.js            # One-shot CLI scan that sends results to Telegram directly

# Register the Telegram webhook (after deploy)
node set-webhook.js <url>
```

Note: `package.json`'s `"start"` script (`node bot.js`) is stale — `bot.js` does not exist. Use `node server.js` (matches `Dockerfile`'s `CMD`) or `node index.js`.

There is no lint, build, or test suite. Verification is `node -c <file>.js` (syntax only) plus manual/functional checks.

## Architecture

- **Runtime**: Node.js 20, CommonJS (`"type": "commonjs"`), no TypeScript, no bundler.
- **Entry points**: `server.js` is the production Express server (Telegram webhook receiver at `/api/webhook`, cron endpoint at `/api/cron`, a handful of REST endpoints for a web dashboard, and an internal 10:00 WIB auto-news scheduler). `index.js` is a one-shot CLI scan.
- **Command router**: `api/webhook.js` is the core dispatcher — it parses incoming Telegram messages and routes `/command` text through a large if/else chain to the appropriate feature module.
- **Monolithic flat structure**: ~25+ feature modules live at the repo root, one file per feature area (e.g. `outlook.js`, `quant.js`, `liq.js`, `onchain.js`, `stock.js`, `dex.js`, `deribit.js`, `news.js`, `bloomberg.js`, `crypto-analyzer.js`, `ai-analyst.js`, `content_generator.js`, `performance.js`). Each module is largely self-contained: it fetches its own data from external APIs, formats an HTML report, and exposes handler function(s) consumed by `api/webhook.js`.
- **Lazy imports**: feature modules are `require()`d inside the webhook handler branch that needs them, not at the top of `api/webhook.js` — follow this pattern when wiring up a new command.
- **No database**: persistence is either a GitHub Gist (`performance.js`, signal tracking) or local JSON files (`alert-storage.js`, crypto alerts). `signals_data.json` is gitignored.
- **Caching**: each module that needs caching implements its own in-memory `Map`-based TTL cache (see the `cached(key, ttlMs, fn)` pattern in `instruction.md`) — caches are not shared across modules.
- **Dual AI backends**: OpenRouter (multi-model fallback: minimax, hermes-3, gemma-4, `openai/gpt-oss-120b:free`) is used for content/news/prediction generation (`news.js`, `bloomberg.js`, `content_generator.js`, `trend_analyzer.js`); Google Gemini (`@google/generative-ai`) is used for market narrative generation (`outlook.js`, `fast-analyzer.js`, `content_generator.js`). `ai-analyst.js` (`/ask`) uses the Xiaomi MiMo API separately.
- **Output language convention**: all user-facing Telegram output is Bahasa Indonesia; all code (identifiers, comments) is English.
- **Message formatting**: Telegram messages use HTML `parse_mode` (not Markdown) — see `instruction.md` for the bold/italic/code/link + entity-escaping conventions, progress-bar/separator visual elements, and the 4000-char message-splitting pattern used for long reports.
- **Deployment**: `git push` to `main` triggers `.github/workflows/deploy.yml`, which builds the Docker image (`node:20-slim`) and deploys to Google Cloud Run in `asia-southeast2`. `.github/workflows/cron.yml` hits `GET /api/cron` (with an `x-cron-secret` header) hourly to trigger an auto-scan.

## Working conventions

- Keep `instruction.md` in sync: if you read a file in depth or change how a module behaves, update the corresponding entry there (file table, dependency graph, command registry) rather than leaving it stale.
- Match existing patterns already established per module rather than introducing new ones (cache shape, axios timeout config, HTML formatting, lazy-require placement) — see the "CODE PATTERNS & CONVENTIONS" section of `instruction.md` for the canonical snippets.
- New Telegram commands are wired into the if/else chain in `api/webhook.js`; check `instruction.md`'s Command Registry table for the current list before adding one, and update that table when you add or change a command.
