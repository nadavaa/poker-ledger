'use client'

import { useEffect, useRef, useState } from 'react'
import { roundToWholeDollar } from '@/lib/money'

/**
 * Integer cents that glide to `target` whenever it changes, so a confirmed
 * buy-in reads as $150 counting up to $200 rather than a swap. Steps in
 * whole dollars so the in-between frames never show stray cents, and lands
 * exactly on `target`. No animation on first render or with reduced motion.
 */
export function useCountUp(
  target: number,
  { durationMs = 450, delayMs = 0 }: { durationMs?: number; delayMs?: number } = {}
): { value: number; done: number } {
  const [value, setValue] = useState(target)
  // Bumps each time a glide lands, so the caller can key a settle pop on it.
  const [done, setDone] = useState(0)
  const shown = useRef(target)
  const frame = useRef<number | null>(null)
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const from = shown.current
    if (from === target) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Reduced motion: the same path with no duration, so it lands in one frame.
    const ms = reduced ? 0 : durationMs
    const pause = reduced ? 0 : delayMs

    function step(start: number, now: number) {
      const t = ms === 0 ? 1 : Math.min(1, (now - start) / ms)
      // Ease-out cubic: quick off the mark, settles gently on the number.
      const eased = 1 - Math.pow(1 - t, 3)
      const next =
        t === 1 ? target : roundToWholeDollar(Math.round(from + (target - from) * eased))
      shown.current = next
      setValue(next)
      if (t < 1) {
        frame.current = requestAnimationFrame((n) => step(start, n))
      } else {
        frame.current = null
        setDone((d) => d + 1)
      }
    }

    wait.current = setTimeout(() => {
      frame.current = requestAnimationFrame((n) => step(n, n))
    }, pause)

    return () => {
      if (wait.current) clearTimeout(wait.current)
      if (frame.current) cancelAnimationFrame(frame.current)
      wait.current = null
      frame.current = null
    }
  }, [target, durationMs, delayMs])

  return { value, done }
}
