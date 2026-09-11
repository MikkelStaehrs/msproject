# The stand-up narrows, and the grid stops moving

## What happened

Mikkel specified the three chapters directly: what is in the way, what we are
doing, what is next. Blockers on active work, all current active work, and the
sparks to go ahead with or drop. Everything the rules could see on work nobody
had started is gone.

Then, looked at on a laptop, the page read as uncoordinated, and the cause was
structural: it changed its own grid between chapters. One `.frame` with
`--frame-label` now runs the whole page.

## Worth knowing next time

**«Ready and untouched» was removed, and it is a real loss.** Planned work with
nothing in its way that nobody had picked up. It was the cheapest item on the
agenda and it was there precisely because it is invisible everywhere else. It is
also the one rule that could only ever fire on work nobody had started, which is
what the room decided not to discuss. If it comes back, it should come back
behind a choice about the status filter rather than as a rule underneath one.

**A literal reading of «all active tasks» was wrong**, and measuring said so.
`type === 'task'` gives two rows: eight nodes are active and only two are typed
task. Five of the rest are containers with active work underneath, which that
work represents. But one, `CT Scan / SeedInspector`, is active with nothing
active under it, and a type filter would have hidden real work with nothing below
it to stand in. The cut is the one `v_node_progress` already makes: the finest
level at which the work is described.

**Loose ends came in by a door nobody had closed.** `lib/loose-ends` reports
silence on `planned` work as well as active, which is right there and wrong on
this page. A planned task walked onto an agenda that had just been narrowed,
wearing the one label that was not filtered. Found by rendering the page, not by
reading the code, which is the second time that has been the difference today.

**The retrospective survives as one line, and not out of sentiment.**
`movement()` is the only thing that reads the meeting boundary. Delete it and
«We held it» becomes a button recording a date nobody looks at, and
`standup.held_on` stops earning its place.

**`--frame-label` exists now**, matching `--frame-margin`, which had always been
there for the other side. A page whose first column is a list rather than a label
had no way to say so, so the stand-up wrote its own grid at the call site, which
is what CLAUDE.md warns against. The absence of a way to say it is why the rule
got broken, and it is worth fixing that way round rather than just correcting the
page.

## Still open

- **Whether it now LOOKS right is unanswered.** The grid is consistent and that
  is measurable; the appearance is not checkable from here. The likely next
  complaint is density in the right-hand panel, which is a different problem and
  is solved by removing things rather than by moving them.
- Chapter three could not be checked against real data: sparks are private to
  their author, so the audit probe account sees none of the six.
