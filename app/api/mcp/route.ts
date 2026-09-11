import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  basisCoversTarget,
  impactOf,
  referenceFrom,
  savingFrom,
  scopesAgree,
  stagesFrom,
} from '@/lib/cogs'
import { priorityScore, quadrant } from '@/lib/priority'
import type { SavingKind } from '@/lib/types'

/**
 * What the Claude app talks to.
 *
 * Added in Claude as a custom connector pointing at this URL, with the capture
 * token as a fixed Authorization header. Then the idea that arrives at eleven at
 * night gets said out loud instead of typed, and it is in the inbox by morning.
 *
 * Streamable HTTP, which is the transport Claude uses; the older HTTP+SSE one is
 * being retired. Every message is JSON-RPC 2.0 over POST, and single replies may
 * come back as plain JSON rather than a stream, which is all this needs.
 *
 * THE INBOX, AND ONLY THE INBOX. That is the security design, not a limitation
 * left for later. This endpoint holds no Supabase privileges of its own: it
 * calls three functions with the public anon key, and each of them takes the
 * owner from the token rather than from an argument.
 *
 * What a stolen token buys: read one person's own inbox, add a thought to it,
 * add a paragraph to a thought already in it. Nothing about the tree, the
 * prices, the documents or anyone else. And nothing that is already written can
 * be lost, because the note tool appends and cannot replace.
 *
 * Writing onto a PROJECT was asked for and deliberately not built. That would
 * turn this from an inbox into a general write channel into project data, and
 * it is the point at which a token going astray stops being an annoyance.
 */

const PROTOCOL = '2025-06-18'

/**
 * Said on every field that takes substance, rather than on one of them.
 *
 * It was on `context` alone to begin with, and the first real attempt put
 * everything in `idea` and so never read it. Advice a model does not see is
 * not advice.
 */
const TABLES =
  'Where the substance is a list of things with values against them, such as ' +
  'equipment with prices or options with lead times, write that part as a ' +
  'markdown pipe table and it will be shown as a table. Never as a run of ' +
  'semicolons. Prose and a table may sit together, separated by a blank line. ' +
  'Put the unit in the column heading rather than in every cell, so the ' +
  'numbers stay numbers and still say what they are: ' +
  '"| Item | Qty | Unit price, kr. | Sum, kr. |". A total row goes at the ' +
  'bottom of the same table rather than as a paragraph after it.'

const CAPTURE = {
  name: 'capture_idea',
  title: 'Capture an idea in Task Studio',
  description:
    'Save a NEW thought to the Sparks inbox in Task Studio, to be triaged ' +
    'later. Use it for a half-formed idea, something to look into, or ' +
    'something worth doing that has no project yet. ' +
    'Before calling this, call list_ideas: if a thought about the same subject ' +
    'is already waiting, use add_to_idea instead. Several sparks about one ' +
    'subject have to be married up by hand afterwards, which is work this tool ' +
    'exists to avoid. ' +
    'This is a capture step, not a planning step: do not turn it into a task, ' +
    'do not propose a breakdown, and do not ask which project it belongs to. ' +
    'Those are decided later with the whole tree in view. ' +
    TABLES,
  inputSchema: {
    type: 'object',
    properties: {
      idea: {
        type: 'string',
        /*
         * A hard limit, not advice.
         *
         * The first real use put 577 characters of equipment and prices in
         * here and left `context` empty, and the inbox became a wall of
         * semicolons. The description had asked for a sentence; a schema that
         * permits the wrong shape gets the wrong shape, so this one does not
         * permit it.
         */
        maxLength: 300,
        description:
          'ONE SENTENCE: the thought itself, in the words the user said it ' +
          'in. Do not rephrase, expand or tidy it. A list of items, prices, ' +
          'suppliers or phases is NOT the thought and must not go here; it ' +
          'goes in context. If what you are about to write is longer than a ' +
          'sentence, the sentence is the thought and the rest is context.',
      },
      context: {
        type: 'string',
        description:
          'What made the thought make sense at the time, so it is still ' +
          'intelligible in three weeks: what prompted it, what was being ' +
          'discussed, and any specifics mentioned in passing such as a ' +
          'machine, a line, a supplier or a number. Facts from the ' +
          'conversation only. Not a plan, not next steps, not a guess at what ' +
          'it should become. Leave it out if the thought stands on its own. ' +
          TABLES,
      },
    },
    required: ['idea'],
    additionalProperties: false,
  },
} as const

