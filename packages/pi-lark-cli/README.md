# @tunglam/pi-lark-cli

Lark/Feishu for the [pi coding agent](https://github.com/badlogic/pi-mono): one install gives you the official [lark-cli](https://github.com/larksuite/cli) binary for your platform plus the full set of official `lark-*` agent skills, with the CLI and skill versions always matching.

## Install

```bash
pi install npm:@tunglam/pi-lark-cli
```

Install **without a version suffix** — pi permanently pins versioned specs and skips them during `pi update`.

What you get:

- `lark-cli` available in every pi bash call (the package prepends its own launcher to `PATH` at session start).
- All official skills (`lark-im`, `lark-doc`, `lark-base`, `lark-calendar`, …) vendored from the exact upstream release that matches the bundled CLI.
- A `/lark-cli` command showing the active binary, versions, and any conflicting installation.

First-time setup (once per machine):

```bash
lark-cli config init --new
lark-cli auth login
```

Authorization is stored in `~/.lark-cli/` and is shared with any other lark-cli installation for the same user (and the same `LARKSUITE_CLI_CONFIG_DIR`, if you override it).

## Versioning

The package version is independent; the bundled upstream version is recorded in the `larkCliVersion` field of `package.json` and pinned exactly in `dependencies`. An hourly GitHub workflow tracks upstream releases: it vendors the release's `skills/` tree, pins the matching `@larksuite/cli`, and publishes a new package version.

Update with:

```bash
pi update npm:@tunglam/pi-lark-cli
```

`lark-cli update` and `lark-cli install` are intentionally disabled in the bundled launcher: they would create a separate global installation and break the CLI/skill version pairing. The CLI's own update notifications are silenced for the same reason.

## Coexisting with a global lark-cli

If you also installed lark-cli globally (for other agents), both can coexist: inside pi the bundled binary wins on `PATH`; outside pi your global one is untouched. The extension shows a one-time notice when it detects this. To keep a single installation:

- Use only the global one: `pi remove npm:@tunglam/pi-lark-cli`
- Use only this package: `npm rm -g @larksuite/cli`, and if you had installed lark skills into `~/.pi/agent/skills/` or `~/.agents/skills/`, block them in `~/.pi/agent/settings.json` with `"skills": ["!skills/lark-*"]`

Note pi gives local skills precedence over package skills by design: a same-name skill in your global or project skill directories overrides the vendored one.

## Platform support

Prebuilt upstream binaries: macOS (x64, arm64), Linux (x64, arm64, riscv64), Windows (x64, arm64). The binary is downloaded on first install (or first call) from GitHub Releases with an npmmirror fallback, so initial use needs network access. A few skills ship helper scripts that need `python3` (and `pandas` for spreadsheet dataframes); they are optional.

## License

MIT. The vendored `skills/` tree is © Lark Technologies Pte. Ltd., MIT-licensed; see `UPSTREAM_LICENSE`.
