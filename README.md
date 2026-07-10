# pi-packages

Personal monorepo for independently published [Pi](https://pi.dev) packages.

## Packages

| Package | Description | Install |
| --- | --- | --- |
| [`pi-inline-skills`](packages/pi-inline-skills) | Codex-style inline `$skill` references for Pi | `pi install npm:pi-inline-skills` |

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
npm test --workspace=pi-inline-skills
npm run typecheck --workspace=pi-inline-skills
```

Test a package directly with Pi:

```bash
pi -e ./packages/pi-inline-skills
```

## Publishing

Packages are versioned and published independently:

```bash
npm publish --workspace=pi-inline-skills --access public --registry=https://registry.npmjs.org/
```

Publishing is manual until a trusted GitHub OIDC release workflow is added.

## License

MIT. See each package for package-specific attribution.
