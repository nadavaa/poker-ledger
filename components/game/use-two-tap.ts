'use client'

import { useEffect, useRef, useState } from 'react'

/** How long an armed card waits for its second tap. */
export const ARM_MS = 5000

/**
 * Two taps to add a buy-in: the first arms a card, the second confirms it.
 * One card at a time, so a stray tap on a neighbour re-arms rather than
 * adding money for the wrong person. Tapping anywhere outside the armed
 * card, scrolling, or waiting ARM_MS disarms.
 *
 * `adding` counts confirmed taps still on their way to the database, per
 * member, so the card can show the new total on the tap.
 */
export function useTwoTap(onConfirm: (memberId: string) => Promise<void>) {
  const [armed, setArmed] = useState<{ memberId: string; key: number } | null>(
    null
  )
  const [adding, setAdding] = useState<Record<string, number>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  function disarm() {
    clearTimer()
    setArmed(null)
  }

  async function confirm(memberId: string) {
    setAdding((m) => ({ ...m, [memberId]: (m[memberId] ?? 0) + 1 }))
    try {
      await onConfirm(memberId)
    } finally {
      setAdding((m) => {
        const left = (m[memberId] ?? 1) - 1
        const next = { ...m }
        if (left > 0) next[memberId] = left
        else delete next[memberId]
        return next
      })
    }
  }

  function tap(memberId: string) {
    if (armed?.memberId === memberId) {
      disarm()
      void confirm(memberId)
      return
    }
    clearTimer()
    setArmed({ memberId, key: Date.now() })
    timer.current = setTimeout(() => setArmed(null), ARM_MS)
  }

  useEffect(() => {
    if (!armed) return
    // Capture phase, so this runs before the tapped card's own handlers.
    function onDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (target?.closest('[data-armed-card]')) return
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setArmed(null)
    }
    function onScroll() {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setArmed(null)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll)
    }
  }, [armed])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return { armed, adding, tap, disarm }
}
