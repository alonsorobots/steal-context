# steal-context

> Type **`/steal`** in any AI coding chat to pull in the conversation you were
> just having in another tool. Auto-detects the source from your last *human*
> message — or pin one with `/steal kilo`. ~50 ms. Nothing leaves your machine.

[![npm](https://img.shields.io/npm/v/steal-context.svg)](https://www.npmjs.com/package/steal-context)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## The problem this solves

You use more than one AI coding tool — say **Cursor**, **Kilo Code**, and
**Claude Code** — because each is better for different work. Every time you
switch, you re-explain the entire task. The chats live in different apps and
storage formats, so there's no shared memory between them — until now.

## Quick start

```bash
npm install -g steal-context
```

Requires **Node.js 22.5+**. The installer writes a global `/steal` command for
every known tool (all projects, no per-repo setup):

| Path | Tool |
|---|---|
| `~/.cursor/commands/steal.md` | Cursor |
| `~/.config/kilo/commands/steal.md` | Kilo Code |
| `~/.claude/commands/steal.md` | Claude Code |

**One-time after install** (per tool, not per project):

| Tool | What to do |
|---|---|
| **Cursor** | `Ctrl+Shift+P` → **Developer: Reload Window** |
| **Kilo Code** | Start a **new chat** |
| **Claude Code** | Restart, or run `/hooks` once |

Then, in any project, in any of those tools:

| You type | What happens |
|---|---|
| `/steal` | Pull from whichever *other* tool you messaged most recently here |
| `/steal kilo` (or `k`) | Force Kilo Code |
| `/steal claude` (or `cc`) | Force Claude Code |
| `/steal cursor` (or `c`) | Force Cursor |

Same aliases on the CLI:

```bash
steal-context run --from auto --to cursor          # what bare /steal does
steal-context run --from kilo --to cursor          # pin a source
steal-context run --from claude --to kilo-code
```

## What it does

- **Auto-detects the source** — ranks by your last *human* turn, not by
  whichever agent's store was last written. A still-running agent in tool A
  won't beat tool B after you've already switched and typed there.
- **Optional pin** — `/steal kilo` (etc.) when you know which chat you want.
- **Project-scoped** — only sessions for the current working directory.
- **First-person resume** — the receiving agent continues as itself, not as a
  fresh assistant being briefed ("let me catch up…").
- **Fast** — direct readers for Cursor / Kilo / Claude Code (~50 ms). No
  full-history re-index.
- **Local-only** — reads session stores read-only; nothing is uploaded.

## How it works

```
/steal          (or /steal kilo)
   └─> steal-context run --from auto|kilo-code --to <current-tool>
          └─ for each other known, installed tool with a direct reader:
               • find this project's latest session
               • score by last human turn (fallback: store mtime)
          └─ Cursor:     JSONL under ~/.cursor/projects/...
          └─ Kilo Code:  SQLite  ~/.local/share/kilo/kilo.db
          └─ Claude Code: JSONL under ~/.claude/projects/... (match by cwd)
   └─> prints resume banner + prior turns  (also .steal/handoff.md)
```

| Tool | How it's read | Location |
|---|---|---|
| Cursor | direct JSONL | `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl` |
| Kilo Code | direct SQLite | `~/.local/share/kilo/kilo.db` |
| Claude Code | direct JSONL, matched by each record's `cwd` | `~/.claude/projects/*/*.jsonl` |
| ~13 other tools | via [`continues`](https://github.com/yigitkonur/cli-continues) | explicit `--from <tool>` only (not in `auto`) |

**Claude Code is the same store everywhere.** Terminal CLI, VS Code / Cursor /
JetBrains extensions, and the desktop app all write to `~/.claude/projects/`
under your OS user — so stealing to/from Claude Code works regardless of which
surface you were in.

## After upgrading

Templates change over time (new aliases, clearer prompts). Refresh them:

```bash
steal-context init --force
```

Then reload/restart each tool once (same one-time steps as install).

Other useful commands:

```bash
steal-context init --local                 # also install into this repo
steal-context init --only cursor,kilo-code # limit which tools get /steal
steal-context doctor                       # see detected tools / continues scan
```

Skip auto-setup during install: `STEAL_SKIP_INIT=1 npm install -g steal-context`

## Presets (context budget)

`--preset` controls how much of the conversation comes across. `tool` caps the
tool *input* JSON; `result` caps the tool *output* the previous model saw
(only when the source persists outputs — see fidelity below).

| Preset | Messages | Tool-input cap | Tool-result cap | Good for |
|---|---|---|---|---|
| `minimal` | last 6 | 200 | 500 | quick nudge |
| `standard` | last 16 | 500 | 1500 | short handoffs |
| **`verbose`** (default) | last 40 | 2000 | 5000 | multi-file work — sweet spot for frontier context windows |
| `full` | everything | 8000 | 20000 | complete capture |

## Handoff format (`--format`)

- **`markdown`** (default) — readable paste-into-chat shape.
- **`json`** — fenced normalized session (Anthropic-style content blocks) with
  verbatim tool input/output when available. Used automatically when the
  destination is Cursor (its own store doesn't keep tool results, so JSON
  preserves whatever richer detail the *source* had).

Both are wrapped in the same provenance banner and saved to `.steal/handoff.md`.

### What each source actually persists

| Source | Text | Tool inputs | Tool results | Reasoning |
|---|---|---|---|---|
| **Kilo Code** | ✅ | ✅ | ✅ (incl. diffs) | ✅ |
| **Claude Code** | ✅ | ✅ | ✅ | ✅ |
| **Cursor** | ✅ | ✅ | ❌ (server-side only) | ❌ |

A handoff *from* Kilo or Claude Code carries the previous agent's observations;
one *from* Cursor carries actions/text but not raw tool outputs. That's the
source tool's on-disk format, not a steal-context limitation.

## CLI reference

| Command | What it does |
|---|---|
| `steal-context run` | Extract the `--from` session for this project; print handoff; write `.steal/handoff.md` |
| `steal-context init` | Install `/steal` (default: global, all known tools, `--from auto` + optional args) |
| `steal-context doctor` | Detected tools/slugs + environment checks |
| `steal-context help` | Same text as `--help` |

### `run` flags

- `--from <tool>\|auto` — source slug or alias (`kilo`/`k`, `claude`/`cc`,
  `cursor`/`c`). `auto` = most recent human turn among other known tools.
  (If you omit `--from` entirely on the CLI, the legacy default is `kilo-code`;
  bare `/steal` always uses `auto`.)
- `--to <tool>` — destination slug (default `cursor`)
- `--preset <minimal\|standard\|verbose\|full>` — context budget (default `verbose`)
- `--format <markdown\|json>` — handoff shape (default `markdown`)
- `--project <dir>` — project scope (default: cwd)
- `--out <file>` — handoff path (default `.steal/handoff.md`)

### `init` flags

- `--local` — install into the current repo instead of globally
- `--only <tool1,tool2,...>` — limit which tools get `/steal`
- `--a` / `--b` — legacy fixed two-tool pairing (replaces `auto`; prefer aliases)
- `--preset` — bake a preset into the slash command
- `--force` — overwrite existing command files (use after upgrades)
- `--runner <cmd>` — binary name in templates (default `steal-context`)

## FAQ

**`/steal` picked the wrong tool.**  
Auto ranks by last *human* message. If two chats are close in time, pin the
source: `/steal kilo`, `/steal claude`, or `/steal cursor`.

**I upgraded and `/steal` still looks old.**  
Run `steal-context init --force`, then reload/restart the tool.

**Can I steal a specific older chat, not the latest one?**  
Not yet — it's always the latest session for that tool in this project. Pinning
a tool (`/steal kilo`) is supported; picking by session title/id is not.

**Does anything leave my machine?**  
No. Session files are read locally, read-only.

## Other tools via `continues`

For agents without a direct reader, explicit `--from <tool>` falls back to
[`continues`](https://github.com/yigitkonur/cli-continues) (MIT). Find slugs with
`steal-context doctor`. Example of the legacy fixed pair install:

```bash
steal-context init --local --a cursor --b cline
```

`--from auto` only considers direct readers (`cursor`, `kilo-code`,
`claude-code`), because availability/recency aren't cheap to check through
`continues`.

### Why not only use `continues`?

`continues` is excellent and powers the fallback. Its native flow is a terminal
CLI that launches the destination tool and, on a cold run, can re-index every
session across every tool. `steal-context` is the in-chat `/steal` UX on top:
pull into your *current* session, direct-read when possible (~instant).

## Environment overrides

- `STEAL_KILO_DB` — Kilo SQLite DB (default `~/.local/share/kilo/kilo.db`)
- `STEAL_CURSOR_PROJECTS` — Cursor projects dir (default `~/.cursor/projects`)
- `STEAL_CLAUDE_PROJECTS` — Claude Code projects dir (default `~/.claude/projects`)
- `STEAL_SKIP_INIT=1` — skip writing slash commands on `npm install -g`

## Contributing

Tool support is registry-driven — add a reader and it joins `--from auto` and
`init` automatically:

1. `src/readers/<tool>.mjs` — export `SOURCE`, `DISPLAY`, `available()`, and
   `latest(project, {limit})` returning a normalized session (see
   `src/format.mjs`). Prefer setting `lastUserAt` (ms of the last real human
   turn) so auto-ranking stays correct when an agent is still writing.
2. Register in `TOOLS` (`src/tools.mjs`) and `DIRECT_READERS` (`src/steal.mjs`),
   and add short aliases to `TOOL_ALIASES` when useful.
3. Add `templates/<tool>-steal.md` — keep the body source-agnostic (`auto`
   resolves at run time). Support `$ARGUMENTS` for optional `/steal <alias>`.

```bash
npm test   # synthetic fixtures only — no real session data
```

## License

MIT. Falls back to [`continues`](https://github.com/yigitkonur/cli-continues)
(MIT © Yigit Konur) for non-native tools.
