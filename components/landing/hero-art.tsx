'use client'

import { useEffect, useRef } from 'react'
import { Chip } from '@/components/landing/chip'
import { formatCents } from '@/lib/money'
import {
  demoTransfers,
  playerName,
  potCents,
  seedBuyIns,
  seedCounts,
} from '@/lib/landing-demo'

const buyIns = seedBuyIns()
const transfer = demoTransfers(buyIns, { ...seedCounts(), sam: 4300 })![0]

/**
 * Three planes that move at different rates as the page scrolls: soft far
 * chips, a mid plane with real-looking game cards, sharp near chips that
 * overlap the cards. Depth comes from the different rates and from the near
 * chips occluding the mid plane. Transforms only, one shared scroll value.
 */
export function HeroArt() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const tick = () => {
      raf = 0
      el.style.setProperty('--hy', String(Math.min(window.scrollY, 900)))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const move = (k: number) => ({
    transform: `translate3d(0, calc(var(--hy, 0) * ${k} * 1px), 0)`,
  })

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative mx-auto h-[26rem] w-full max-w-[30rem] sm:h-[32rem] lg:h-[36rem]"
    >
      {/* Far plane: large, soft, slow. */}
      <div className="lp-layer" style={move(-0.06)}>
        <div
          className="lp-drop absolute -right-6 top-2 opacity-70 blur-[3px]"
          style={{ ['--d' as string]: '120ms' }}
        >
          <Chip tone="bone" size={210} style={{ transform: 'rotate(-14deg)' }} />
        </div>
        <div
          className="lp-drop absolute -left-4 bottom-10 opacity-60 blur-[2px]"
          style={{ ['--d' as string]: '240ms' }}
        >
          <Chip tone="ink" size={170} style={{ transform: 'rotate(18deg)' }} />
        </div>
      </div>

      {/* Mid plane: the cards. */}
      <div className="lp-layer" style={move(-0.16)}>
        <div
          className="lp-rise absolute left-[8%] top-[18%] w-[15.5rem] rounded-2xl border bg-card p-4 shadow-[0_24px_40px_-24px_rgb(0_0_0/0.35)]"
          style={{ ['--d' as string]: '380ms' }}
        >
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Pot
          </p>
          <p className="money-display mt-2 text-5xl font-semibold">
            {formatCents(potCents(buyIns))}
          </p>
          <p className="money mt-2 text-xs text-muted-foreground">
            20,000 chips · six players
          </p>
        </div>
        <div
          className="lp-rise absolute right-[2%] top-[54%] w-[16.5rem] rounded-2xl border bg-card p-4 shadow-[0_24px_40px_-24px_rgb(0_0_0/0.35)]"
          style={{ ['--d' as string]: '520ms' }}
        >
          <p className="text-sm">
            <span className="font-medium">{playerName(transfer.fromMemberId)}</span>{' '}
            pays{' '}
            <span className="font-medium">{playerName(transfer.toMemberId)}</span>
          </p>
          <p className="money-display mt-2 text-3xl font-semibold">
            {formatCents(transfer.amountCents)}
          </p>
          <p className="mt-2 text-xs text-pending" style={{ color: 'var(--lp-accent)' }}>
            ✓ Confirmed
          </p>
        </div>
      </div>

      {/* Near plane: sharp, fast, in front of the cards. */}
      <div className="lp-layer" style={move(-0.34)}>
        <div
          className="lp-drop absolute bottom-[8%] right-[14%]"
          style={{ ['--d' as string]: '640ms' }}
        >
          <Chip tone="green" size={104} style={{ transform: 'rotate(-8deg)' }} />
        </div>
        <div
          className="lp-drop absolute bottom-[2%] right-[30%]"
          style={{ ['--d' as string]: '760ms' }}
        >
          <Chip tone="ink" size={76} style={{ transform: 'rotate(22deg)' }} />
        </div>
        <div
          className="lp-drop absolute left-[2%] top-[44%]"
          style={{ ['--d' as string]: '700ms' }}
        >
          <Chip tone="bone" size={64} style={{ transform: 'rotate(-30deg)' }} />
        </div>
      </div>
    </div>
  )
}
