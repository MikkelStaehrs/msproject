# Narrowing the thing, and three times I was wrong

## What happened

The afternoon was a refactor with a stated purpose behind it, given by Mikkel in
his own words: an idea gets captured, stress tested, categorised and entered, so
that everybody ends up working towards the same thing. Not documentation for its
own sake.

Built: the gate a spark passes before it becomes work, a third way out for a
thought that was never work, the strategy marking asked at the moment of
promotion, the COGS payback limit, confirmation on the yardstick, one place for a
strategy's target, a FAQ in front of the guide, and the target picker able to
open what it finds. Removed: `node.category`, `reporting.priority`, and a
duplicated project number field.

## Worth knowing next time

**The database holds TEST DATA, not usage.** This is the one that cost most. I
read `entry = 2`, `decision = 0`, `cost = 0` as behaviour and built an argument
on it: the capture habit works, the logging habit does not, things with deferred
payoff go unused. It was confident, it was repeated, and it was measuring
nothing. The application is not in production and most of what is in it was put
there to try things out.

Findings about the MODEL survive that mistake, because they are about the schema
rather than about what anybody did: two words for one priority, four axes for
classifying work, a field rendered twice. Findings about the USE do not. Do not
count rows and conclude something about habits.

**The purpose statement killed a feature I was minutes from building.** UBS
Projects is very heavy on the leadership end and holds nothing about tasks or
process; Task Studio exists for the people doing the work daily. An ELT reporting
page in here would be a second version of the thing UBS is good at, which is
`project_no` all over again one level up. It was designed and agreed before that
came out. If the transcript suggests building it, this is why it was dropped.

**A root project is not a strategy**, and that disagreement is settled rather
than open. It was put to me that the top of the hierarchy is in most cases a
strategy. In this model a strategy cuts SIDEWAYS: COGS saving is fed by parts of
several unrelated projects, which is why the marking sits on any node and not on
the root. Collapse the two and the strategy page cannot do the one thing it
exists for. A root project is large and long running, which is a statement about
scale.

**I asserted three things before tracing the code, and all three were wrong.**
`project_no` "is written nowhere", when `EDITABLE_ADMIN_FIELDS` is the whole list
including it. `idea` and `planned` "are indistinguishable", when `loose-ends`
treats them differently and coherently. And the usage reading above. The pattern
is the same each time: a grep that looked conclusive, and no follow of the call
to its end. Grep finds the name, it does not find the meaning.

**A scripted replace failed silently and I did not notice**, on the same day the
whole morning went on a diagnostic that named one cause out of two. Every
scripted edit now asserts its match count before writing. The one that later
failed loudly, and was fixed in seconds, is the argument.

**Migrations are no longer pasted by hand.** `SUPABASE_TOKEN` reaches the
Management API and `npm run migrate` applies what is pending, dry by default.
CLAUDE.md has the mechanics. The judgement worth keeping: the value of the old
way was never the pasting. Two migrations failed review that day before they ever
ran, one where a variable collided with the real column `node.owner` and one
where `create or replace` cannot change a return type, and reading caught both.
A runner removes the waiting and not the reading, and the temptation it brings is
to run, patch, run until it stops complaining.

## Still open

- **The denominator is still the narrow one.** 266 253 is In-house only; the euro
  covers the whole company's sugar beet seed. One click on In-License on the same
  dashboard fixes it. Until then the target is a floor and every share of it
  reads high, and the pages say so.
- **The euro rate was accepted, not verified.** 7,46, nobody could say which rate
  or what period. That is recorded in `yardstick.note` as a decision, because an
  accepted number and an unnoticed one look identical in a column.
- **`brief`, `map` and `rapporter` were left standing.** Not because they earn
  their place, but because nobody has said they are in the way. They are read
  only and derived, so they cost little. Worth asking again rather than assuming.
- **Two public GitHub repos**, unchanged from
  `2026-09-11-what-is-public-and-where.md`, and twenty three commits went into
  one of them today.
