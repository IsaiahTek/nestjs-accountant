# Contributing

This guide is for contributors and maintainers working on `nestjs-accountant`.

## Setup

1. Install dependencies with `npm install`.
1. Make changes in `src/`.
1. Regenerate `dist/` before publishing or opening a release-ready change.

## Common Commands

```bash
npm run typecheck
npm run build
```

## Project Structure

- `src/accountant.module.ts`: Nest module entry point
- `src/accountant.config.ts`: Module options and generic defaults
- `src/services/ledger.service.ts`: Core double-entry posting and balance engine
- `src/entity/`: Domain-agnostic TypeORM entities with multi-tenant isolation
- `dist/`: compiled package output

## Contribution Expectations

- Keep the README focused on end-developer usage
- Put contributor workflow and maintenance notes in this file
- Preserve backwards compatibility where possible for public APIs
- Update docs when exported APIs or setup steps change
- Keep `src/` and generated `dist/` in sync for release-ready changes

## Before Opening A PR

1. Run `npm run typecheck`.
1. Run `npm run build`.
1. Confirm any public API changes are reflected in `README.md`.
1. Confirm contributor-specific notes remain in `CONTRIBUTING.md`, not the README.
