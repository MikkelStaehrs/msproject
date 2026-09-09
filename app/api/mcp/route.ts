import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  'markdown pipe table (| Item | Price |) and it will be shown as a table. ' +
  'Never as a run of semicolons. Prose and a table may sit together, ' +
  'separated by a blank line.'

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

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }

const reply = (id: unknown, result: unknown) =>
  NextResponse.json({ jsonrpc: '2.0', id, result })

const fail = (id: unknown, code: number, message: string) =>
  NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } })

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
    return reply(id, { tools: [CAPTURE, LIST, APPEND] })
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

    const rows = (data ?? []) as {
      id: string
      body: string
      note: string | null
      captured_on: string
    }[]

    if (rows.length === 0) {
      return toolError(id, 'The inbox is empty. Nothing has been captured yet.')
    }

    /*
     * Written out as text rather than handed over as JSON. The model has to
     * pick one and quote its id back, and a short readable list is easier to
     * be right about than a nested object. The note is truncated: it is here
     * to identify a thought, not to be read back in full.
     */
    const listed = rows
      .map((r) => {
        const note = r.note ? ` (${r.note.replace(/\s+/g, ' ').slice(0, 120)})` : ''
        return `${r.id} — ${r.captured_on} — ${r.body}${note}`
      })
      .join('\n')

    return reply(id, {
      content: [{ type: 'text', text: `${rows.length} waiting:\n${listed}` }],
      structuredContent: { sparks: rows },
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
