import { redirect } from 'next/navigation'

/**
 * Reading form data. These four lived in nine server action files in nine
 * identical copies; a change to one of them was a change nobody made to the
 * other eight.
 *
 * Plain module, not 'use server': a server action file may only export async
 * functions, so shared helpers cannot live in one.
 */

/** An empty string is not a value. It is an empty field. */
export function text(fd: FormData, key: string): string | null {
  const value = String(fd.get(key) ?? '').trim()
  return value === '' ? null : value
}

export function required(fd: FormData, key: string): string {
  const value = text(fd, key)
  if (value === null) throw new Error(`The field "${key}" is required.`)
  return value
}

/**
 * Every value under one name, cleaned, deduplicated and in the order given.
 *
 * What a person picker submits. A single-person field sends one value and a
 * multi-person one sends several under the same name, so both are read the
 * same way and a field that holds one person is simply a list of one. An empty
 * option is how «nobody» is said, and it disappears here rather than being
 * stored as a blank id.
 */
export function ids(fd: FormData, key: string): string[] {
  const out: string[] = []
  for (const raw of fd.getAll(key)) {
    const value = String(raw).trim()
    if (value !== '' && !out.includes(value)) out.push(value)
  }
  return out
}

/** A number written with a comma is still a number. */
export function number(fd: FormData, key: string): number | null {
  const raw = text(fd, key)
  if (raw === null) return null
  const parsed = Number(raw.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** Back to where the form was submitted from. */
export function back(fd: FormData): never {
  redirect(String(fd.get('redirectTo') ?? '/'))
}
