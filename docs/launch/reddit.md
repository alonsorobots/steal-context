# Reddit posts

Post to a couple of these; don't blast all at once (spam filter).

## r/cursor  (primary target — 100% relevant audience)

**Title:** I built `/steal` — a Cursor slash command that pulls in your latest Kilo Code / GLM chat

**Body:**

Cursor doesn't ship GLM 5.2 (or any Fireworks models), so a lot of us use Cursor
for Opus 4.8 and something like Kilo Code + Fireworks for GLM. Great — until you
want to move between them mid-task and end up re-explaining the whole context.

I wrote a tiny MIT tool that installs a `/steal` slash command in both editors.
In Cursor, `/steal` pulls in your most recent Kilo session for the current
project; in Kilo, `/steal` pulls in your most recent Cursor session. Direction is
baked in — no arguments to remember. About 50 ms per call because it reads each
tool's session store directly (Cursor's JSONL under
`~/.cursor/projects/<slug>/agent-transcripts/`, Kilo's SQLite under
`~/.local/share/kilo/kilo.db`) instead of scanning your whole history.

Install:

    npm i -g steal-context
    cd your-project
    steal-context init

Then `/steal` in either tool.

Everything is local, read-only, MIT-licensed. Default handoff is 40 messages
sized for Opus/GLM's context windows, adjustable.

Repo: https://github.com/alonsorobots/steal-context

Curious if others hit the same workflow gap and if there are other Cursor pairings
worth supporting fast (Cline, Claude Code, Codex, etc.).

---

## r/LocalLLaMA  (secondary — GLM users care about this)

**Title:** GLM 5.2 users: `/steal` command to move context between Kilo Code (GLM) and Cursor (Opus)

**Body:**

If you use GLM 5.2 through Kilo Code + Fireworks alongside Cursor (because Cursor
still doesn't do Fireworks), this might save you a bunch of re-explaining.

`steal-context` is a tiny MIT tool that installs a `/steal` slash command in
both editors. Type it in either one and it pulls the latest chat from the other,
scoped to the current project, in about 50 ms. All local, all read-only, no
cloud round-trip.

I use it to plan/architect with Opus in Cursor, then hand off to GLM 5.2 in Kilo
for the long grindy execution work, then `/steal` back to Cursor if I need Opus
to review or refactor. The two agents share a rolling ~40-message window with
tool activity preserved.

Install:

    npm i -g steal-context && cd project && steal-context init

Repo: https://github.com/alonsorobots/steal-context

If anyone runs GLM 5.2 through OpenCode or Cline instead of Kilo, PRs adding
fast readers for those are very welcome.

---

## r/ClaudeAI  (tertiary — a mention, not a full post)

Reply on relevant threads about "Claude vs GLM" or "Cursor plus another tool"
with a one-liner:

> I switch between Cursor (Opus 4.8) and Kilo Code (GLM 5.2 via Fireworks) mid-task
> — built a `/steal` slash command that pulls the latest chat from the other tool
> into the current one. https://github.com/alonsorobots/steal-context

---

## r/programming  (only if it takes off elsewhere first)

Same as Show HN post — programmers on Reddit don't reward Show-HN-style posts as
well; better to let HN pick it up and then post the discussion link here.