const LIST = {
  name: 'list_ideas',
  title: 'List the ideas waiting in Task Studio',
  description:
    'The thoughts sitting unsorted in the Sparks inbox in Task Studio, newest ' +
    'first, with the id of each. Use it to find the one an idea belongs with ' +
    'before adding to it. Only the inbox: what has already become work or been ' +
    'decided against is not here.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

const APPEND = {
  name: 'add_to_idea',
  title: 'Add to an idea already in Task Studio',
  description:
    'Add a paragraph to the note on a thought already in the Sparks inbox. ' +
    'Use it when a conversation has produced substance that belongs with an ' +
    'idea captured earlier, such as the actual equipment and prices behind a ' +
    'thought about buying something. Call list_ideas first to get the id, and ' +
    'if no existing thought is clearly the right one, capture a new one ' +
    'instead of guessing. ' +
    'This only ever adds: it cannot replace or remove what is there, so text ' +
    'the user wrote themselves is safe. ' +
    TABLES,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The id of the thought, from list_ideas.',
      },
      note: {
        type: 'string',
        description:
          'The paragraph to add. Facts from the conversation: equipment, ' +
          'prices, suppliers, constraints. Not a plan and not next steps.',
      },
    },
    required: ['id', 'note'],
    additionalProperties: false,
  },
} as const

/**
 * READING, and the line that makes it safe.
 *
 * A spark is a thought that has not been tested against the COGS strategy yet.
 * That test is already arithmetic in the application - a saving becomes a share
 * of the year's target, and a benefit against a complexity places it in the
 * matrix - and what has never existed is help producing the numbers the test
 * takes in. That part is a conversation: is this already a task somewhere, is
 * the saving real, should the idea be stretched, what does this sort of thing
 * cost.
 *
 * So these two READ. Nothing here writes, and there is no path from this
 * endpoint to a score: the three judgements are typed by a person into the form
 * on /spark, exactly as before. What a conversation produces that is worth
 * keeping goes back through `add_to_idea`, which appends and cannot replace.
 *
 * The model may argue. It may never be the source of a stored number.
 *
 * Both need a token made with the «Capture and read» scope. A capture token
 * gets the same refusal as an invalid one, deliberately: the database cannot
 * tell a caller which of the two was wrong without that being a way of probing
 * for both.
 */
const WORK = {
  name: 'list_work',
  title: 'The work already in Task Studio',
  description:
    'The projects and tasks in Task Studio that the token owner is a member ' +
    'of: what it is called, where it sits in the tree, what type it is and ' +
    'what state it is in. ' +
    'Call it BEFORE arguing that an idea is worth doing, for one specific ' +
    'reason: an idea that is already a task somewhere is not a new idea, and ' +
    'saying so is more useful than assessing it a second time. ' +
    'It is structure only. There are no descriptions, no prices and no ' +
    'documents here, so do not report on what a piece of work contains or ' +
    'costs from this, and do not guess at it.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

const TARGET = {
  name: 'read_target',
  title: 'What a saving is measured against',
  description:
    'The COGS reference: the yardstick for the year, the volumes each process ' +
    'stage actually ran, and the strategy headings. ' +
    'Call it before putting a number on what an idea is worth. The strategy ' +
    'is to take one euro of cost out of every unit, every year, and a saving ' +
    'only means something against the unit the target is per: use the figures ' +
    'this returns rather than any you remember or can derive from elsewhere. ' +
    'Where a figure is missing, say it is not known. An invented denominator ' +
    'is how a saving comes to be reported as a share of a target nobody set.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

const READ_IDEA = {
  name: 'read_idea',
  title: 'One thought in Task Studio, whole',
  description:
    'A single thought from the Sparks inbox, in full: everything that was ' +
    'said, everything that was noted around it, and the assessment on it. ' +
    'Call it when the summary in list_ideas is not enough, which is usually ' +
    'when the note holds a table of equipment or prices. Also works on a ' +
    'thought that was decided against, where it returns the verdict in full.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The id of the thought, from list_ideas or past_verdicts.' },
    },
    required: ['id'],
    additionalProperties: false,
  },
} as const

