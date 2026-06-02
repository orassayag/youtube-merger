# Contributing to YouTube Merger

First off, thank you for considering contributing to YouTube Merger. It is people like you that make this tool better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by a simple principle: **Be respectful and constructive**. By participating, you are expected to uphold this standard.

## Getting Started

- Make sure you have [Node.js](https://nodejs.org/) (v18+) and [pnpm](https://pnpm.io/) installed
- Fork the repository on GitHub
- Clone your fork locally
- Create a branch for your contribution

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (code snippets, command output, CSV shape if relevant — redact IDs if needed)
- **Describe the behavior you observed** and what you expected
- **Include your environment details** (OS, Node version, pnpm version)

### Suggesting Enhancements

Enhancement suggestions are welcome. Please provide:

- **A clear and descriptive title**
- **A detailed description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **Provide examples** of how it would work

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` — Good for newcomers
- `help wanted` — Extra attention needed
- `documentation` — Improvements to documentation

## Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/yourusername/youtube-merger.git
   cd youtube-merger
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build the project**

   ```bash
   pnpm build
   ```

4. **Run tests**

   ```bash
   pnpm test
   ```

5. **Run linting**
   ```bash
   pnpm lint
   ```

## Coding Standards

### TypeScript Guidelines

- **Use TypeScript** for all code
- **Explicit typing** — Avoid `any` unless absolutely necessary
- **Functional approach** — Prefer pure functions for parsing and helpers; keep side effects in `main` and migration modules
- **Clear naming** — Use descriptive variable and function names

### Code Style

- **Formatting** — Run `pnpm prettier:fix` before committing
- **Linting** — Run `pnpm lint:fix` to fix linting issues
- **Console output** — User-facing `console.log` / `console.warn` in CLI and migration code is expected; avoid stray debug logs in library-style helpers
- **Comments** — Add comments for non-obvious logic, not what the code already states

### File Organization

```
src/
├── auth/           # OAuth2 desktop flow
├── api/            # Retry and shared API helpers
├── parsers/        # Takeout CSV parsing
├── migrate/        # subscriptions, playlists, liked videos
├── types/          # TypeScript type definitions
└── __tests__/      # Test files (colocated under each area)
```

### Example Code Style

```typescript
// Good
export function parseSubscriptions(takeoutRoot: string = CONFIG.takeoutPath): Subscription[] {
  const csvPath = path.join(takeoutRoot, 'subscriptions', 'subscriptions.csv');
  if (!fs.existsSync(csvPath)) {
    console.warn('⚠️  subscriptions.csv not found at:', csvPath);
    return [];
  }
  // ...
}

// Avoid
export function parseSubscriptions(root: any) {
  return JSON.parse(fs.readFileSync(root)); // unclear, untyped
}
```

## Testing Guidelines

### Writing Tests

- **Test files** — Place in `__tests__` directories next to source files
- **Naming** — Use `.test.ts` suffix (e.g., `takeoutCsv.test.ts`)
- **Coverage** — Aim for solid coverage of parsers and `withRetry` behavior
- **Unit tests** — Test pure parsing and retry logic without calling YouTube
- **Secrets** — Do not commit real `credentials.json` or `token.json`; use temp dirs for filesystem tests

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseSubscriptions } from '../takeoutCsv.js';

describe('takeoutCsv', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'yt-merge-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads subscription rows', () => {
    mkdirSync(join(root, 'subscriptions'), { recursive: true });
    writeFileSync(
      join(root, 'subscriptions', 'subscriptions.csv'),
      'Channel Id,Channel Title,Channel Url\nUCx,Title,https://...\n'
    );
    const subs = parseSubscriptions(root);
    expect(subs).toHaveLength(1);
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage (if enabled)
pnpm test -- --coverage
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without changing functionality
- `test`: Adding or updating tests
- `chore`: Maintenance tasks, dependency updates

### Examples

```
feat(parsers): support alternate Takeout column names

Adds fallbacks for subscription CSV headers seen in older exports.

Closes #123
```

```
fix(retry): treat 409 as duplicate for playlist items

Prevents counting duplicate inserts as hard failures.

Fixes #456
```

## Pull Request Process

### Before Submitting

1. **Update tests** — Add or update tests for your changes
2. **Run the test suite** — `pnpm test`
3. **Run linting** — `pnpm lint:fix`
4. **Run formatting** — `pnpm prettier:fix`
5. **Update documentation** — If you changed behavior (README, INSTRUCTIONS)
6. **Test manually** — Only with your own credentials and Takeout data; do not share tokens

### Submitting

1. **Push your branch** to your fork
2. **Open a Pull Request** against the `main` branch
3. **Fill in the PR description** with relevant details
4. **Link related issues** using "Fixes #123" or "Closes #456"

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Tests pass locally
- [ ] Added/updated tests
- [ ] Tested manually (describe scope — no secrets)

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
```

### Review Process

- **Code review** — Maintainers will review your PR
- **Feedback** — Address any requested changes
- **Approval** — Once approved, your PR will be merged
- **Credit** — You will be credited in the release notes

## Development Tips

### Debugging

```bash
node --inspect-brk node_modules/.bin/tsx src/main.ts
```

### Testing the CLI locally

Use a dedicated Google Cloud OAuth client and a test Takeout export. Do not commit `credentials.json` or `token.json`.

```bash
pnpm start
```

### Performance and quota

Large libraries consume API quota. Tune `rateLimitDelay` and run one `migrate.*` section at a time if needed.

## Questions?

Feel free to open an issue with the `question` label if you have any questions about contributing.

## Recognition

Contributors will be recognized in:

- Release notes
- README.md (if significant contribution)
- GitHub contributors page

Thank you for making YouTube Merger better.
