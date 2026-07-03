# steal-context

> Type **`/steal`** in one AI coding chat to pull the latest conversation context
> from the **other** tool. In ~50 ms. Nothing leaves your machine.

[![npm](https://img.shields.io/npm/v/steal-context.svg)](https://www.npmjs.com/package/steal-context)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## The problem this solves

You pay for **Cursor** (Claude Opus 4.8 via Ultra) but you also want to use
**GLM 5.2** — because it's cheap, has a huge context, and is often better for the
grindy long-running work Opus is too expensive for. Cursor doesn't support GLM 5.2,
so you use **Kilo Code + Fireworks.ai** for that.

Now you're paying for two great agents, and every time you switch, you re-explain
the entire task. The chats live in different apps and different storage formats
(Cursor's JSONL, Kilo's SQLite), so there is no shared memory.

`steal-context` fixes that in one command. Type `/steal` in Cursor to pull your
latest Kilo/GLM session in; type `/steal` in Kilo to pull your latest Cursor/Opus
session in. Same workspace, same task, different model — no re-explaining.

## What it does

Gives you a real **`/steal` slash command** you run *inside* a live chat. It:

- always steals from the **other** tool automatically (direction is baked into each command),
- finds the **latest session for the current project** and grabs a model-appropriate slice,
- resumes the conversation in **first person** so the receiving agent picks up where the last one left off (not a "let me catch up" briefing),
- is **fast** — for the two "hot" tools (Cursor, Kilo Code) it reads their session
  stores **directly** (~50 ms), instead of re-indexing every conversation you've ever had.

## Install

Requires **Node.js 22.5+**.

```bash
npm install -g steal-context
```

That's it. The installer automatically writes global `/steal` slash commands for **all
projects** — no per-repo setup, no second command:

- `~/.cursor/commands/steal.md` → `/steal` in Cursor pulls from Kilo Code
- `~/.config/kilo/commands/steal.md` → `/steal` in Kilo pulls from Cursor

### First time only (one-time, not per project)

| Tool | What to do | Why |
|---|---|---|
| **Cursor** | `Ctrl+Shift+P` → **Developer: Reload Window** | Cursor picks up new global commands after a reload |
| **Kilo Code** | Start a **new chat** | Kilo loads custom commands at session start |

After that, open any project and type **`/steal`**.

### Optional

```bash
steal-context init --force   # refresh slash-command templates after an upgrade
steal-context init --local   # also (or instead) install repo-local commands in cwd
steal-context doctor         # verify tool stores are detected
```

Skip auto-setup during install: `STEAL_SKIP_INIT=1 npm install -g steal-context`

## How it works

For **Cursor** and **Kilo Code**, `steal-context` reads the native session store
directly — no global index, no multi-minute rebuild:

```
/steal  (in Cursor)
   └─> steal-context run --from kilo-code --to cursor --format json
          └─ indexed SQLite query on ~/.local/share/kilo/kilo.db  → latest session for this project
   └─> prints resume banner + prior turns to the chat  (also saved to .steal/handoff.md)
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

`--preset` controls how much of the conversation comes across. `tool` is the
per-call cap on the tool *input* JSON; `result` is the cap on the tool *output*
the previous model saw (only available for tools that persist outputs locally —
see the caveat below).

| Preset | Messages | Tool-input cap | Tool-result cap | Good for |
|---|---|---|---|---|
| `minimal` | last 6 | 200 chars | 500 chars | quick nudge, tiny budget |
| `standard` | last 16 | 500 chars | 1500 chars | small handoffs |
| **`verbose`** (default) | last 40 | 2000 chars | 5000 chars | complex multi-file tasks — the sweet spot for Opus 4.8 / GLM 5.2 |
| `full` | everything | 8000 chars | 20000 chars | complete capture |

**Why `verbose` is the default:** Opus 4.8 has ~200K tokens of context and GLM 5.2
has ~128K. Even a 40-message handoff with rich tool output only fills ~10–20% of
that, leaving plenty of headroom for the receiving agent to actually work. Drop to
`standard` if you just want a short reminder.

## Handoff format (`--format`)

Two output shapes, same underlying session:

- **`markdown`** (default) — human-readable, well-suited to being pasted into
  a live chat. Each turn is a heading, tool calls render inline as
  `` `[tool:name]` `` followed by their input and (when available) an `_↳ result:_`
  line plus any unified diff in a fenced block.
- **`json`** — a fenced JSON code block containing the *normalized session*
  (Anthropic-style content-block form). The receiving model gets verbatim
  `tool` / `input` / `result` triples with preserved ordering, which is closer
  to what the previous agent actually saw than any human retell. Use this when
  the fidelity of tool observations matters (e.g. long refactors where the
  next agent needs to know exactly what a `read_file` returned).

Both formats are wrapped in the same provenance banner and saved to
`.steal/handoff.md`.

### Fidelity caveat: what each source tool actually persists

Not all tools store the same data locally. This determines the ceiling on
handoff fidelity, regardless of format:

| Source tool | User/assistant text | Tool calls (input) | Tool results (output) | Reasoning/thinking |
|---|---|---|---|---|
| **Kilo Code** | ✅ | ✅ | ✅ (incl. unified diffs) | ✅ |
| **Cursor**    | ✅ | ✅ | ❌ *(not persisted locally — materialized server-side)* | ❌ *(not persisted)* |

So a `kilo-code → cursor` handoff carries the previous agent's actual
observations, while `cursor → kilo-code` carries the previous agent's actions
and reasoning-in-text but not raw tool outputs. This is a limitation of
Cursor's on-disk format, not of `steal-context`.

## Commands

| Command | What it does |
|---|---|
| `steal-context run` | Extract the latest `--from` session (scoped to the current project) and print resume banner + handoff to stdout. Also writes `.steal/handoff.md`. |
| `steal-context init` | Install `/steal` slash commands. **Default: global** (all projects). `--local` for repo-only. Runs automatically on `npm install -g`. |
| `steal-context doctor` | Show detected tools/slugs (`continues scan`) + environment checks. |

### `init` flags

- `--local` install into the current repo (`.cursor/commands`, `.kilo/commands`) instead of globally
- `--a` / `--b` pick the two tools (default: cursor ⇄ kilo-code)
- `--preset` bake a preset into the slash command (default: verbose at run time)
- `--force` overwrite existing command files (use after upgrades to pick up template changes)
- `--runner <cmd>` command name in the slash templates (default `steal-context`)

### `run` flags

- `--from <tool>` source tool slug (default `kilo-code`)
- `--to <tool>` target tool slug (default `cursor`)
- `--preset <minimal|standard|verbose|full>` context budget (default `verbose`)
- `--format <markdown|json>` handoff shape (default `markdown`). `json` gives
  the receiving model verbatim tool inputs/outputs — highest fidelity, but only
  the direct readers (Cursor, Kilo Code) produce it; `continues` fallback
  targets always emit markdown.
- `--project <dir>` project to scope sessions to (default: cwd)
- `--out <file>` where to write the handoff (default `.steal/handoff.md`)

## Configuring a different pair of tools

`steal-context` piggybacks on `continues`' 16-tool support. Find valid slugs with
`steal-context doctor`, then:

```bash
steal-context init --local --a cursor --b cline
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
