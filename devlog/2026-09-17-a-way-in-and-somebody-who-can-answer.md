# A way in, and somebody who can answer

The application could talk about people all day and could not make one. An
account came into being in the Supabase dashboard or it did not come into being
at all, and `addMember` said so to your face: «No account here uses that
address. Create the user in Supabase first, then add them.» Honest, and the
sound of a hole. Somebody who wants in had nowhere to ask, and whoever owns the
place had no screen on which to answer.

So: `access_request`, a login screen with a third mode, `profile.is_admin`, and
`/admin`.

## The decision that shapes everything else

**The service role key is now read at runtime.** It was only ever in
`scripts/audit.mts` and `scripts/migrate.mts` before, and that was a property of
the deployment worth keeping. It is gone, knowingly.

There was no way around it that was not a worse lie. Creating a user lives in
Supabase's Auth admin API; `auth.users` is deliberately not exposed through
PostgREST, so there is no policy that would grant it and no shape of migration
that would avoid it. The alternatives were both refused in the ask:

- Track requests and create the accounts by hand in the dashboard. Two places to
  work, and the module becomes a list rather than a thing that does anything.
- Open signup, so people create their own account and see nothing until they are
  put on a project. Safe, because visibility is membership, and it puts a public
  signup form on an internal tool.

So the key is in Vercel for Production now as well as in `.env.local`, and
[lib/supabase/admin.ts](../lib/supabase/admin.ts) is the whole of what may read
it. Its header carries the three rules, and they are worth repeating because
they are what makes it survivable:

1. **Nothing imports it except `lib/admin-actions.ts`.** `server-only` stops the
   catastrophic version; the rest is a short import list that can be read.
2. **Every caller passes `requireAdmin` first**, which asks the database rather
   than trusting anything that arrived with the request. A server action is a
   public HTTP endpoint with a hard-to-guess name and nothing else.
3. **It never renders a screen.** `/admin` reads through the ordinary session
   under `is_admin()` policies, so it is gated like every other page.

There is one exception to the third rule and it is deliberate:
`projectsLeftEmptyBy` reads `project_member` and `node` with the service key.
It has to. An administrator only sees the memberships of projects they are on,
so asking through their session would answer «no, nothing would be orphaned»
about a project they cannot see, and a project with no members is invisible to
everyone for good. The one question no session can answer truthfully gets asked
by the one client that can.

## Why `is_admin` is a column privilege and not a policy

This is the part worth reading before touching `profile`.

`profile` already had `profile_own_name`, which lets you update your own row
because you set your own name on it. **RLS is row level.** A policy that lets
you write your row lets you write every column of it. So the moment `is_admin`
sat on `profile`, `profile_own_name` became a policy that lets anybody make
themselves an administrator. Not a theoretical reading. That is what it says.

A cleverer policy was not the fix, because the next policy somebody adds would
have the same hole. Column privileges sit underneath RLS and cannot be argued
with:

```sql
revoke update on profile from authenticated;
grant  update (full_name, password_set_at) on profile to authenticated;
```

`is_admin` is now unwritable from any ordinary session no matter what policy is
ever added above it, and it is written by the service role from `setAdmin` and
nowhere else.

**If you add a column to `profile` that a person is meant to set about
themselves, you have to grant it here too.** It will otherwise fail with a
permission error that names the table and not the column, and it will look like
RLS. It is not RLS.

## What the login screen does and does not say

The request form is the only write in this codebase that happens without a
session. It runs through the ordinary anon client, so the database decides what
it can do: one unanswered row in, nothing back out. There is no select policy
for `anon` and the table grant is `insert (full_name, email, reason)` only.

A unique partial index on `lower(email) where state = 'new'` allows one open ask
per address. That is a brake on the double submit and the impatient reload,
which is what it is for, and not on somebody determined with a supply of
addresses. If that ever becomes a problem the answer is a rate limit at the
edge, not a cleverer index.

The reply when that index fires says «that address has already asked». It was
worth a minute deciding whether that leaks anything, and it does not: it is
about the address the person just typed, not about whether it has an account.
`requestReset` right above it still answers identically either way, and must.

## Inviting grants nothing

An invitation makes an account. It does not put anyone on a project, and
`/admin` says so twice, because it is the thing that will otherwise be assumed.
The new account signs in to an empty application until somebody adds them on the
project's own page, where whoever decides can see what they are handing over.

That was the reason membership stayed off this screen when the scope was picked.
A screen that grants access to work it does not show you is a screen that gets
clicked through.

## Still in flight

- **Nobody has tested the anon insert against production.** The audit proves all
  31 relations refuse the anon key for reading, which is the dangerous
  direction; it does not prove the insert is allowed, and a missing grant would
  show up as a login screen that quietly fails. First thing to check after the
  deploy: open `/login`, ask for access, then look at `/admin`.
- **The first administrator is the oldest account in `auth.users`**, set by the
  migration. Read from `auth.users.created_at` and not `profile.created_at`,
  because the membership migration backfilled every profile row in one statement
  and they all carry the same instant. If that turns out to be the wrong
  account, the fix is one update with the service key, not a migration naming a
  person.
- **`SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel for Production.** It is not
  `NEXT_PUBLIC_`, so it is read per request rather than baked into the build:
  the site will build and serve perfectly and fail on the one button that
  invites. `createAdminClient` says exactly that when it is missing, which is
  the only reason that message is that long.
