-- What to call somebody.
--
-- `profile` holds an email, because that is all an account arrives with. But a
-- role on a project reads "Mikkel Stæhr", not an address, so an account is of
-- no use to the picker until it has a name attached.
--
-- Asked for once, on the page where a new colleague chooses their password.
-- That is the only moment they are already filling in a form about themselves,
-- and asking anywhere else would be a second errand nobody runs.
--
-- Nullable on purpose. A name that has not been given yet is simply absent from
-- the suggestions, which is a smaller problem than inventing one from the
-- address and then having "mikkel.staehr" appear on a report as a person.

begin;

alter table profile
  add column full_name text;

comment on column profile.full_name is
  'What this person is called on a project. Null until they say. Never derived '
  'from the email: a role field is read by other people.';

create policy profile_own_name on profile
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

insert into schema_migration (version, applied_at, note)
values ('20260909000002_profile_name', now(),
        'A name on an account, so the role picker can offer it')
on conflict (version) do nothing;

commit;
