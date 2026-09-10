import { knownPeople, namedButLockedOut } from './people.ts'

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

const run = (over: Partial<Parameters<typeof knownPeople>[0]> = {}) =>
  knownPeople({ accounts: [], roles: [], ...over })

check('nobody', run(), [])

check(
  'a name from a role',
  run({ roles: [{ project_manager: 'Mikkel Stæhr' }] }),
  ['Mikkel Stæhr'],
)

check(
  'a name from an account, with no roles anywhere',
  run({ accounts: [{ full_name: 'Jan T. Hansen', email: 'jan@ubs.dk' }] }),
  ['Jan T. Hansen'],
)

/*
 * The case that sent this back for a second look. A colleague created in
 * Supabase has no name here until they set one, and skipping them meant the one
 * thing you had just done was the one thing the picker could not see. The email
 * reads as unfinished, which it is, and that beats reading as absent.
 */
check(
  'an account with no name yet is offered by its email',
  run({ accounts: [{ full_name: null, email: 'test@testesen.dk' }] }),
  ['test@testesen.dk'],
)

check(
  'and once they give a name, the email they were picked by folds into it',
  run({
    accounts: [{ full_name: 'Test Testesen', email: 'test@testesen.dk' }],
    roles: [{ product_owner: 'test@testesen.dk' }, { members: 'Test Testesen' }],
  }),
  ['Test Testesen'],
)

check(
  'an account with nothing at all is nobody',
  run({ accounts: [{ full_name: null, email: null }, {}] }),
  [],
)

check(
  'the comma separated fields hold several people',
  run({ roles: [{ members: 'Emil Pedersen, Jan T. Hansen, Mikkel Stæhr' }] }),
  ['Emil Pedersen', 'Jan T. Hansen', 'Mikkel Stæhr'],
)

/*
 * The case this was written for. Real data held "Mikkel Stæhr" five times and
 * "MIkkel Stæhr" once, and a list offering both would invite the typo again
 * rather than end it.
 */
check(
  'the same person typed two ways is one person, spelled the common way',
  run({
    roles: [
      { project_manager: 'Mikkel Stæhr' },
      { project_owner: 'Mikkel Stæhr' },
      { members: 'MIkkel Stæhr' },
    ],
  }),
  ['Mikkel Stæhr'],
)

check(
  'stray spacing does not make a second person',
  run({ roles: [{ a: 'Emil  Pedersen' }, { b: 'Emil Pedersen' }, { c: 'Emil Pedersen' }] }),
  ['Emil Pedersen'],
)

check(
  'the ones used most are offered first',
  run({
    roles: [
      { a: 'Rarely Used' },
      { b: 'Often Used' },
      { c: 'Often Used' },
      { d: 'Often Used' },
    ],
  }),
  ['Often Used', 'Rarely Used'],
)

check(
  'a tie keeps the order they were first seen in',
  run({ roles: [{ a: 'First Seen' }, { b: 'Second Seen' }] }),
  ['First Seen', 'Second Seen'],
)

check(
  'blank and whitespace entries are not people',
  run({ roles: [{ a: '', b: '   ', c: 'Real Person', d: 'A, , B' }] }),
  ['Real Person', 'A', 'B'],
)

check(
  'an account and a role are the same person, counted once',
  run({
    accounts: [{ full_name: 'Mikkel Stæhr', email: 'mikkel@ubs.dk' }],
    roles: [{ project_manager: 'Mikkel Stæhr' }],
  }),
  ['Mikkel Stæhr'],
)

/*
 * A tie in usage puts somebody who can log in above a name that was only ever
 * typed into a field, whatever order the rows arrived in.
 */
check(
  'an account outranks a name that was only ever typed',
  run({
    accounts: [{ full_name: 'Has An Account', email: 'has@ubs.dk' }],
    roles: [{ a: 'Only Ever Typed' }],
  }),
  ['Has An Account', 'Only Ever Typed'],
)

check('a node with no people at all', run({ roles: [{}] }), [])

// --- Named in a role, and still cannot open the project ---------------------
/*
 * The case that sent this back: Test was made Product owner and nothing said
 * they still could not see the project. Roles and access stay separate lists,
 * but this is the one place they are held against each other.
 */
const TEST = { id: 'u-test', email: 'test@testesen.dk', full_name: 'Test Testesen' }
const ME = { id: 'u-me', email: 'mikkel@ubs.dk', full_name: 'Mikkel Stæhr' }

check(
  'named in a role, has an account, is not a member',
  namedButLockedOut({
    roles: [{ label: 'Product owner', value: 'Test Testesen' }],
    accounts: [TEST, ME],
    members: new Set(['u-me']),
  }),
  [{ id: 'u-test', email: 'test@testesen.dk', label: 'Test Testesen', roles: ['Product owner'] }],
)

check(
  'silent once they are a member',
  namedButLockedOut({
    roles: [{ label: 'Product owner', value: 'Test Testesen' }],
    accounts: [TEST],
    members: new Set(['u-test']),
  }),
  [],
)

/*
 * Silent for somebody with no account at all. The product owner on a real
 * project is often a person who will never sign in, and nagging about them
 * every time the page loads would train you to ignore the one case that counts.
 */
check(
  'silent for a name with no account behind it',
  namedButLockedOut({
    roles: [{ label: 'Process owner', value: 'Jan T. Hansen' }],
    accounts: [TEST],
    members: new Set(),
  }),
  [],
)

check(
  'the email counts too, because that is what the picker offered before a name',
  namedButLockedOut({
    roles: [{ label: 'Product owner', value: 'test@testesen.dk' }],
    accounts: [{ id: 'u-test', email: 'test@testesen.dk', full_name: null }],
    members: new Set(),
  }),
  [{ id: 'u-test', email: 'test@testesen.dk', label: 'test@testesen.dk', roles: ['Product owner'] }],
)

check(
  'every role they hold is named, once each',
  namedButLockedOut({
    roles: [
      { label: 'Product owner', value: 'Test Testesen' },
      { label: 'Process owner', value: 'Test Testesen' },
      { label: 'Project members', value: 'Jan T. Hansen, Test Testesen' },
      { label: 'Steering committee', value: 'Somebody Else' },
    ],
    accounts: [TEST],
    members: new Set(),
  })[0].roles,
  ['Product owner', 'Process owner', 'Project members'],
)

check(
  'a name that merely contains theirs is not them',
  namedButLockedOut({
    roles: [{ label: 'Project members', value: 'Test Testesen Junior' }],
    accounts: [TEST],
    members: new Set(),
  }),
  [],
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