const VERDICTS = {
  name: 'past_verdicts',
  title: 'Ideas already decided against',
  description:
    'Thoughts the owner has looked at and turned down, with the reason. ' +
    'Call it BEFORE arguing that an idea is worth doing, alongside list_work. ' +
    'An idea that was rejected three months ago will sound just as reasonable ' +
    'today, and assessing it a second time as though it were new is the exact ' +
    'loop this record exists to stop. ' +
    'If something close is here, say so and quote the reason rather than ' +
    'reassessing it. The verdict may of course be out of date, and saying WHY ' +
    'it might be, such as a price that has moved, is useful. Pretending it was ' +
    'never made is not.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }

const reply = (id: unknown, result: unknown) =>
  NextResponse.json({ jsonrpc: '2.0', id, result })

const fail = (id: unknown, code: number, message: string) =>
  NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })

/**
 * Why a read was refused. BOTH reasons, because it is genuinely one or the
 * other and this endpoint cannot tell which.
 *
 * The function raises the same sentence for a token it has never seen and for a
 * real token that is only `capture`, deliberately: a reply that told them apart
 * would be a way of probing for both. That is right, and the first version of
 * this hint then threw the property away by guessing. It said «this is a
 * capture only token», which is one of the two cases, and it said so with
 * confidence.
 *
 * It cost two rounds of the wrong fix. A token had been revoked and the
 * connector was still sending it, so the honest answer was «that token does not
 * exist any more, look at the header». Instead the model was told the scope was
 * wrong, so it asked for another token, which was made, and the header still
 * held the dead one. A diagnostic that names one cause out of two is worse than
 * one that names neither: it does not merely fail to help, it actively sends
 * you somewhere.
 *
 * So both are stated, likeliest first, and the reader is pointed at the
 * evidence that separates them: a capture token can still write.
 */
const scopeHint = (message: string) =>
  /not valid here/i.test(message)
    ? message +
      ' That is one of two things, and this endpoint cannot tell which. ' +
      'EITHER the token is not recognised at all, which is what a revoked or ' +
      'part-copied one looks like, OR it is a real token made with the ' +
      '«Capture only» scope. ' +
      'To tell them apart, try saving an idea: a capture token can still do ' +
      'that, and a token that is not recognised cannot do anything. ' +
      'If saving also fails, the token in this connector no longer exists and ' +
      'the fix is the authorization header rather than a new token. Otherwise ' +
      'make one with «Capture and read» on the Account page in Task Studio.'
    : message

/** A tool that failed is reported inside the result, not as a protocol error. */
const toolError = (id: unknown, message: string) =>
  reply(id, { content: [{ type: 'text', text: message }], isError: true })

/**
 * The token out of whatever header it arrived in.
 *
 * Lenient on purpose. Claude sends the header value exactly as it was typed
 * into the connector dialog, so `Bearer abc` and a bare `abc` are both things
 * a person will reasonably enter, and insisting on the magic word buys no
 * safety at all: the header IS the credential either way. The first attempt at
 * this demanded the prefix and turned a correct token into "this connector
 * needs its token", which is the least helpful thing it could have said.
 *
 * `x-api-key` is accepted too, because it is the other header name Claude
 * offers in the same dropdown.
 */
function credential(request: NextRequest): string | null {
  const raw =
    request.headers.get('authorization') ??
    request.headers.get('x-api-key') ??
    ''

  const value = raw.replace(/^(Bearer|Token)\s+/i, '').trim()
  return value === '' ? null : value
}

/**
 * The derived figures, computed by the code the PAGE uses.
 *
 * This is the point of doing it here rather than describing the rule in a tool
 * description and letting the model work it out. A rule explained to a model is
 * a second spelling of it, and two spellings of «what is this idea worth»
 * eventually disagree, at which point the screen and the conversation are both
 * confident and one of them is wrong. `lib/cogs` and `lib/priority` are the
 * only places that arithmetic happens, and this reads them like any page does.
 *
 * The two warnings travel with the figures for the same reason they do in the
 * interface: a share of the target is flattered when the denominator counts
 * less than the strategy covers, and meaningless when the saving is spread over
 * a different population than the target is set for. A percentage nobody has
 * been warned about is a percentage somebody will quote.
 */
