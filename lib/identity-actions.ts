'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  APPROVAL_STATES,
  EDITABLE_ADMIN_FIELDS,
  CURRENCIES,
  PEOPLE_FIELDS,
  PID_FIELDS,
  type Currency,
  type FieldDef,
} from '@/lib/identity'
import { ids, number, required, text } from '@/lib/form'

/** Fields that are not submitted are left standing in the jsonb. */
/**
 * The same, for the fields that hold people.
 *
 * Answering a role clears the leftover name for that role and only that role:
 * picking a project manager says nothing about who the old product owner was.
 */
function collectIds(
  fd: FormData,
  prefix: string,
  fields: FieldDef[],
  current: Record<string, unknown>,
  named: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current }
  for (const f of fields) {
    const name = `${prefix}${f.key}`
    if (!fd.has(name)) continue
    const picked = ids(fd, name)
    if (picked.length === 0) delete next[f.key]
    else {
      next[f.key] = picked
      delete named[f.key]
    }
  }
  return next
}

function collect(
  fd: FormData,
  prefix: string,
  fields: FieldDef[],
  current: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current }
  for (const f of fields) {
    const name = `${prefix}${f.key}`
    if (!fd.has(name)) continue
    const value = text(fd, name)
    if (value === null) delete next[f.key]
    else next[f.key] = value
  }
  return next
}

/**
 * Saves the whole identity at once. Fields that have a column on `node` are
 * written as columns; the rest is merged into `reporting`, so stage, folders
 * and everything else already there survives.
 */
export async function saveIdentity(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')

  const { data: existing } = await supabase
    .from('node')
    .select('reporting')
    .eq('id', id)
    .single()

  const reporting = { ...((existing?.reporting ?? {}) as Record<string, unknown>) }

  Object.assign(reporting, collect(fd, 'admin_', EDITABLE_ADMIN_FIELDS, reporting))

  /*
   * The typed priority is not merely no longer written, it is cleared from any
   * project still carrying one. A key left behind in the jsonb is a value that
   * still reads back, and the next person to add a `priority` field would find
   * it mysteriously pre-filled with a word nobody chose this year.
   */
  delete reporting.priority

  /*
   * Roles hold account ids now, so they are collected as lists rather than as
   * strings. `people_named`, the names that matched no account when the roles
   * were converted, is left exactly as it is: nothing writes it, and saving
   * this form must not quietly erase the one record of who used to be on a
   * project. It goes per role, when that role gets a real account.
   */
  const named = { ...((reporting.people_named ?? {}) as Record<string, unknown>) }
  reporting.people = collectIds(
    fd,
    'people_',
    PEOPLE_FIELDS,
    (reporting.people ?? {}) as Record<string, unknown>,
    named,
  )
  reporting.people_named = named
  reporting.pid = collect(
    fd,
    'pid_',
    PID_FIELDS,
    (reporting.pid ?? {}) as Record<string, unknown>,
  )

  const location = text(fd, 'location')
  if (location === null) delete reporting.location
  else reporting.location = location

  const approvalState = text(fd, 'approval_state')
  reporting.approval = {
    state:
      approvalState !== null && (APPROVAL_STATES as readonly string[]).includes(approvalState)
        ? approvalState
        : 'Not applied',
    decided_on: text(fd, 'approval_decided_on'),
    amount: number(fd, 'approval_amount'),
    by: text(fd, 'approval_by'),
  }

  const currency = text(fd, 'currency')
  const benefit = number(fd, 'benefit')
  const cost = number(fd, 'cost')
  reporting.economics = {
    benefit,
    cost,
    currency: ((CURRENCIES as readonly string[]).includes(String(currency))
      ? currency
      : 'DKK') as Currency,
  }

  const { error } = await supabase
    .from('node')
    .update({
      title: required(fd, 'title'),
      description: text(fd, 'description'),
      driver_id: text(fd, 'driver_id'),
      start_date: text(fd, 'start_date'),
      due_date: text(fd, 'due_date'),
      reporting,
    })
    .eq('id', id)

  if (error) throw new Error(`Could not save the identity: ${error.message}`)

  revalidatePath('/', 'layout')
  redirect(`/p/${id}/identitet`)
}
