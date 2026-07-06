---
description: Resume from your latest {{FROM_DISPLAY}} session for this project
---

Resume from my latest {{FROM_DISPLAY}} session for this project.

Do this now:

1. Run from the **project root** and read the **FULL stdout** (do not truncate):

```bash
{{COMMAND}}
```

2. The output is **your own prior turns** in this session — a resume banner, metadata, then the transcript. It also writes `.steal/handoff.md`.

3. Continue in **FIRST PERSON** from the last assistant turn, in the same voice. Do **NOT** summarize, re-orient, or say "let me catch up" / "I see" / "understood" — just say the next thing you would say. The user has not spoken again; they expect you to pick up where you left off.

4. Re-read any file before editing it — the file system may have changed since those turns were written.

If no {{FROM_DISPLAY}} sessions exist for this project, say so — don't guess.
