import { parseQuickAdd, guessWaitingOnType } from './quick-add.ts'

const cases: Array<[string, string, unknown]> = [
  ['empty string', '', { kind: 'empty' }],
  ['whitespace only', '   ', { kind: 'empty' }],
  ['an ordinary line', 'Rykket IT igen', { kind: 'entry', body: 'Rykket IT igen', entryKind: 'work' }],
  ['a line with a + inside it', 'Vejeceller 4+2 monteret', { kind: 'entry', body: 'Vejeceller 4+2 monteret', entryKind: 'work' }],
  ['a line with an @ inside it', 'Mail til anders@firma.dk sendt', { kind: 'entry', body: 'Mail til anders@firma.dk sendt', entryKind: 'work' }],
  ['task', '+ Testprotokol udarbejdet', { kind: 'task', title: 'Testprotokol udarbejdet' }],
  ['task with no space after the prefix', '+Testprotokol', { kind: 'task', title: 'Testprotokol' }],
  ['task with no title', '+  ', { kind: 'invalid', reason: 'Type a title after +' }],
  ['blocker', '! Afventer VLAN @ IT', { kind: 'blocker', title: 'Afventer VLAN', waitingOn: 'IT' }],
  ['blocker with an @ in the title', '! Svar på mail til a@b.dk @ Vedligehold', { kind: 'blocker', title: 'Svar på mail til a@b.dk', waitingOn: 'Vedligehold' }],
  ['blocker with no @', '! Afventer VLAN', { kind: 'invalid', reason: 'Add @ and who you are waiting on' }],
  ['blocker with no recipient', '! Afventer VLAN @', { kind: 'invalid', reason: 'Type who you are waiting on after @' }],
  ['blocker with no title', '! @ IT', { kind: 'invalid', reason: 'Type what is blocking' }],
  ['decision with no rationale', '? Vælger 130 kV frem for 90 kV', { kind: 'decision', decision: 'Vælger 130 kV frem for 90 kV', rationale: null }],
  ['decision with a rationale', '? Vælger 130 kV // tungere frø kræver mere gennemtrængning', { kind: 'decision', decision: 'Vælger 130 kV', rationale: 'tungere frø kræver mere gennemtrængning' }],
  ['decision with an empty rationale', '? Vælger 130 kV //', { kind: 'decision', decision: 'Vælger 130 kV', rationale: null }],
  ['decision with no text', '?  ', { kind: 'invalid', reason: 'Type what was decided' }],
  ['decision with nothing before //', '? // fordi', { kind: 'invalid', reason: 'Type the decision before //' }],
  ['a line with a ? inside it', 'Er 130 kV nok? Vi tester', { kind: 'entry', body: 'Er 130 kV nok? Vi tester', entryKind: 'work' }],
  ['a line with // inside it', 'Se https://videometer.com for specs', { kind: 'entry', body: 'Se https://videometer.com for specs', entryKind: 'work' }],
]

let failed = 0
for (const [name, input, expected] of cases) {
  const got = parseQuickAdd(input, 'work')
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (!ok) {
    failed++
    console.log(`FAIL  ${name}
      input:    ${JSON.stringify(input)}
      expected: ${JSON.stringify(expected)}
      got:      ${JSON.stringify(got)}`)
  } else {
    console.log(`ok    ${name}`)
  }
}

/*
 * The kind follows from WHERE the line was written, never from a picker. Quick
 * entry says nothing and gets `work`; a stand-up passes `meeting`. Four buttons
 * used to ask, they changed nothing, and they were the one question standing
 * between a person in a meeting and a written sentence.
 */
const defaulted = parseQuickAdd('Rykket IT igen')
console.log(JSON.stringify(defaulted) === JSON.stringify({ kind: 'entry', body: 'Rykket IT igen', entryKind: 'work' }) ? 'ok    quick entry defaults to work, unasked' : (failed++, 'FAIL  quick entry defaults to work, unasked'))

const fromStandup = parseQuickAdd('Møde med Vedligehold', 'meeting')
console.log(JSON.stringify(fromStandup) === JSON.stringify({ kind: 'entry', body: 'Møde med Vedligehold', entryKind: 'meeting' }) ? 'ok    and the caller can still say where it came from' : (failed++, 'FAIL  and the caller can still say where it came from'))

for (const [inp, exp] of [['IT', 'internal_it'], ['it', 'internal_it'], ['Ledelsen', 'management'], ['Leverandør', 'vendor'], ['Vedligehold', 'other'], ['Videometer', 'other']] as const) {
  const got = guessWaitingOnType(inp)
  if (got !== exp) { failed++; console.log(`FAIL  type for ${inp}: expected ${exp}, got ${got}`) }
  else console.log(`ok    type for ${inp} -> ${got}`)
}

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