type Assessed = {
  saving_kind: SavingKind | null
  saving_value: number | string | null
  saving_stage: string | null
  cost_score: number | null
  benefit_score: number | null
  complexity_score: number | null
}

function derive(row: Assessed, reference: ReturnType<typeof referenceFrom>, stages: ReturnType<typeof stagesFrom>) {
  const stage = stages.find((v) => v.stage === row.saving_stage)
  const saving = savingFrom(row.saving_kind, row.saving_value, stage?.units ?? null)
  const impact = saving && reference ? impactOf(saving, reference) : null

  const judgement = {
    cost: row.cost_score,
    benefit: row.benefit_score,
    complexity: row.complexity_score,
  }

  return {
    annualDkk: impact?.annualDkk ?? null,
    eurPerUnit: impact?.eurPerUnit ?? null,
    shareOfTarget: impact?.shareOfTarget ?? null,
    priority: priorityScore(judgement),
    quadrant: quadrant(judgement),
    /** The saving counts a different population than the target. */
    mixedPopulations:
      reference !== null && stage !== undefined && !scopesAgree(reference, stage.scope),
    /** The denominator is narrower than the strategy, so shares read too high. */
    targetUnderstated: reference !== null && !basisCoversTarget(reference),
  }
}

/**
 * The reference, or null where this token may not read it.
 *
 * `list_ideas` has always worked at `capture` scope and must keep doing so, so
 * a failure here is not an error: it means the figures cannot be worked out,
 * which is a different thing from their being zero and is reported as such.
 */
type Caller = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

async function referenceFor(supabase: Caller, token: string) {
  const { data, error } = await supabase.rpc('read_reference', { token })
  if (error || data === null) return { reference: null, stages: [] as ReturnType<typeof stagesFrom> }

  const body = data as { yardstick: Parameters<typeof referenceFrom>[0]; stages: Parameters<typeof stagesFrom>[0] }
  const reference = referenceFrom(body.yardstick ?? null)
  return { reference, stages: stagesFrom(body.stages ?? [], reference?.fiscalYear ?? null) }
}

