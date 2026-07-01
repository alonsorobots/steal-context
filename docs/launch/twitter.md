# Twitter / X posts

Pick a lead tweet, then reply-thread with one or two follow-ups. Tag the
communities that actually care (Fireworks, Kilo, Cursor).

## Lead — recommended

I built `/steal`.

You pay for Cursor Ultra for Opus 4.8.
You pay for Fireworks + Kilo Code for GLM 5.2.
Cursor still doesn't do GLM, so you use both — and re-explain the task every time
you switch.

Type `/steal` in either. In ~50 ms it pulls in the other's latest chat.

npm i -g steal-context
github.com/alonsorobots/steal-context

## Reply 1 (design)

The two apps store chats in totally different places — Cursor keeps JSONL
transcripts under ~/.cursor, Kilo Code keeps a SQLite DB under
~/.local/share/kilo/kilo.db. `steal-context` reads each directly, scoped to the
current project, so the handoff is instant instead of the several-minute reindex
existing tools do.

## Reply 2 (positioning)

Not a fork of Kilo, not a Cursor plugin. It's a ~13 KB MIT npm package that just
drops slash-command files into `.cursor/commands/` and `.kilo/commands/`. Falls
back to @yigitkonur's excellent `continues` (also MIT) for 14 other agents.

## Reply 3 (call to action)

Wire up:

    npm i -g steal-context
    cd your-project && steal-context init

Then /steal in either tool. Works with Opus 4.8, GLM 5.2, and everything else
Cursor / Kilo will let you run.

## Handles / hashtags worth tagging

- @cursor_ai
- @kilocode  (Kilo Code)
- @FireworksAI_HQ
- @Zai_org  (Z.AI, makers of GLM)
- #GLM #ClaudeCode #Cursor #KiloCode #AICoding

Don't stuff more than 2-3 handles per tweet or reach dies.
