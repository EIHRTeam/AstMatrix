# Repository Guidelines

## Project Structure & Module Organization

AstMatrix is an offline-first barcode plugin skeleton. `apps/` contains the playground
and Illustrator CEP, Photoshop UXP, and Affinity entries. `packages/` contains encoding,
profiles, catalog, vector IR, SVG rendering, services, UI, and host adapters.
`tooling/` owns builds and packaging; `tests/` holds fixtures and layered suites.
Bundle host resources with their app. Read `docs/plan/INIT.md` for architecture,
`docs/plan/README.md` for M0–M7 tasks, and `docs/plan/TRACKING.md` for progress.

## Build, Test, and Development Commands

Use Node.js 24 LTS and pinned pnpm 12.11.2.

- `pnpm install --frozen-lockfile`: install workspace dependencies reproducibly.
- `pnpm dev`: run the browser playground.
- `pnpm check`: run workspace typechecks, lint, formatting checks, and tests.
- `pnpm fmt`: format supported files with Oxfmt.
- `pnpm test:conformance`, `pnpm test:vector`, `pnpm test:react-state`: run focused suites.
- `pnpm build:illustrator`, `pnpm build:photoshop`, `pnpm build:affinity`: resolve host build plans.
- `pnpm package`: print the packaging plan.

Illustrator and Photoshop builds now emit development plugin directories; Affinity and signed packaging remain plans. `pnpm build:web --profile=cep11` and
`--profile=cep12` now emit real Web bundles; `--compiler=off` emits separate comparison
bundles and `--dry-run` only resolves the plan. The playground also builds via
`pnpm build:web --profile=web-playground`.

## Coding Style & Naming Conventions

Use strict TypeScript, ESM, and `@astmatrix/<name>` workspace names.
Follow Oxfmt: two-space indentation, single quotes, semicolons, trailing commas,
and 100-column formatting. Use Oxlint; avoid parallel lint/format toolchains.
Keep ExtendScript compatible with its legacy engine; excluded JSX and manifests
need separate validation.

## Architecture & Configuration

Keep encoding, IR, and application services independent of React and host APIs.
Render SVG and native editable objects from the same `VectorScene`; preserve
physical dimensions and quiet zones. React state belongs in the UI layer.
Keep generation offline. Do not commit secrets, SDK archives in `tmp/`, or generated
`dist/` packages; retain redistribution licenses for bundled SDK resources.

## Testing Guidelines

Use Vitest: colocate unit `*.test.ts` files; place layered tests under their matching
`tests/` directories, with React tests also using `*.test.tsx`. No numeric coverage
threshold is configured; cover changed behavior, invalid inputs, geometry, and
asynchronous races. Empty suites currently pass; this is not implementation evidence.
Scanning and editable-vector acceptance require independent decoders and real hosts.

## Commit & Pull Request Guidelines

Follow existing `docs:` and `chore:` prefixes with concise action summaries.
Keep PRs focused: explain behavior, link issues or task IDs, report validation/blockers,
and attach UI screenshots. Integration results need host/runtime, OS, and architecture.

## Agent Documentation Lookup

For library/framework/SDK/API/CLI/cloud questions, use Context7: resolve the library ID
(unless an exact ID is provided), then query current docs with the full question.
Skip general programming, business logic, refactoring, and code review.