export async function POST(request: NextRequest) {
  let message: Rpc
  try {
    message = (await request.json()) as Rpc
  } catch {
    return fail(null, -32700, 'That was not JSON.')
  }

  const { id, method } = message

  /*
   * A notification has no id and expects no body back. `initialized` is the
   * one Claude sends, and answering it with a result is a protocol error.
   */
  if (id === undefined || id === null) {
    return new NextResponse(null, { status: 202 })
  }

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: 'task-studio', version: '1.0.0' },
      instructions:
        'Task Studio keeps the projects and the weekly status. Through this ' +
        'connector it accepts one thing: an idea, saved to be sorted out later.',
    })
  }

  if (method === 'tools/list') {
    return reply(id, { tools: [CAPTURE, LIST, APPEND, WORK, TARGET, READ_IDEA, VERDICTS] })
  }

  if (method !== 'tools/call') {
    return fail(id, -32601, `Unknown method: ${method}`)
  }

  // --- Dispatch -------------------------------------------------------------

  const params = message.params ?? {}
  const args = (params.arguments ?? {}) as Record<string, unknown>

  const token = credential(request)
  if (token === null) {
    /*
     * Which headers arrived, by NAME only.
     *
     * Two attempts were spent guessing whether the credential was wrong or
     * simply absent, and the two need opposite fixes. Claude stores a header
     * value and never shows it again, so there is no way to check from that
     * side either. Naming what turned up settles it in one try: no
     * `authorization` in the list means the connector is sending none.
     *
     * Names, never values. This text goes back to a model and into a
     * transcript, and a credential does not belong in either.
     */
    const seen = [...request.headers.keys()]
      .filter((h) => !h.startsWith('x-vercel-') && !h.startsWith('x-forwarded-'))
      .sort()
      .join(', ')

    return toolError(
      id,
      'No credential arrived, so this connector is not sending one. In its ' +
        'settings in Claude, add a request header named authorization whose ' +
        'value is the token from the Account page in Task Studio. The value ' +
        'has to be filled in before saving: Claude never shows it again, so an ' +
        'empty-looking field cannot be told apart from a stored one. ' +
        `Headers that did arrive: ${seen}.`,
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    return toolError(id, 'This deployment has no database configuration.')
  }

  /*
   * The anon key, deliberately. It is public and opens nothing on its own:
   * every table refuses it. The token in the header is the credential, and the
   * three functions below are the only things it unlocks. Each of them takes
   * the owner from the token rather than from an argument, so there is nothing
   * here that can be pointed at somebody else's inbox.
   */
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  if (params.name === CAPTURE.name) {
    const idea = String(args.idea ?? '').trim()
    const context = String(args.context ?? '').trim()

    if (idea === '') {
      return toolError(id, 'Nothing to save. Say the thought and I will keep it.')
    }

    /*
     * The shape is refused rather than stored badly.
     *
     * A tool error is the one message a model reliably acts on, so this is
     * where the correction belongs: it says what went wrong and what to do
     * instead, and the retry comes back in the right shape. Splitting the text
     * here instead would mean guessing where somebody's sentence ends.
     */
    if (idea.length > 300) {
      return toolError(
        id,
        `The thought is ${idea.length} characters, and the idea field takes a ` +
          'sentence. Put the sentence in idea and everything else in context: ' +
          'the detail, the equipment, the prices. If it is a list of things ' +
          'with values against them, write that as a markdown pipe table.',
      )
    }

    const { data, error } = await supabase.rpc('capture_spark', {
      token,
      body: idea,
      note: context === '' ? null : context,
    })

    if (error) return toolError(id, error.message)

    return reply(id, {
      content: [
        {
          type: 'text',
          text:
            'Kept it. It is in the Sparks inbox in Task Studio, waiting to be ' +
            (context === '' ? 'sorted.' : 'sorted, with the context around it.'),
        },
      ],
      structuredContent: { spark_id: data },
    })
  }

  if (params.name === LIST.name) {
    const { data, error } = await supabase.rpc('list_sparks', { token })

    if (error) return toolError(id, error.message)

    const rows = (data ?? []) as ({
      id: string
      body: string
      note: string | null
      captured_on: string
    } & Assessed)[]

    if (rows.length === 0) {
      return toolError(id, 'The inbox is empty. Nothing has been captured yet.')
    }

    /*
     * The figures are worked out here, by the same code the page uses, rather
     * than described in the tool text for the model to apply. See `derive`.
     *
     * Absent at `capture` scope, and that is deliberate rather than a
     * degradation: this tool existed before reading did and has to keep working
     * for a token that may only write. An idea then arrives with no worth
     * attached, which is honest, because not yet knowable is not zero.
     */
    const { reference, stages } = await referenceFor(supabase, token)
    const shown = rows.map((r) => ({ ...r, ...derive(r, reference, stages) }))

    /*
     * Written out as text rather than handed over as JSON. The model has to
     * pick one and quote its id back, and a short readable list is easier to
     * be right about than a nested object. The note is truncated: it is here
     * to identify a thought, not to be read back in full, which is what
     * read_idea is for.
     */
    const listed = shown
      .map((r) => {
        const note = r.note ? ` (${r.note.replace(/\s+/g, ' ').slice(0, 120)})` : ''
        const worth =
          r.shareOfTarget === null
            ? 'not worked out yet'
            : `${(r.shareOfTarget * 100).toFixed(1)}% of the year's target` +
              (r.mixedPopulations
                ? ', BUT THE POPULATIONS DIFFER so this share is not comparable'
                : '') +
              (r.targetUnderstated ? ', against a target that is a floor' : '')
        const judged =
          r.quadrant === null ? 'not scored' : `${r.quadrant}, priority ${r.priority}`
        return `${r.id}\n  ${r.captured_on}: ${r.body}${note}\n  worth: ${worth}\n  judged: ${judged}`
      })
      .join('\n')

    return reply(id, {
      content: [{ type: 'text', text: `${shown.length} waiting:\n${listed}` }],
      structuredContent: { sparks: shown },
    })
  }

  if (params.name === APPEND.name) {
    const sparkId = String(args.id ?? '').trim()
    const note = String(args.note ?? '').trim()

    if (sparkId === '') {
      return toolError(id, 'Which thought? Call list_ideas first and use an id from it.')
    }
    if (note === '') {
      return toolError(id, 'Nothing to add.')
    }

    const { error } = await supabase.rpc('append_spark_note', {
      token,
      spark_id: sparkId,
      note,
    })

    if (error) return toolError(id, error.message)

    return reply(id, {
      content: [
        {
          type: 'text',
          text: 'Added it to that thought. Nothing that was already there was changed.',
        },
      ],
    })
  }

  if (params.name === WORK.name) {
    const { data, error } = await supabase.rpc('list_work', { token })

    if (error) return toolError(id, scopeHint(error.message))

    const rows = (data ?? []) as {
      id: string
      parent_id: string | null
      project_id: string
      title: string
      type: string
      status: string
    }[]

    if (rows.length === 0) {
      return toolError(
        id,
        'No work is visible to this token. Either nothing has been created ' +
          'yet, or its owner is not a member of any project.',
      )
    }

    /*
     * The path is built by walking UP from each row rather than descending.
     * The rows arrive ordered for reading, not for building, so a parent is
     * not guaranteed to have been seen before its child; walking up needs only
     * the map and is right whatever order they came in.
     */
    const titleOf = new Map(rows.map((r) => [r.id, r.title]))
    const parentOf = new Map(rows.map((r) => [r.id, r.parent_id]))
    const pathOf = (rowId: string) => {
      const parts: string[] = []
      let at: string | null = rowId
      // Bounded by the row count, so a parent_id that somehow points into a
      // cycle cannot hang the request.
      for (let step = 0; at !== null && step <= rows.length; step += 1) {
        parts.unshift(titleOf.get(at) ?? '?')
        at = parentOf.get(at) ?? null
      }
      return parts.join(' › ')
    }

    const listed = rows
      .map((r) => `${pathOf(r.id)}  [${r.type}, ${r.status}]`)
      .join('\n')

    return reply(id, {
      content: [{ type: 'text', text: `${rows.length} pieces of work:\n${listed}` }],
      structuredContent: { work: rows.map((r) => ({ ...r, path: pathOf(r.id) })) },
    })
  }

  if (params.name === TARGET.name) {
    const { data, error } = await supabase.rpc('read_reference', { token })

    if (error) return toolError(id, scopeHint(error.message))

    return reply(id, {
      content: [
        {
          type: 'text',
          text:
            'The reference a saving is weighed against:\n' +
            JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: data as Record<string, unknown>,
    })
  }

  if (params.name === READ_IDEA.name) {
    const sparkId = String(args.id ?? '').trim()
    if (sparkId === '') {
      return toolError(id, 'Which thought? Use an id from list_ideas or past_verdicts.')
    }

    const { data, error } = await supabase.rpc('read_spark', {
      token,
      spark_id: sparkId,
    })
    if (error) return toolError(id, scopeHint(error.message))

    const row = data as (Assessed & Record<string, unknown>) | null
    if (row === null) return toolError(id, 'No such thought.')

    const { reference, stages } = await referenceFor(supabase, token)

    return reply(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...row, ...derive(row, reference, stages) }, null, 2),
        },
      ],
      structuredContent: { ...row, ...derive(row, reference, stages) },
    })
  }

  if (params.name === VERDICTS.name) {
    const { data, error } = await supabase.rpc('list_dropped_sparks', { token })
    if (error) return toolError(id, scopeHint(error.message))

    const rows = (data ?? []) as {
      id: string
      body: string
      verdict: string | null
      captured_on: string
      dropped_on: string
    }[]

    if (rows.length === 0) {
      return toolError(
        id,
        'Nothing has been decided against yet, so there is no earlier verdict ' +
          'to weigh this against.',
      )
    }

    /*
     * A verdict with no reason on it is reported as such rather than left
     * blank. «Dropped, no reason recorded» is a different thing from «dropped
     * because the lead time was six months», and only one of them is an
     * argument that should still count today.
     */
    const listed = rows
      .map(
        (r) =>
          `${r.id}\n  dropped ${r.dropped_on}: ${r.body}\n  reason: ${
            r.verdict ?? 'none recorded'
          }`,
      )
      .join('\n')

    return reply(id, {
      content: [{ type: 'text', text: `${rows.length} decided against:\n${listed}` }],
      structuredContent: { dropped: rows },
    })
  }

  return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
}

/**
 * Claude may open a GET for a server-initiated stream. This server never sends
 * anything unprompted, so it says so rather than holding a connection open.
 */
export async function GET() {
  return new NextResponse('This endpoint speaks JSON-RPC over POST.', {
    status: 405,
    headers: { allow: 'POST' },
  })
}
