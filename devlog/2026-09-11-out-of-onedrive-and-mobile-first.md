# Out of OneDrive, and the mobile first pass finished

## What happened

The checkout moved from `OneDrive - GroupeFD\Documents\MSProjects` to
`C:\dev\MSProjects`. GitHub is the backup now, so the reason for keeping it in a
synced folder was gone, and OneDrive had been the cause of four separate failures:
a build that could not read `node_modules`, conflict copies that ate half a
session, junctions that had to be maintained, and finally Git itself unable to
append to `.git/logs/HEAD`.

The mobile first pass finished (`65793e1`). The three column frame already
stacked, but the grids inside it did not: field grids stayed four across at 63px
a column, and the portfolio and cost tables kept 330 to 450px of fixed track on a
350px screen. Numeric grids now run one stair, every `col-span` moves with its
parent, and the three tables stack with `lg:contents`. The conventions are
written up in [CLAUDE.md](../CLAUDE.md).

## Worth knowing next time

**Half of this work had already been done once, on 8 September, and was lost.**
OneDrive split the nine files that had just been edited into conflict copies
named `page-gfd-3V32KD4.tsx` and left the originals at their pre-edit content.
The copies were committed by accident and then deleted in `7d334fd`. Nothing
reported an error: the build stayed green, because the originals were still valid
code, just without the changes. The lesson is not about OneDrive, which is gone
now. It is that a green build proves the code compiles, not that your edits are
in it.

**Killing a sync client makes things worse, not better.** With OneDrive stopped,
its filter driver has no provider and cloud placeholder files cannot be deleted
or moved at all. Deletes fail with "The directory is not empty" and moves with
"The cloud file provider exited unexpectedly". Both messages point away from the
real cause. Hydrate first, with the client running, then move.

**A junction target has to be named what the tool expects.** While
`node_modules` was still junctioned out of OneDrive, pointing it at
`C:\dev\MSProjects-node_modules` broke the build with
`Cannot find module 'styled-jsx/package.json'`. Node resolves a junction to its
real path and then looks for sibling packages by walking up for a directory
literally called `node_modules`. Moot now that the checkout is out, but the same
trap applies to any tool that resolves realpaths.

**`npm ci` deletes a junctioned `node_modules`** rather than filling it, because
it sees the link as a "non-directory". Also moot now, and it was the reason the
repo carried that constraint.

## Still open

- **The branch is not pushed.** `git push` returns 403: Git Credential Manager
  holds the account `MikkelStaehr`, and the repo belongs to `MikkelStaehrs`, with
  an s. `MikkelStaehr/msproject` does not exist, so it is two accounts rather
  than a wrong remote. Clearing the stored credential and signing in again is a
  person's job, not an agent's.
- **The old OneDrive folder still exists.** The move was a copy, verified by a
  green build from the new location, and the original was deliberately left for a
  person to delete. Two checkouts of the same repo is how you end up working in
  the wrong one.
- **Two public GitHub repos** hold near identical copies of this project,
  `MikkelStaehrs/msproject` and `MikkelStaehrs/MSProjects`. The local remote
  points at the first, which matches local history. Both are public, and the
  project holds supplier names and cost figures.
- **The audit's check 6, "Membership keeps a second account out", reports as not
  measured.** It is neither passing nor failing, and it presumably needs a second
  account to have anything to measure.
