# steal-context

> Type **`/steal`** in one AI coding chat to pull the latest conversation context
> from the **other** tool — e.g. Cursor (Claude Opus 4.8) ⇄ Kilo Code (GLM 5.2) — and
> keep working without re-explaining anything.

[![npm](https://img.shields.io/npm/v/steal-context.svg)](https://www.npmjs.com/package/steal-context)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`steal-context` gives you a real **`/steal` slash command** you run *inside* a live
chat. It:

- always steals from the **other** tool automatically (direction is baked into each command),
- finds the **latest session for the current project** and grabs a model-appropriate slice,
- prints a **provenance banner** so the receiving agent knows this is historical context from a different tool,
- is **fast** — for the two "hot" tools (Cursor, Kilo Code) it reads their session
  stores **directly** (~50 ms), instead of re-indexing every conversation you've ever had.

## Install

Requires **Node.js 22.5+**.

```bash
npm install -g steal-context
```

Then, inside a project you use with both tools:

```bash
steal-context init
```

That writes two slash commands (default bridge is **Cursor ⇄ Kilo Code**):

- `.cursor/commands/steal.md` → `/steal` in Cursor steals from Kilo Code
- `.kilo/commands/steal.md` → `/steal` in Kilo steals from Cursor

Now type `/steal` in either tool.

### Notes on how each tool picks up the command

- **Cursor** hot-reloads `.cursor/commands/`. Just open a chat and type `/steal`.
  If autocomplete doesn't show it, `Cmd/Ctrl+Shift+P → "Developer: Reload Window"`.
- **Kilo Code** loads custom commands **at the start of a new session**. After
  `steal-context init`, start a **new Kilo chat** — `/steal` will appear in the
  command picker with the description "Steal the latest Cursor chat context…".

## How it works

For **Cursor** and **Kilo Code**, `steal-context` reads the native session store
directly — no global index, no multi-minute rebuild:

```
/steal  (in Cursor)
   └─> steal-context run --from kilo-code --to cursor
          └─ indexed SQLite query on ~/.local/share/kilo/kilo.db  → latest session for this project
   └─> prints "STOLEN CONTEXT" banner + handoff to the chat  (also saved to .steal/handoff.md)
```

| Source tool | How it's read | Location |
|---|---|---|
| Kilo Code | direct SQLite query | `~/.local/share/kilo/kilo.db` |
| Cursor | direct JSONL read | `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` |
| any of 14 other tools | via [`continues`](https://github.com/yigitkonur/cli-continues) (fallback) | — |

For any other tool, it falls back to [`continues`](https://github.com/yigitkonur/cli-continues)
(MIT), which knows how to parse all 16 supported agents. The receiving agent reads
the output and continues the task. Nothing is uploaded anywhere — everything is read
locally, read-only.

## Presets (context budget)

`--preset` controls how much of the conversation comes across:

| Preset | Messages | Tool-output cap | Good for |
|---|---|---|---|
| `minimal` | last 6 | 200 chars | quick nudge, tiny budget |
| `standard` | last 16 | 500 chars | small handoffs |
| **`verbose`** (default) | last 40 | 2000 chars | complex multi-file tasks — the sweet spot for Opus 4.8 / GLM 5.2 |
| `full` | everything | 8000 chars | complete capture |

**Why `verbose` is the default:** Opus 4.8 has ~200K tokens of context and GLM 5.2
has ~128K. Even a 40-message handoff with rich tool output only fills ~10–20% of
that, leaving plenty of headroom for the receiving agent to actually work. Drop to
`standard` if you just want a short reminder.

## Commands

| Command | What it does |
|---|---|
| `steal-context run` | Extract the latest `--from` session (scoped to the current project) and print banner + handoff to stdout. Also writes `.steal/handoff.md`. |
| `steal-context init` | Install `/steal` into both tools of a bridge. `--a`/`--b` pick the two tools, `--preset`, `--runner`, `--force`. |
| `steal-context doctor` | Show detected tools/slugs (`continues scan`) + environment checks. |

### `run` flags

- `--from <tool>` source tool slug (default `kilo-code`)
- `--to <tool>` target tool slug (default `cursor`)
- `--preset <minimal|standard|verbose|full>` context budget (default `verbose`)
- `--project <dir>` project to scope sessions to (default: cwd)
- `--out <file>` where to write the handoff markdown (default `.steal/handoff.md`)

## Configuring a different pair of tools

`steal-context` piggybacks on `continues`' 16-tool support. Find valid slugs with
`steal-context doctor`, then:

```bash
steal-context init --a cursor --b cline
```

Currently only `cursor` and `kilo-code` use the fast direct reader; other pairs
route through `continues` (still works, just slower on a cold cache).

## Why not just use `continues`?

[`continues`](https://github.com/yigitkonur/cli-continues) is excellent and powers
the fallback path. But its native flow is a terminal CLI that **launches** the
destination tool, and on a cold run it re-indexes *every* session across *every*
tool — which can take minutes as your history grows. `steal-context` reframes it as
an in-chat `/steal` that pulls from the other tool into your *current* session, and
for the common Cursor⇄Kilo case reads the store directly so it's ~instant. If you
don't want the slash-command ergonomics, use `continues` directly.

## Environment overrides

If your Kilo or Cursor stores live somewhere unusual:

- `STEAL_KILO_DB` — path to Kilo's SQLite DB (default `~/.local/share/kilo/kilo.db`)
- `STEAL_CURSOR_PROJECTS` — Cursor's projects dir (default `~/.cursor/projects`)

## Contributing

The project is small on purpose. If you want to add a fast direct reader for
another tool (Cline, Roo, Codex, Claude Code…), the shape is:

1. Add a module in `src/readers/<tool>.mjs` exporting `SOURCE`, `DISPLAY`,
   `available()`, and `latest(project, {limit})` returning a normalized session.
2. Register it in the `DIRECT_READERS` map in `src/steal.mjs`.

Everything else — banner, presets, provenance — is shared.

## License

MIT. Falls back to [`continues`](https://github.com/yigitkonur/cli-continues) (MIT © Yigit Konur) for non-native tools.
