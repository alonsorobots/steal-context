---
description: Resume from another AI coding tool (/steal or /steal kilo|claude|cursor)
argument-hint: [kilo|claude|cursor]
allowed-tools: Bash({{RUNNER}} *)
---

Resume from my most recent session in another AI coding tool.

**Slash args (optional source):** `$ARGUMENTS`

Do this now:

1. Resolve `--from` from the slash args above:
   - Empty / whitespace / the literal text `$ARGUMENTS` → use `auto`
   - Otherwise take the **first** whitespace-separated token (case-insensitive) and map:
     - `kilo` / `k` / `kilocode` / `kilo-code` → `kilo-code`
     - `claude` / `cc` / `claude-code` → `claude-code`
     - `cursor` / `c` → `cursor`
     - `auto` → `auto`
   - Anything else → stop and say the source was unrecognized (do not guess)

2. Run from the **project root** and read the **FULL stdout** (do not truncate).
   Start from this command and **only** replace the `--from` value with what you resolved
   (leave `--to` / other flags untouched):

```bash
{{COMMAND}}
```

3. The output is **your own prior turns** from that source — a resume banner naming the
   source, metadata, then the transcript. It also writes `.steal/handoff.md`. With `auto`,
   it picks whichever *other* tool you messaged most recently on this project.

4. Continue in **FIRST PERSON** from the last assistant turn, in the same voice. Do **NOT**
   summarize, re-orient, or say "let me catch up" / "I see" / "understood" — just say the
   next thing you would say. The user has not spoken again; they expect you to pick up
   where you left off.

5. Re-read any file before editing it — the file system may have changed since those turns
   were written.

If no session is found for this project in the chosen source, say so — don't guess.
