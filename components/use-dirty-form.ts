'use client'

import { useState } from 'react'

/**
 * Keeps a Save button honest: disabled until the form actually differs from
 * what's stored, disabled again the moment an edit is reverted.
 *
 * Comparison runs on normalized values, never raw input — a phone stored as
 * "+15552345678" renders as "(555) 234-5678", so comparing what's on screen
 * would mark the form dirty the instant it loaded and the button would never
 * grey out.
 */
export function useDirtyForm<T extends Record<string, string>>({
  initial,
  normalize,
  isValid,
}: {
  initial: T
  /** Trim, strip a leading @, parse a phone to E.164 — whatever this form needs. */
  normalize: (fields: T) => T
  isValid: (fields: T) => boolean
}) {
  const [fields, setFields] = useState<T>(initial)
  const [baseline, setBaseline] = useState<T>(() => normalize(initial))
  const [pending, setPending] = useState(false)

  const current = normalize(fields)
  const dirty = (Object.keys(current) as (keyof T)[]).some(
    (k) => current[k] !== baseline[k]
  )
  const valid = isValid(fields)

  function set(key: keyof T, value: string) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  /** Call after a successful save so the button greys out again. */
  function commit() {
    setBaseline(current)
  }

  return {
    fields,
    current,
    set,
    dirty,
    valid,
    pending,
    setPending,
    commit,
    canSave: dirty && valid && !pending,
  }
}
