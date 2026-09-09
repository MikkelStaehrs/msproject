import { blocks, describe, opening, paragraphs, spans } from './prose.ts'

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

const NL = String.fromCharCode(10)

check('nothing at all', paragraphs(null), [])
check('empty string', paragraphs(''), [])
check('whitespace only', paragraphs(`  ${NL} ${NL}  `), [])

check('one paragraph', paragraphs('One line.'), ['One line.'])

check(
  'a blank line separates paragraphs',
  paragraphs(`First.${NL}${NL}Second.`),
  ['First.', 'Second.'],
)

/*
 * The case that sent this file into being. Every description in the real
 * database separates paragraphs with a line holding a single space, which is
 * what a textarea leaves behind. Splitting on two newlines finds nothing.
 */
check(
  'a line holding a single space also separates them',
  paragraphs(`First.${NL} ${NL}Second.`),
  ['First.', 'Second.'],
)

check(
  'a tab counts as blank too',
  paragraphs(`First.${NL}\t${NL}Second.`),
  ['First.', 'Second.'],
)

check(
  'several blank lines are still one break',
  paragraphs(`First.${NL}${NL} ${NL}${NL}Second.`),
  ['First.', 'Second.'],
)

check(
  'a single newline stays inside the paragraph',
  paragraphs(`Sensor A${NL}Sensor B`),
  [`Sensor A${NL}Sensor B`],
)

check(
  'trailing spaces on a line are dropped',
  paragraphs(`Sensor A   ${NL}Sensor B`),
  [`Sensor A${NL}Sensor B`],
)

check(
  'windows line endings',
  paragraphs('First.\r\n\r\nSecond.'),
  ['First.', 'Second.'],
)

// --- The opening ------------------------------------------------------------
check('nothing to open', opening(null), { first: null, rest: [] })

check('one paragraph has no rest, so nothing is hidden', opening('All of it.'), {
  first: 'All of it.',
  rest: [],
})

check(
  'the first paragraph opens, the others wait',
  opening(`One.${NL} ${NL}Two.${NL} ${NL}Three.`),
  { first: 'One.', rest: ['Two.', 'Three.'] },
)

// --- Tables ----------------------------------------------------------------
const T = (lines: string[]) => lines.join(NL)

check('plain prose is not a table', blocks('Just a sentence.'), [
  { kind: 'text', text: 'Just a sentence.' },
])

check(
  'a pipe table with a header',
  blocks(T(['| Item | Price |', '|---|---|', '| Switch | 4200 |', '| PSU | 900 |'])),
  [
    {
      kind: 'table',
      head: ['Item', 'Price'],
      rows: [
        ['Switch', '4200'],
        ['PSU', '900'],
      ],
    },
  ],
)

check(
  'a table without a header rule is still a table',
  blocks(T(['| Switch | 4200 |', '| PSU | 900 |'])),
  [
    {
      kind: 'table',
      head: null,
      rows: [
        ['Switch', '4200'],
        ['PSU', '900'],
      ],
    },
  ],
)

check(
  'outer pipes are optional',
  blocks(T(['Item | Price', '--- | ---', 'Switch | 4200'])),
  [{ kind: 'table', head: ['Item', 'Price'], rows: [['Switch', '4200']] }],
)

check(
  'alignment colons in the rule are allowed',
  blocks(T(['| a | b |', '|:--|--:|', '| 1 | 2 |'])),
  [{ kind: 'table', head: ['a', 'b'], rows: [['1', '2']] }],
)

/*
 * A sentence that merely mentions a pipe must not become a table, which is why
 * EVERY line has to carry one rather than most of them.
 */
check(
  'one line with a pipe among prose stays prose',
  blocks(T(['We could use the A|B splitter', 'and see what happens'])),
  [{ kind: 'text', text: T(['We could use the A|B splitter', 'and see what happens']) }],
)

check(
  'a single line with pipes is not a table',
  blocks('| just one row |'),
  [{ kind: 'text', text: '| just one row |' }],
)

// One column is a list, and reads better as one.
check(
  'a single column is left as text',
  blocks(T(['| Switch |', '| PSU |'])),
  [{ kind: 'text', text: T(['| Switch |', '| PSU |']) }],
)

check(
  'prose and a table in the same note',
  blocks(T(['Three quotes came in.', ' ', '| Who | Price |', '|---|---|', '| Rittal | 38000 |'])),
  [
    { kind: 'text', text: 'Three quotes came in.' },
    { kind: 'table', head: ['Who', 'Price'], rows: [['Rittal', '38000']] },
  ],
)

check(
  'ragged rows keep whatever cells they have',
  blocks(T(['| a | b | c |', '| 1 | 2 |'])),
  [{ kind: 'table', head: null, rows: [['a', 'b', 'c'], ['1', '2']] }],
)

check('nothing at all', blocks(null), [])

// --- Bold, and only bold ---------------------------------------------------
check('no marks, one plain span', spans('Just text.'), [{ text: 'Just text.', bold: false }])

check('a mark in the middle', spans('a **b** c'), [
  { text: 'a ', bold: false },
  { text: 'b', bold: true },
  { text: ' c', bold: false },
])

check('the whole thing marked', spans('**Fase 1**'), [{ text: 'Fase 1', bold: true }])

check('two marks', spans('**a** and **b**'), [
  { text: 'a', bold: true },
  { text: ' and ', bold: false },
  { text: 'b', bold: true },
])

// A lone pair of asterisks is not a mark, and must survive as typed.
check('unclosed stays as typed', spans('2 ** 3 is odd'), [
  { text: '2 ** 3 is odd', bold: false },
])

check('empty marks are not marks', spans('a ****b'), [
  { text: 'a ****', bold: false },
  { text: 'b', bold: false },
])

check('nothing at all', spans(''), [{ text: '', bold: false }])

// --- What a folded note is hiding ------------------------------------------
check('nothing to describe', describe(null), null)

check('one paragraph', describe('A sentence.'), '1 paragraph')

check(
  'two paragraphs',
  describe(T(['One.', ' ', 'Two.'])),
  '2 paragraphs',
)

check(
  'a table is counted by its rows',
  describe(T(['| a | b |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'])),
  '1 table, 2 rows',
)

check(
  'the mixed case, which is the real one',
  describe(
    T([
      'Alle priser DKK.',
      ' ',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      ' ',
      '| c | d |',
      '|---|---|',
      '| 3 | 4 |',
      '| 5 | 6 |',
    ]),
  ),
  '2 tables, 3 rows, 1 paragraph',
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
