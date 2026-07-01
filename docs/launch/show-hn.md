# Show HN post

**Title (80 chars max, no marketing fluff — HN style):**

Show HN: Steal-context – /steal in Cursor pulls in your latest Kilo/GLM chat

Alt titles to A/B in your head:
- Show HN: `/steal` command to share context between Cursor and Kilo Code
- Show HN: Bridge your Cursor (Opus) and Kilo (GLM 5.2) chats with one slash command

**Body (paste into the "url" field: https://github.com/alonsorobots/steal-context ;
put this text in the comment box):**

I pay for Cursor Ultra to use Claude Opus 4.8, but for grindy long-running work I
want GLM 5.2 (cheap, huge context) — which Cursor doesn't support. So I run Kilo
Code + Fireworks for that. Two great agents, but every switch means re-explaining
the whole task, because the chats live in different apps and different formats
(Cursor's JSONL vs Kilo's SQLite).

`steal-context` installs a `/steal` slash command in both. Type `/steal` in Cursor
and it pulls your latest Kilo session for the current project into the chat; type
it in Kilo and it pulls your latest Cursor session in. Direction is baked in — no
arguments. Runs in ~50 ms because it reads each tool's session store directly,
instead of re-indexing every conversation you've ever had.

Nothing leaves your machine. It's a ~13 KB npm package, MIT, one dependency
(`continues`, also MIT — which handles the 14 other tools it can bridge if you
don't use Cursor/Kilo).

Provenance is preserved: the receiving agent sees a "STOLEN CONTEXT — from your
latest Kilo Code (model: glm-5.2) chat" banner and treats the block as historical,
not ground truth. Default handoff is 40 messages of rolling window sized for Opus
4.8 / GLM 5.2's context; adjustable per call.

Install:
    npm i -g steal-context
    cd your-project
    steal-context init
    # then /steal in either tool

Repo: https://github.com/alonsorobots/steal-context
npm: https://www.npmjs.com/package/steal-context

Happy to talk about the design tradeoffs — the hardest part was realizing the
"read every tool's index" approach in existing tools takes minutes on cold cache,
so I wrote direct fast paths for Cursor's JSONL agent-transcripts and Kilo's
SQLite. Would love PRs adding fast readers for Cline, Roo, Codex, or Claude Code.
