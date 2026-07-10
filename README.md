# pi-packages

Personal monorepo for independently published [Pi](https://pi.dev) packages.

## Packages

| Package | Description | Install |
| --- | --- | --- |
| [`@tunglam/pi-inline-skills`](packages/pi-inline-skills) | Codex-style inline `$skill` references for Pi | `pi install npm:@tunglam/pi-inline-skills` |

Each directory under `packages/` is an independent npm package with its own version and Pi manifest. The repository root is private and is not itself a Pi package.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run check
npm run pack:dry-run
```

Run a command for one workspace:

```bash
npm test --workspace=@tunglam/pi-inline-skills
npm run typecheck --workspace=@tunglam/pi-inline-skills
```

Test a package directly with Pi:

```bash
pi -e ./packages/pi-inline-skills
```

## Publishing

Packages are versioned and published independently through package-specific GitHub OIDC workflows.
After the package version is committed and CI passes, push an annotated tag matching the full npm
package name and version, such as `@tunglam/pi-inline-skills@0.1.3`.

## License

MIT. See each package for package-specific attribution.
