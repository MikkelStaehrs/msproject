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
 * ONE TOOL, AND IT ONLY WRITES. That is the security design, not a limitation
 * left for later. This endpoint holds no Supabase privileges: it calls
 * capture_spark with the public anon key, and that function can create a spark
 * and nothing else. A stolen token buys the ability to put text in one person's
 * private inbox. Not the tree, not the prices, not the documents.
 */

const PROTOCOL = '2025-06-18'

const TOOL = {
  name: 'capture_idea',
  title: 'Capture an idea in Task Studio',
  description:
    'Save a thought to the Sparks inbox in Task Studio, to be triaged later. ' +
    'Use it for a half-formed idea, something to look into, or something worth ' +
    'doing that has no project yet. ' +
    'This is a capture step, not a planning step: do not turn it into a task, ' +
    'do not propose a breakdown, and do not ask which project it belongs to. ' +
    'Those are decided later with the whole tree in view.',
  inputSchema: {
    type: 'object',
    properties: {
      idea: {
        type: 'string',
        description:
          'The thought itself, in the words the user said it in. Do not ' +
          'rephrase, expand or tidy this.',
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
          'Where the substance really is a list of things with values against ' +
          'them, such as equipment with prices or options with lead times, ' +
          'write that part as a markdown pipe table and it will be shown as a ' +
          'table. Prose and a table may sit in the same context, separated by ' +
          'a blank line.',
      },
    },
    required: ['idea'],
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
    return reply(id, { tools: [TOOL] })
  }

  if (method !== 'tools/call') {
    return fail(id, -32601, `Unknown method: ${method}`)
  }

  // --- The one tool ---------------------------------------------------------

  const params = message.params ?? {}
  if (params.name !== TOOL.name) {
    return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
  }

  const args = (params.arguments ?? {}) as Record<string, unknown>
  const idea = String(args.idea ?? '').trim()
  const context = String(args.context ?? '').trim()
  if (idea === '') {
    return toolError(id, 'Nothing to save. Say the thought and I will keep it.')
  }

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
   * The anon key, deliberately. It is public and it opens nothing on its own:
   * every table refuses it. The token in the header is the credential, and
   * capture_spark is the only thing it unlocks.
   */
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await supabase.rpc('capture_spark', {
    token,
    body: idea,
    note: context === '' ? null : context,
  })

  if (error) {
    return toolError(id, error.message)
  }

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
