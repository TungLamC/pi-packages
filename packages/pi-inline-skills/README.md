# pi-inline-skills

Codex-style inline `$skill` references for the [pi coding agent](https://pi.dev).

Reference a skill **anywhere** in your prompt — start, middle, several at once — and the full
`SKILL.md` body is injected alongside your message. Your original text is never rewritten.

```
you type:   Use $example to help me with X
model sees: ① your message, verbatim ($ token kept)
            ② a companion message with the skill body:

<skill>
<name>example</name>
<path>/abs/path/example/SKILL.md</path>
...SKILL.md body, frontmatter stripped...
</skill>
```

## Install

```bash
pi install npm:pi-inline-skills
```

Requires pi **>= 0.79.1** (extension autocomplete `triggerCharacters` support).

## Features

- **`$` autocomplete** at any whitespace boundary, backed by pi's discovered skill list.
- **Codex-shaped injection**: same `<skill><name><path>` fragment codex uses, but the body has
  frontmatter intentionally stripped.
- **Multiple mentions** per message; each becomes its own `<skill>` block in one companion message.
- **Reminder dedup** (default on): if a skill's full body is already in the active session context,
  a re-mention injects a one-line reminder instead. Edits to `SKILL.md` (mtime change), compaction,
  or switching to a branch without the injection all restore full injection automatically.
- **Visible receipt**: a collapsed aside under your message shows what was injected and its token
  cost (expand for the raw XML). Toggle with `display off`.

## Configuration

These are user preferences, so config is a single user-level file in your pi agent dir —
`~/.pi/agent/inline-skills.json` (or `~/.pilot/agent/inline-skills.json` on rebranded
distributions), the same place other extensions keep their config. Both keys default to `true`:

```json
{ "reminderDedup": true, "display": true }
```

Session-scoped toggles (do not persist):

```
/inline-skills reminder on|off
/inline-skills display on|off
```

pi has no channel for extension config inside its own `settings.json`, so this file is the
idiomatic home — matching e.g. `zentui.json` in the same directory.

## How it relates to native `/skill:name`

They coexist. Native `/skill:name` only works at the very start of a message and replaces your
text with the skill body. `$name` works anywhere and keeps your text intact. Use whichever fits.

## Comparison

| | codex `$skill` | pi native `/skill:` | pi-inline-skills |
|---|---|---|---|
| Position | anywhere | message start only | anywhere |
| User text | preserved | replaced | preserved |
| Body | raw file (frontmatter included) | frontmatter stripped | frontmatter stripped |
| Multiple per message | yes | no | yes |
| Cross-turn dedup | no (per turn only) | n/a | yes (reminder) |

## Known limitations

- Messages queued while the agent is streaming (steer / follow-up) do not pass through
  `before_agent_start`, so `$` mentions in them are not injected — idle turns only.
- Mentions resolve by plain name against the discovered skill list; there is no structured
  path binding (codex's linked-mention disambiguation). Ambiguous duplicate names resolve to
  the first discovered skill.
- Autocomplete is TUI-only. Injection still applies to prompts submitted from any client
  (RPC / GUI), since it runs in the backend.

## Development

```bash
npm install
npm test
npm run typecheck
```

Design references: [codex](https://github.com/openai/codex) skill fragments,
[pi-skillrefs](https://github.com/pyronaur/pi-skillrefs) (MIT) for the injection/receipt
architecture, and [mention-skills](https://github.com/sids/pi-extensions) (MIT) for the
mention grammar.

## License

MIT
