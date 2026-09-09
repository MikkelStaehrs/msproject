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
  run({ accounts: ['Jan T. Hansen'] }),
  ['Jan T. Hansen'],
)

check('accounts with no name given yet are skipped', run({ accounts: [null, undefined] }), [])

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
  run({ accounts: ['Mikkel Stæhr'], roles: [{ project_manager: 'Mikkel Stæhr' }] }),
  ['Mikkel Stæhr'],
)

check('a node with no people at all', run({ roles: [{}] }), [])

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
