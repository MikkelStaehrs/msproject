# A refusal that sent us the wrong way three times

## What happened

The read tools went live and then appeared not to work. Three rounds were spent
making new tokens, and the token was never the problem: the Claude connector was
still sending an old one that had since been revoked, and editing the header in
place did not take. Disconnect, quit Claude completely, add the connector again,
and it worked first try.

It works well. On the first real question Claude found the two nearest pieces of
existing work by path and status, quoted a price out of a spark note captured
weeks earlier, did the COGS arithmetic against the real yardstick, and saved the
thought with what it had found.

## Worth knowing next time

**The endpoint's own error message caused this, and that is the lesson.**
`token_owner` raises the same sentence for a token it has never seen and for a
real token that is only `capture`, deliberately, because telling them apart
would be a way of probing for both. The endpoint then threw that property away
by guessing, and said «this is a capture only token» with confidence, for both
cases.

So the model dutifully asked for a token with the wider scope. One was made. The
header still held the dead one. Round two, same message, same conclusion, same
fix attempted.

A diagnostic that names one cause out of two is worse than one that names
neither. It does not merely fail to help, it sends you somewhere, and everyone
downstream believes it because it sounds specific. `2d964f6` states both causes
and points at the evidence that separates them.

**The evidence was on screen the whole time and none of us read it.** Claude
reported that the SPARKS INBOX was refused too. That is `list_ideas`, a capture
tool. A capture-scoped token would have answered it. Scope was ruled out from
the first reply, and three rounds were spent on scope anyway.

**A refused read leaves no trace, and the obvious fix for that does not work.**
`token_owner` stamps `last_used_at` after the scope check, so a token refused for
scope records nothing. The entry first written here proposed moving the stamp
above the check. That is wrong twice over, and both are worth keeping written
down because the idea is an easy one to have again:

- **`raise exception` rolls the stamp back.** One PostgREST call is one
  transaction, so a write made before the raise is undone by it. A function
  cannot both record an attempt and refuse it. Recording a refusal needs a
  second call from the endpoint, in its own transaction.
- **It would not have caught this incident anyway.** The token here was UNKNOWN,
  not narrow: it had been revoked, so there was no row to stamp. Every version
  of this fix leaves that case invisible, and that case was the whole hour.

What would have caught it was already on the screen. The Account page prints
«never used» beside every token, and the new one said exactly that throughout.
Nobody joined it to «the connector says it cannot read», because the two facts
sit on different screens and neither says what it means. So the row now says
what to do about it, where it can be true.

**`Read-Host -AsSecureString` mangles pasted text in the PowerShell 5.1
console.** A 43 character token pasted at that prompt arrived as one character,
and the control character it picked up made `Invoke-RestMethod` fail with
«Specified value has invalid Control characters», which points nowhere near the
cause. Writing the value to a file and reading it from there settled in one go
what three interactive attempts could not.

**The scope on the reference paid for itself immediately.** Nobody asked Claude
to check the denominator. It read `scope` off the yardstick, saw the figure
covers In-house only, and said the percentages it had just given were therefore
too high. The design intent was that a number travels with the population it
counts so the reader is told; it turns out that works on a reader that is not a
person, with no extra work at all.

## Still open

- The audit's check 6 is still not measured, and it matters more now: there is a
  credential that reads project structure, and nothing has ever proved the
  membership cut holds between two accounts.
