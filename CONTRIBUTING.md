# Contributing to ErrorAtlas

Thank you for helping make application errors easier to understand.

## Development setup

Requirements:

- Node.js 20 or newer
- npm 10 or newer

```bash
git clone <your-fork>
cd erroratlas
npm install
npm run check
npm test
npm run build
```

Run the CLI against the included bilingual demo:

```bash
node dist/cli.js scan examples/demo
node dist/cli.js check examples/demo
```

## Pull requests

1. Open an issue first for large behavior or schema changes.
2. Add or update tests for user-visible behavior.
3. Keep extraction deterministic; do not guess dynamic values.
4. Run `npm run check && npm test && npm run build`.
5. Explain the error pattern and framework version covered by a new extractor.

Bug reports are most useful when they include a minimal throw/raise example, expected output, actual output, ErrorAtlas version, Node.js version, and operating system.
