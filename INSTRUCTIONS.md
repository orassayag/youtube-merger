# YouTube Merger — Developer Instructions

This document provides detailed instructions for developers working on the YouTube Merger project.

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Setup Instructions](#setup-instructions)
- [Development Workflow](#development-workflow)
- [Module Documentation](#module-documentation)
- [Testing Strategy](#testing-strategy)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Project Overview

### Purpose

YouTube Merger is a TypeScript CLI that reads **Google Takeout** YouTube exports (CSV) and applies them to a **destination** YouTube account via the **YouTube Data API v3**. It supports:

- Subscriptions (`subscriptions/subscriptions.csv`)
- User-defined playlists (`playlists/*.csv`, with liked / watch-later style files excluded from playlist import)
- Liked videos (CSV under `playlists/` whose filename contains `liked`)

### Target Users

- Users moving YouTube data between Google accounts
- Developers automating library migration from Takeout archives
- Anyone comfortable placing OAuth desktop credentials locally

### Key Goals

1. **Predictable I/O** — Clear mapping from Takeout paths to API calls
2. **Quota awareness** — Delays and retries; user-configurable pacing
3. **Idempotency where possible** — HTTP 409 treated as duplicate for relevant operations
4. **Safety of secrets** — `credentials.json` and `token.json` must never be committed
5. **Cross-platform** — Windows, macOS, and Linux (paths via `path.join`; tests use `cross-env` for `NODE_OPTIONS`)

## Architecture

### High-Level Design

```
User Input (config.ts)
        ↓
    main.ts (Orchestrator)
        ↓
    auth/oauth.ts (OAuth2 desktop)
        ↓
    parsers/takeoutCsv.ts (read CSV)
        ↓
    migrate/subscriptions.ts | playlists.ts | likedVideos.ts
        ↓
    api/retry.ts (withRetry, delay)
        ↓
    YouTube Data API v3
```

### Module Responsibilities

| Module                     | Responsibility                                              | Key exports                                                                                   |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `main.ts`                  | Entry, credential check, orchestration                      | `main()`                                                                                      |
| `config.ts`                | Paths, feature flags, `rateLimitDelay`                      | `CONFIG`                                                                                      |
| `auth/oauth.ts`            | Load client secrets, token refresh, first-run code exchange | `authenticate()`                                                                              |
| `parsers/takeoutCsv.ts`    | Parse Takeout CSVs                                          | `parseSubscriptions`, `parsePlaylists`, `parseLikedVideos` (optional `takeoutRoot` for tests) |
| `api/retry.ts`             | Backoff, 409 duplicate handling, 403 quota wait             | `delay`, `withRetry`                                                                          |
| `migrate/subscriptions.ts` | `subscriptions.insert` loop                                 | `migrateSubscriptions`                                                                        |
| `migrate/playlists.ts`     | Create playlist + `playlistItems.insert`                    | `migratePlaylists`                                                                            |
| `migrate/likedVideos.ts`   | `videos.rate` like                                          | `migrateLikedVideos`                                                                          |
| `types/index.ts`           | Shared types                                                | `Subscription`, `ApiResult`                                                                   |

### Data Flow

1. **Configuration** (`config.ts`) — Paths to OAuth files, Takeout root, which sections to run.
2. **Authentication** (`auth/oauth.ts`) — If `token.json` exists, load credentials; else print auth URL, read code from stdin, exchange, save token.
3. **Parsing** (`parsers/takeoutCsv.ts`) — Read CSV files from the Takeout tree; playlists skip certain filenames (liked, watch-later).
4. **Migration** (`migrate/*`) — For each entity, call the API through `withRetry`, then `delay(CONFIG.rateLimitDelay)`.
5. **Console** — Progress and summaries printed to stdout/stderr.

## Setup Instructions

### Prerequisites

- **Node.js** v18.0.0 or higher
- **pnpm** v8.0.0 or higher
- **Git** for version control
- **Google Cloud** project with YouTube Data API v3 enabled and OAuth **Desktop** client JSON

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/orassayag/youtube-merger.git
cd youtube-merger

# 2. Install dependencies
pnpm install

# 3. Place OAuth client JSON as credentials.json (do not commit)

# 4. Build the project
pnpm build

# 5. Verify setup
pnpm test
pnpm lint
```

### IDE Configuration

#### VS Code (Recommended)

Install recommended extensions:

- ESLint
- Prettier
- TypeScript and JavaScript Language Features

Settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Development Workflow

### Daily Development

```bash
# 1. Pull latest changes
git pull origin main

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes
# ... edit files ...

# 4. Run tests continuously
pnpm test:watch

# 5. Build and test
pnpm build
pnpm test
pnpm lint

# 6. Commit changes
git add .
git commit -m "feat: your feature description"

# 7. Push and create PR
git push origin feature/your-feature-name
```

### Adding a New Feature

1. **Design** — Document behavior, API impact, and quota implications.
2. **Types** — Extend `src/types/index.ts` if needed.
3. **Implementation** — Prefer pure parsers; keep HTTP calls in `migrate/*` with `withRetry`.
4. **Tests** — Unit tests for parsers and retry logic; avoid live API calls in CI.
5. **Documentation** — Update README / INSTRUCTIONS for user-visible behavior.

### Making a Bug Fix

1. **Reproduce** — Minimal Takeout sample or unit test.
2. **Fix** — Narrow change; preserve retry and rate-limit behavior unless intentionally changed.
3. **Verify** — `pnpm test` and targeted manual run with test credentials.

## Module Documentation

### Main (`src/main.ts`)

**Purpose:** Validate `credentials.json`, call `authenticate()`, obtain `google.youtube` client, run enabled migration sections in order.

**Flow:**

1. Exit if `credentials.json` missing.
2. `authenticate()` → `google.youtube({ version: 'v3', auth })`.
3. If `migrate.subscriptions`: `parseSubscriptions()` → `migrateSubscriptions`.
4. If `migrate.playlists`: `migratePlaylists`.
5. If `migrate.likedVideos`: `migrateLikedVideos`.

### Config (`src/config.ts`)

**Purpose:** Single source of truth for file paths and toggles.

**Note:** Adjust `takeoutPath` to your local Takeout folder. Use forward slashes or escaped paths in docs; code uses `path.join` for OS-correct paths.

### OAuth (`src/auth/oauth.ts`)

**Purpose:** Desktop OAuth2 using `googleapis` + `google-auth-library`.

**Scopes:** `youtube`, `youtube.force-ssl` (required for rating videos).

**Token storage:** JSON written to `tokenPath` after first successful `getToken`.

### Parsers (`src/parsers/takeoutCsv.ts`)

**Purpose:** Sync read of CSV via `csv-parse/sync`.

**Details:**

- Subscriptions: header row with columns such as `Channel Id`, `Channel Title`, `Channel Url` (aliases supported).
- Playlists: `from_line: 4` to match typical Takeout layout; skips files whose names include `liked` or `watch-later` (case-insensitive).
- Liked: discovers `*liked*` file under `playlists/`.

**Testing:** Functions accept optional `takeoutRoot` to point tests at temporary directories.

### Retry (`src/api/retry.ts`)

**Purpose:** Wrap async API calls with retries.

**Behavior:**

- Success → `{ status: 'success', data }`
- HTTP **409** → `{ status: 'duplicate' }`
- HTTP **403** → log, wait 60s, retry
- Other errors → warn, 2s delay, retry
- Exhausted attempts → `{ status: 'failed', error }`

### Migrate — Subscriptions (`src/migrate/subscriptions.ts`)

**API:** `youtube.subscriptions.insert` with `snippet.resourceId.channelId`.

**Metrics:** Counts added, skipped (duplicate), failed.

### Migrate — Playlists (`src/migrate/playlists.ts`)

**API:** `playlists.insert` (private), then `playlistItems.insert` per video ID.

**Metrics:** Per-playlist added count; duplicate/failed counts for items when applicable.

### Migrate — Liked (`src/migrate/likedVideos.ts`)

**API:** `youtube.videos.rate` with `rating: 'like'`.

**Metrics:** Success, skip (duplicate), failed.

## Testing Strategy

### Test Organization

```
src/
├── api/
│   ├── retry.ts
│   └── __tests__/
│       └── retry.test.ts
└── parsers/
    ├── takeoutCsv.ts
    └── __tests__/
        └── takeoutCsv.test.ts
```

### Test Categories

1. **Unit tests** — Parsers (temp dirs), `withRetry` success and 409 paths
2. **Edge cases** — Missing folders, empty CSVs (handled by warnings / empty arrays)

### Writing Tests

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../retry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success with data', async () => {
    const r = await withRetry(async () => ({ id: 'x' }), 'op');
    expect(r).toEqual({ status: 'success', data: { id: 'x' } });
  });
});
```

### Mocking Guidelines

- Mock `console.warn` when testing retry noise
- Do not mock entire `googleapis` in unit tests unless adding dedicated integration tests; prefer testing parsers and retry in isolation

### Running Tests

```bash
pnpm test
pnpm test retry.test.ts
pnpm test:watch
pnpm test -- --coverage
```

## Deployment

### Building for Production

```bash
rm -rf dist/
pnpm build
node dist/main.js
```

Ensure `credentials.json` is present at runtime if you run `dist/main.js` from the project root (or adjust paths).

### Release Process

1. **Version bump**

   ```bash
   npm version patch
   ```

2. **Build and test**

   ```bash
   pnpm build
   pnpm test
   pnpm lint
   ```

3. **Commit and tag**

   ```bash
   git add .
   git commit -m "chore: release v1.x.x"
   git tag v1.x.x
   git push origin main --tags
   ```

4. **Release notes** — Features, fixes, breaking changes, any quota or OAuth notes

## Troubleshooting

### TypeScript Errors After Dependency Updates

```bash
rm -rf node_modules
pnpm install
pnpm build
```

### Test Failures

1. Update mocks if retry or parser behavior changed
2. Run a single test file to isolate failures
3. On Windows, ensure `pnpm test` uses `cross-env` (already in `package.json`)

### OAuth Errors

- **Redirect URI mismatch** — Desktop client must match installed app flow; use the redirect from `credentials.installed.redirect_uris[0]`.
- **Access blocked** — Confirm YouTube Data API v3 is enabled and OAuth consent screen is configured for testing users if in Testing mode.

### Quota

- Reduce frequency: increase `rateLimitDelay`
- Run one section per day: toggle `migrate` flags in `config.ts`

### Debug Logging

```bash
# Verbose Node / network (use sparingly)
set NODE_DEBUG=net
pnpm start
```

Do not paste logs containing access tokens online.

## Best Practices

### Code Quality

1. **Type safety** — Strict TypeScript, avoid `any`
2. **Error handling** — Surface API failures with `failed` counts where applicable
3. **Documentation** — Update README / INSTRUCTIONS when behavior changes
4. **Testing** — Parsers and retry logic covered by unit tests

### Security

1. **Never commit** `credentials.json` or `token.json`
2. **`.gitignore`** — Keep OAuth files ignored
3. **Screenshots** — Redact client secrets and tokens

### Maintenance

1. **Dependencies** — Periodically update `googleapis` and related packages with testing
2. **API changes** — Monitor YouTube Data API revision notes
3. **Documentation** — Keep INSTRUCTIONS aligned with `src/` layout

## Additional Resources

- [YouTube Data API Overview](https://developers.google.com/youtube/v3)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [pnpm Documentation](https://pnpm.io/)
- [Google Takeout](https://takeout.google.com/)

## Questions?

1. Check existing issues on GitHub
2. Open a new issue with the `question` label
3. Reach out to maintainers

Happy coding.
