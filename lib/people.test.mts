import { namedButLockedOut } from './people.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) console.log(`ok    ${name}`)
  else {
    failed++
    console.log(
      `FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`,
    )
  }
}

// --- Named in a role, and still cannot open the project ---------------------
/*
 * The case that sent this back the first time: Test was made Product owner and
 * nothing said they still could not see the project. Roles and membership stay
 * two lists, because naming somebody says what they are and membership says
 * what they can open, and a role that granted access would hand out a project
 * by choosing a name in a box. This is the one place the two are compared.
 *
 * Every case below used to be about spelling. A role holds an account id now,
 * so what is left is a set difference, and the tests that remain are about
 * which people it speaks up for rather than about how their name was typed.
 */
const TEST = { id: 'u-test', email: 'test@testesen.dk', full_name: 'Test Testesen' }
const ME = { id: 'u-me', email: 'mikkel@ubs.dk', full_name: 'Mikkel Stæhr' }

check(
  'in a role, has an account, is not a member',
  namedButLockedOut({
    roles: [{ label: 'Product owner', ids: ['u-test'] }],
    accounts: [TEST, ME],
    members: new Set(['u-me']),
  }),
  [{ id: 'u-test', email: 'test@testesen.dk', label: 'Test Testesen', roles: ['Product owner'] }],
)

check(
  'silent once they are a member',
  namedButLockedOut({
    roles: [{ label: 'Product owner', ids: ['u-test'] }],
    accounts: [TEST],
    members: new Set(['u-test']),
  }),
  [],
)

/*
 * An id naming no account is silent rather than loud. It should not happen, the
 * column is a foreign key, but `reporting` is jsonb and holds these by id
 * without the database checking: a role pointing at a deleted account is a
 * dangling id, and shouting about it every page load teaches you to ignore the
 * one case that counts.
 */
check(
  'silent for an id with no account behind it',
  namedButLockedOut({
    roles: [{ label: 'Process owner', ids: ['u-gone'] }],
    accounts: [TEST],
    members: new Set(),
  }),
  [],
)

/* An account with no name yet is shown by its address, as everywhere else. */
check(
  'an account that has not chosen a name is offered by its address',
  namedButLockedOut({
    roles: [{ label: 'Product owner', ids: ['u-test'] }],
    accounts: [{ id: 'u-test', email: 'test@testesen.dk', full_name: null }],
    members: new Set(),
  }),
  [{ id: 'u-test', email: 'test@testesen.dk', label: 'test@testesen.dk', roles: ['Product owner'] }],
)

check(
  'every role they hold is named, once each, in field order',
  namedButLockedOut({
    roles: [
      { label: 'Product owner', ids: ['u-test'] },
      { label: 'Process owner', ids: ['u-test'] },
      { label: 'Project members', ids: ['u-other', 'u-test'] },
      { label: 'Steering committee', ids: ['u-other'] },
    ],
    accounts: [TEST],
    members: new Set(),
  })[0].roles,
  ['Product owner', 'Process owner', 'Project members'],
)

/* Two people locked out of the same project are both named, by label. */
check(
  'and two of them come back in name order',
  namedButLockedOut({
    roles: [{ label: 'Project members', ids: ['u-me', 'u-test'] }],
    accounts: [TEST, ME],
    members: new Set(),
  }).map((p) => p.label),
  ['Mikkel Stæhr', 'Test Testesen'],
)

check(
  'nobody in any role is nobody locked out',
  namedButLockedOut({ roles: [], accounts: [TEST], members: new Set() }),
  [],
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
