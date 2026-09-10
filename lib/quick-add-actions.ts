'use server'

import { revalidatePath } from 'next/cache'
import { today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { guessWaitingOnType, parseQuickAdd } from '@/lib/quick-add'
import { settleRecipient } from '@/lib/recipient-data'
import type { EntryKind } from '@/lib/types'

export type QuickAddResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

/**
 * One entry point for every move. The client sends raw text and the server
 * parses it itself, so a bug in the overlay can never write something other
 * than what the user was told would happen.
 */
export async function quickAdd(input: {
  nodeId: string
  raw: string
  /**
   * Optional, and no longer sent by the overlay. Nobody is asked which kind of
   * log line they are writing: it follows from where the line was written, and
   * quick entry is `work`.
   */
  entryKind?: EntryKind
}): Promise<QuickAddResult> {
  const intent = parseQuickAdd(input.raw, input.entryKind)

  if (intent.kind === 'empty') return { ok: false, error: 'Write something first.' }
  if (intent.kind === 'invalid') return { ok: false, error: intent.reason }

  const supabase = await createClient()

  const { data: target, error: targetError } = await supabase
    .from('node')
    .select('id, title')
    .eq('id', input.nodeId)
    .single()

  if (targetError || !target) {
    return { ok: false, error: 'The target no longer exists. Pick another node.' }
  }

  if (intent.kind === 'entry') {
    const { error } = await supabase.from('entry').insert({
      node_id: target.id,
      kind: intent.entryKind,
      body: intent.body,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true, message: `Logged on ${target.title}` }
  }

  if (intent.kind === 'task') {
    const { data: last } = await supabase
      .from('node')
      .select('sort_order')
      .eq('parent_id', target.id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const { error } = await supabase.from('node').insert({
      parent_id: target.id,
      type: 'task',
      title: intent.title,
      status: 'planned',
      sort_order: (last?.[0]?.sort_order ?? 0) + 10,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return { ok: true, message: `Task created under ${target.title}` }
  }

  if (intent.kind === 'blocker') {
    /*
     * The spelling is settled against the recipients already in use, so the
     * chart on /blockers never splits «Project Board» from «project board».
     * The expected reply is the median of the waits that recipient has already
     * closed: without it a quick added blocker had no date at all, and the
     * Progress rule could never take it past At Risk however long it sat.
     */
    const today = todayIso()
    const { name, expectedBy } = await settleRecipient(supabase, intent.waitingOn, today)

    const { error } = await supabase.from('blocker').insert({
      node_id: target.id,
      title: intent.title,
      waiting_on: name,
      waiting_on_type: guessWaitingOnType(name),
      expected_by: expectedBy,
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/', 'layout')
    return {
      ok: true,
      message: expectedBy
        ? `Blocker opened, waiting on ${name}, reply expected ${expectedBy}`
        : `Blocker opened, waiting on ${name}`,
    }
  }

  const { error } = await supabase.from('decision').insert({
    node_id: target.id,
    decision: intent.decision,
    rationale: intent.rationale,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  return {
    ok: true,
    message: intent.rationale
      ? `Decision recorded on ${target.title}`
      : `Decision recorded, add the rationale on the project page`,
  }
}
