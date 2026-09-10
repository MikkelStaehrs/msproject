import { knownPeople } from './people.ts'

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

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
