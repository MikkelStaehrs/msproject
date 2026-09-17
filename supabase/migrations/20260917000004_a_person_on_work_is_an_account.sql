-- A person on work is an account here.
--
-- Every place this application names a person has been free text: `node.owner`,
-- the driver, and the eight role fields inside `reporting.people`. lib/people.ts
-- argues for that at length and the argument is a real one, so it is worth
-- writing down what is being overruled rather than quietly deleting the comment:
--
--     Roles are names, not accounts, and that is on purpose: the product owner
--     and the process owner on a real project are often people who will never
--     log in here.
--
-- That was the right call for a portfolio with one account in it, where the
-- alternative was a picker that could offer exactly one person. It is the wrong
-- call now. Free text means «Mikkel Stæhr» five times and «MIkkel Stæhr» once,
-- it means a driver who cannot open the task they drive, and it means the
-- notification feed matching people by SPELLING, which is a bell that silently
-- stops ringing the day somebody types a name short.
--
-- So a person on work is an account, enforced here rather than in a form.
--
-- NOTHING IS DELETED. Every name that matches an account becomes a reference to
-- it. Every name that does not is kept, beside the field it was in, and the
-- screens show it in rust: requires a human. That is the honest shape for this,
-- because the names that will not match are exactly the ones the old comment
-- was protecting, and losing them silently is the one outcome nobody chose.
--
--   node.owner       -> node.owner_id, a reference; node.owner_name, the
--                       leftover, readable and never both at once
--   reporting.people -> arrays of account ids
--   reporting.people_named -> whatever did not resolve, as it was typed

begin;

-- ---------------------------------------------------------------------------
-- The one rule for deciding whether two spellings are one person.
--
-- The same rule lib/people.ts folds by, put in the database because the backfill
-- below needs it and because a second copy of it in SQL would be a second copy
-- that drifts. Immutable so it can be used in a join and, later, in an index.
-- ---------------------------------------------------------------------------
create or replace function fold_name(t text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')))
$$;

comment on function fold_name(text) is
  'Case and stray spacing do not make a new person. The SQL half of foldName '
  'in lib/people.ts; the two must agree.';

-- ---------------------------------------------------------------------------
-- The driver
-- ---------------------------------------------------------------------------
alter table node
  add column owner_id uuid references profile(id) on delete set null;

comment on column node.owner_id is
  'Who is driving this work. An account here, because a driver who cannot open '
  'the task is not driving it. Null is nobody, which the stand-up asks about.';

-- Match what is there. Either spelling counts: the old picker offered an
-- account by its email until it had a name, so a role written before that holds
-- an address.
update node n
   set owner_id = p.id
  from profile p
 where n.owner is not null
   and fold_name(n.owner) <> ''
   and (fold_name(p.full_name) = fold_name(n.owner)
        or fold_name(p.email) = fold_name(n.owner));

alter table node rename column owner to owner_name;

-- What matched is now held by the reference, and a second copy of it would be a
-- second thing to keep true. What did not match stays exactly as typed.
update node set owner_name = null where owner_id is not null;
update node set owner_name = null where fold_name(owner_name) = '';

comment on column node.owner_name is
  'READ ONLY, and almost always null. What the driver field held before a '
  'driver became an account, for the rows whose name matched nobody. Shown in '
  'rust so it gets answered, and it disappears by being answered. Nothing in '
  'the application writes this column.';

-- The two can never both be set. One answer to «who is driving this», or none.
alter table node
  add constraint node_one_driver
  check (owner_id is null or owner_name is null);

-- ---------------------------------------------------------------------------
-- The eight role fields.
--
-- `reporting.people` keeps its place in the jsonb and changes what it holds:
-- an ARRAY of account ids per field rather than one string with commas in it.
-- The array is the shape the three multi-person fields always wanted, and
-- splitting a typed string on commas is exactly how «MIkkel Stæhr» got into
-- this database in the first place.
--
-- A single person field carries an array of one. One shape for all eight is
-- worth more than a byte saved on five of them.
-- ---------------------------------------------------------------------------
do $$
declare
  r          record;
  k          text;
  raw        text;
  part       text;
  ids        jsonb;
  leftovers  text[];
  new_people jsonb;
  new_named  jsonb;
  uid        uuid;
begin
  for r in select id, reporting from node where reporting ? 'people' loop
    new_people := '{}'::jsonb;
    new_named  := '{}'::jsonb;

    for k in select jsonb_object_keys(r.reporting -> 'people') loop
      raw       := r.reporting -> 'people' ->> k;
      ids       := '[]'::jsonb;
      leftovers := array[]::text[];

      if raw is not null then
        foreach part in array string_to_array(raw, ',') loop
          if fold_name(part) <> '' then
            uid := null;
            select p.id into uid
              from profile p
             where fold_name(p.full_name) = fold_name(part)
                or fold_name(p.email) = fold_name(part)
             limit 1;

            if uid is not null then
              -- The same person written twice in one field is one person.
              if not (ids @> to_jsonb(uid::text)) then
                ids := ids || to_jsonb(uid::text);
              end if;
            else
              leftovers := leftovers || btrim(part);
            end if;
          end if;
        end loop;
      end if;

      if jsonb_array_length(ids) > 0 then
        new_people := jsonb_set(new_people, array[k], ids);
      end if;
      if coalesce(array_length(leftovers, 1), 0) > 0 then
        new_named := jsonb_set(new_named, array[k],
                               to_jsonb(array_to_string(leftovers, ', ')));
      end if;
    end loop;

    update node
       set reporting = jsonb_set(
             jsonb_set(coalesce(reporting, '{}'::jsonb), '{people}', new_people),
             '{people_named}', new_named)
     where id = r.id;
  end loop;
end $$;

comment on column node.reporting is
  'The PID and everything reported upward. `people` holds an array of account '
  'ids per role; `people_named` holds whatever was typed there before a role '
  'became an account and matched nobody, shown in rust until somebody answers '
  'it. Nothing writes people_named.';

insert into schema_migration (version, applied_at, note)
values ('20260917000004_a_person_on_work_is_an_account', now(),
        'Driver and every role field become references to accounts; unmatched names kept and flagged')
on conflict (version) do nothing;

commit;
