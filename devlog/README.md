# Devlog

One file per working session. Named `YYYY-MM-DD-slug.md`, the same shape as
`supabase/migrations/`, and for the same reason: two people on two machines can
both add one without ever touching the same file, so there is nothing to merge.

There is deliberately no index. An index is a single file every entry has to
edit, which is exactly the conflict the directory avoids. To catch up, read the
last few:

```bash
ls devlog | tail -5
```

## What belongs here

Not what changed. `git log` already says that, and says it better.

What belongs here is what git cannot reconstruct: **why** a thing was done that
way, **what was tried and rejected**, and **what is still in flight**. The test is
whether the next agent, on a different machine with no memory of this session,
would repeat a mistake or undo a decision without it. If yes, write it down.

Standing facts that will be true next month do not belong here either. Those go
in [CLAUDE.md](../CLAUDE.md) if every agent needs them before the first edit, or
in [MASTER.md](../MASTER.md) if they are part of the design. The devlog is the
record of a day, and it is allowed to go stale.

## Shape

Keep it short. A long entry does not get written, and the project's own thesis is
that anything taking more than a few seconds stops happening by week three.

```markdown
# Short title, the thing that actually happened

## What happened
A paragraph or a short list. Link commits by hash where it helps.

## Worth knowing next time
The traps. The thing that looked like one problem and was another.

## Still open
What was left undone, and whether it was a decision or a blocker.
```

Leave out a section that has nothing in it rather than writing "none".
