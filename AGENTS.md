# Repository Guidelines

## Purpose and scope

This repository is a private npm workspace for developing independently published packages for the Pi coding agent. The repository root is development infrastructure only; it is not itself a Pi package and must remain `private: true`.

Each directory under `packages/` is an independent npm package. Keep package versions, manifests, documentation, and release decisions package-specific.

## Repository layout

- `packages/pi-inline-skills/` — `@tunglam/pi-inline-skills`, a TypeScript extension that adds inline `$skill` references, autocomplete, context injection, deduplication, and a visible receipt.
- `packages/pi-lark-cli/` — `@tunglam/pi-lark-cli`, bundles the official lark-cli binary (via a pinned `@larksuite/cli` dependency and a package-owned launcher shim) plus the upstream `skills/` tree vendored at the matching release; `skills/` is machine-synced, do not edit it by hand. The upstream version lives in the `larkCliVersion` manifest field; the package version is maintained independently.
- `.github/workflows/ci.yml` — shared validation for the workspace.
- `.github/workflows/publish-inline-skills.yml` — tag-driven trusted publishing for `@tunglam/pi-inline-skills`. Release flow: bump the version on `main`, push, then create and push the `@tunglam/pi-inline-skills@X.Y.Z` tag; the tag push triggers the publish.
- `.github/workflows/sync-lark-cli.yml` — hourly upstream tracker for `@tunglam/pi-lark-cli`. Job split: `check` decides work, `smoke` (`permissions: {}`) is the only job executing upstream install scripts and binaries, `prepare` (read-only) runs the sync script and full toolchain and exports the result as an artifact, `commit` (the only write job) verifies the artifact's paths as data, commits, tags, pushes, and dispatches the publish workflow without running any npm install or toolchain. Failures surface through GitHub's built-in workflow-failure notifications; a missed publish is recovered by dispatching the publish workflow by hand.
- `.github/workflows/publish-pi-lark-cli.yml` — trusted publishing for `@tunglam/pi-lark-cli`. Triggered by a release-tag push, or dispatched with the tag as input by the sync workflow (tags pushed with `GITHUB_TOKEN` never fire the tag event). Single job: check out the tag, verify it matches the package version, `npm ci --ignore-scripts`, run the workspace checks, publish with `--ignore-scripts`.

One-time release setup (repository/npm console, not code):

1. Publish `0.1.0` manually once with an authenticated `npm publish --workspace=@tunglam/pi-lark-cli` (npm requires the package to exist before a trusted publisher can be configured).
2. Create a GitHub environment named `npm-publish` whose deployment branches and tags allow `main` and tags matching `@tunglam/*`. Both publish workflows run in it.
3. On npmjs.com, configure each package's trusted publisher as repository `TungLamC/pi-packages`, the respective workflow file (`publish-pi-lark-cli.yml` / `publish-inline-skills.yml`), environment `npm-publish`, and select `npm publish` as the allowed action; enable "Require two-factor authentication and disallow tokens" for publishing access; then remove any temporary credentials.

Security boundary, stated honestly: publishing is exactly as trusted as push access to this repository — anyone who can push a `@tunglam/*` tag can publish. For this single-maintainer repository that actor is the npm owner anyway, so the defenses focus on the real threat: the unattended sync pipeline executing upstream code, which keeps strict job isolation (see below). If collaborators are ever added, branch protection requiring PRs on `main`, a tag ruleset restricting `@tunglam/*` release-tag creation, and environment required-reviewers become required.
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
npm test --workspace=@tunglam/pi-inline-skills
npm run typecheck --workspace=@tunglam/pi-inline-skills
pi -e ./packages/pi-inline-skills
```

Before committing, run `npm run check` and inspect the dry-run tarball whenever package metadata or the `files` allowlist changes.

## Registry and publishing safety

- Never run `npm publish`, change npm package access, create release tags, or modify trusted-publisher settings unless the user explicitly requests that external action.
- Public packages must publish only to `https://registry.npmjs.org/` and must declare that registry in `publishConfig`.
- Do not commit npm tokens, authentication-bearing `.npmrc` entries, provenance credentials, or other secrets.
- Prefer GitHub OIDC trusted publishing over long-lived npm write tokens when release automation is introduced.
- The unattended sync workflow must keep its job isolation: only jobs with `permissions: {}` may execute upstream install scripts or downloaded binaries, and its write job handles only verified artifact data without running any npm install or toolchain. Publish workflows and CI always install with `--ignore-scripts`. All actions are pinned to full commit SHAs.

## Git conventions

- Use Conventional Commit messages such as `feat:`, `fix:`, `docs:`, `test:`, and `chore:`.
- Stage files intentionally and keep generated archives, logs, `node_modules/`, and local-only experiments out of commits.
- Preserve unrelated user changes and do not rewrite history unless explicitly requested.
- A commit is ready only when relevant tests and type checks pass and `git diff --cached --check` reports no whitespace errors. Exception: `packages/pi-lark-cli/skills/**` is machine-vendored upstream content whose whitespace (including Markdown hard breaks) must not be normalized — check with `git diff --cached --check -- . ':(exclude)packages/pi-lark-cli/skills/**'`.
