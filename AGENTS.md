# Repository Guidelines

## Purpose and scope

This repository is a private npm workspace for developing independently published packages for the Pi coding agent. The repository root is development infrastructure only; it is not itself a Pi package and must remain `private: true`.

Each directory under `packages/` is an independent npm package. Keep package versions, manifests, documentation, and release decisions package-specific.

## Repository layout

- `packages/pi-inline-skills/` — TypeScript extension that adds inline `$skill` references, autocomplete, context injection, deduplication, and a visible receipt.
- `.github/workflows/ci.yml` — shared validation for the workspace.
- `package.json` and `package-lock.json` — root workspace definition and the single dependency lockfile.

Do not add a root-level `pi` manifest unless the repository is intentionally being changed into an install-all Pi package.

## Package conventions

- Every publishable package must declare its Pi resources in its own `package.json` under `pi`.
- Runtime files must be covered by the package's `files` allowlist.
- Pi SDK packages belong in `peerDependencies`; development copies belong at the workspace root.
- Raw TypeScript extensions are loaded directly by Pi, so do not add a build step unless a package actually needs emitted output.
- Keep package READMEs usable when rendered on npm, without relying on files excluded from the tarball.

## Development workflow

Use Node.js 22 or newer and npm workspaces. This repository is pinned to the public npm registry by `.npmrc`; do not replace it with a private or company registry.

Run the full validation suite from the repository root:

```bash
npm install
npm run check
npm run pack:dry-run
```

Useful package-scoped commands:

```bash
npm test --workspace=pi-inline-skills
npm run typecheck --workspace=pi-inline-skills
pi -e ./packages/pi-inline-skills
```

Before committing, run `npm run check` and inspect the dry-run tarball whenever package metadata or the `files` allowlist changes.

## Registry and publishing safety

- Never run `npm publish`, change npm package access, create release tags, or modify trusted-publisher settings unless the user explicitly requests that external action.
- Public packages must publish only to `https://registry.npmjs.org/` and must declare that registry in `publishConfig`.
- Do not commit npm tokens, authentication-bearing `.npmrc` entries, provenance credentials, or other secrets.
- Prefer GitHub OIDC trusted publishing over long-lived npm write tokens when release automation is introduced.

## Git conventions

- Use Conventional Commit messages such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:`.
- Stage files intentionally and keep generated archives, logs, `node_modules/`, and local-only experiments out of commits.
- Preserve unrelated user changes and do not rewrite history unless explicitly requested.
- A commit is ready only when relevant tests and type checks pass and `git diff --cached --check` reports no whitespace errors.
