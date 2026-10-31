'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { landing } from '@/lib/landing-copy'
import {
  PhoneFrame,
  SCENE_COUNT,
  Scene,
  ramp,
} from '@/components/landing/phone-screens'

// Where each scene starts and ends in the pinned act's progress. The settle
// gate (scene 2) is the peak, so it gets the widest span.
const BOUNDS = [0, 0.2, 0.44, 0.8, 1]
const FADE = 0.012
const SPAN_VH = 6.5

const PHONE_W = 288
const PHONE_H = 544

function noop() {
  return () => {}
}
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false)
}
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(prefers-reduced-motion: reduce)')
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  )
}

function sceneOpacity(i: number, p: number) {
  const inn = i === 0 ? 1 : ramp(p, BOUNDS[i] - FADE, BOUNDS[i] + FADE)
  const out =
    i === SCENE_COUNT - 1
      ? 1
      : 1 - ramp(p, BOUNDS[i + 1] - FADE, BOUNDS[i + 1] + FADE)
  return Math.min(inn, out)
}

function localT(i: number, p: number) {
  return ramp(p, BOUNDS[i], BOUNDS[i + 1])
}

/**
 * Stage and narrator. Server-rendered as a static four-up so crawlers, no-JS
 * readers and reduced-motion visitors get every screen and every caption.
 * Once hydrated, and only when motion is allowed, it becomes a pinned phone
 * whose screens are driven by scroll progress.
 */
export function PhoneStory() {
  const hydrated = useHydrated()
  const reduced = useReducedMotion()
  const pinned = hydrated && !reduced
  return pinned ? <Pinned /> : <StaticStory />
}

function StaticStory() {
  const { scenes } = landing.story
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-x-6 gap-y-14 px-4 pb-20 sm:grid-cols-2 xl:grid-cols-4">
      {scenes.map((s, i) => (
        <figure key={s.title} className="flex flex-col items-center gap-5">
          <div
            style={{
              width: PHONE_W * 0.86,
              height: PHONE_H * 0.86,
            }}
          >
            <div
              style={{
                transform: 'scale(0.86)',
                transformOrigin: 'top left',
              }}
            >
              <PhoneFrame>
                <Scene i={i} t={i === 3 ? 0.95 : 1} />
              </PhoneFrame>
            </div>
          </div>
          <figcaption className="flex max-w-[16rem] flex-col gap-1.5">
            <h3 className="font-semibold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function Pinned() {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      const travel = Math.max(r.height - window.innerHeight, 1)
      const next = Math.min(1, Math.max(0, -r.top / travel))
      setP((prev) => (Math.abs(prev - next) < 0.0015 ? prev : next))
    }
    const fit = () => {
      const wide = window.innerWidth >= 1024
      const availH = window.innerHeight * (wide ? 0.78 : 0.56)
      const availW = wide ? PHONE_W : window.innerWidth - 32
      setScale(Math.min(1, availH / PHONE_H, availW / PHONE_W))
      update()
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    fit()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', fit)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', fit)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const { scenes } = landing.story
  return (
    <div ref={ref} style={{ height: `${SPAN_VH * 100}svh` }}>
      <div className="lp-story-stage">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-center gap-5 px-4 lg:grid lg:grid-cols-[1fr_auto] lg:gap-20">
          <div className="order-2 grid w-full max-w-md lg:order-1 lg:max-w-lg">
            {scenes.map((s, i) => {
              const o = sceneOpacity(i, p)
              return (
                <div
                  key={s.title}
                  className="lp-cap flex flex-col gap-3 self-center"
                  style={{
                    opacity: o,
                    transform: `translateY(${(1 - o) * 12}px)`,
                    pointerEvents: o > 0.5 ? 'auto' : 'none',
                  }}
                >
                  <h3 className="lp-h2 text-2xl sm:text-3xl lg:text-4xl">
                    {s.title}
                  </h3>
                  <p className="text-base text-muted-foreground sm:text-lg">
                    {s.body}
                  </p>
                </div>
              )
            })}
          </div>

          <div
            className="order-1 flex flex-col items-center gap-4 lg:order-2"
            style={{ width: PHONE_W * scale, height: PHONE_H * scale }}
          >
            <div
              aria-hidden
              style={{
                width: PHONE_W,
                height: PHONE_H,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <PhoneFrame>
                {scenes.map((s, i) => (
                  <div
                    key={s.title}
                    className="absolute inset-0"
                    style={{
                      opacity: sceneOpacity(i, p),
                      pointerEvents: 'none',
                    }}
                  >
                    <Scene i={i} t={localT(i, p)} />
                  </div>
                ))}
              </PhoneFrame>
            </div>
          </div>
        </div>

        {/* Progress, not a counter: four ticks that fill as the night goes. */}
        <div
          aria-hidden
          className="absolute inset-x-4 bottom-5 mx-auto flex max-w-6xl gap-1.5"
        >
          {scenes.map((s, i) => (
            <span
              key={s.title}
              className="h-0.5 flex-1 overflow-hidden rounded-full bg-[color:var(--lp-dark-line)]"
            >
              <span
                className="lp-rail-fill block h-full w-full origin-left bg-[color:var(--lp-accent)]"
                style={{ transform: `scaleX(${localT(i, p)})` }}
              />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
