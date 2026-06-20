# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-06-20

### Added

- Java, Dart, and Swift AST language packs.
- Built-in Firebase `HttpsError` and Dart `FirebaseFunctionsException` profiles.
- Detection for generic exceptions with zero, one, or multiple constructor arguments.
- Message-variant catalogs for framework codes that legitimately map to several messages.
- A reproducible GitHub repository audit pipeline and privacy-safe public dataset export.

### Fixed

- Dotted constructors such as `functions.https.HttpsError` are now detected.
- Framework codes with allowed message variants no longer produce false duplicate-definition errors.
- Vitest no longer discovers tests inside isolated audit clones.

## [0.1.0] - 2026-06-20

### Added

- AST-based TypeScript, JavaScript, TSX, JSX, and Python scanning.
- Built-in profiles for common application errors, NestJS exceptions, and FastAPI `HTTPException`.
- Human-editable JSON catalogs with generated Markdown references.
- Drift rules for undocumented, stale, conflicting, changed, and unstructured errors.
- Console, JSON, Markdown, and SARIF output.
- GitHub Actions workflow and reusable composite action metadata.
