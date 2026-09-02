'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// The Navigation API isn't in TypeScript's DOM lib yet. Only the surface used
// here is declared, rather than pulling in a polyfill's types wholesale.
interface NavigateEventLike extends Event {
  navigationType: 'push' | 'replace' | 'reload' | 'traverse'
  destination: { url: string }
}
interface NavigationLike {
  addEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void
  ): void
  removeEventListener(
    type: 'navigate',
    listener: (event: NavigateEventLike) => void
  ): void
}
declare global {
  interface Window {
    navigation?: NavigationLike
  }
}

/**
 * Depth in the hierarchy. The browser has no idea whether a navigation goes
 * deeper or back, so this is what tells the CSS which way to slide.
 *
 * Anything returning null is out of scope — settings, edit pages, the new-game
 * form, tab switches — and gets no slide at all rather than a guessed
 * direction.
 */
function depthOf(pathname: string): number | null {
  if (pathname === '/') return 0
  if (/^\/groups\/[^/]+$/.test(pathname)) return 1
  if (/^\/games\/[^/]+$/.test(pathname)) return 2
  return null
}

const SETTINGS = '/settings'

type Pending = { path: string; resolve: () => void } | null

export function NavTransitions() {
  const pathname = usePathname()
  const router = useRouter()

  const currentPath = useRef(pathname)
  const pending = useRef<Pending>(null)
  const active = useRef<ViewTransition | null>(null)

  // Resolves the in-flight transition once the new route has actually
  // committed, so the animation ends on real content rather than a guess.
  useEffect(() => {
    currentPath.current = pathname
    if (pending.current && pending.current.path === pathname) {
      pending.current.resolve()
      pending.current = null
    }
  }, [pathname])

  useEffect(() => {
    // Both are required. With only one of them, forward would animate and back
    // would not, which reads as broken rather than as plain navigation.
    const navigationApi = window.navigation
    // Both are required. With only one of them, forward would animate and back
    // would not, which reads as broken rather than as plain navigation.
    if (!('startViewTransition' in document) || !navigationApi) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement

    function direction(toPath: string): 'push' | 'pop' | null {
      const fromPath = currentPath.current
      if (toPath === fromPath) return null

      // Settings sits outside the hierarchy, so depth would get it wrong —
      // returning to a game would compute as a push and animate backwards.
      // It always arrives from the right and always leaves to the right,
      // whatever it was opened from.
      if (toPath === SETTINGS) return 'push'
      if (fromPath === SETTINGS) return 'pop'

      const from = depthOf(fromPath)
      const to = depthOf(toPath)
      if (from === null || to === null || from === to) return null
      return to > from ? 'push' : 'pop'
    }

    /** Never hangs: if the destination is slow we transition into whatever is
     *  on screen — the skeleton — rather than holding the old page. */
    function waitForRoute(path: string) {
      return new Promise<void>((resolve) => {
        if (currentPath.current === path) return resolve()
        pending.current = { path, resolve }
        window.setTimeout(() => {
          if (pending.current?.path === path) {
            pending.current = null
            resolve()
          }
        }, 600)
      })
    }

    function run(dir: 'push' | 'pop', commit: () => void, path: string) {
      // A second tap replaces the first rather than queueing behind it.
      active.current?.skipTransition()
      root.dataset.nav = dir
      const transition = document.startViewTransition(async () => {
        commit()
        await waitForRoute(path)
      })
      active.current = transition
      transition.finished.finally(() => {
        if (active.current === transition) {
          active.current = null
          root.removeAttribute('data-nav')
        }
      })
    }

    // Next's Link swallows the click and pushes history itself, which the
    // Navigation API never sees — so forward navigation is driven from here.
    function onClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as
        | HTMLAnchorElement
        | null
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return
      }
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin) return

      const dir = direction(url.pathname)
      if (!dir) return

      event.preventDefault()
      event.stopPropagation()
      run(dir, () => router.push(url.pathname + url.search), url.pathname)
    }

    // Back, forward, and the iOS edge swipe all arrive as a traversal. This
    // fires before the DOM changes, so the old state is still snapshottable.
    function onNavigate(e: NavigateEventLike) {
      if (e.navigationType !== 'traverse') return
      const url = new URL(e.destination.url)
      if (url.origin !== location.origin) return

      const dir = direction(url.pathname)
      if (!dir) return

      // Not intercepted: the browser and Next still perform the traversal.
      // This only wraps it so the frames either side get animated.
      run(dir, () => {}, url.pathname)
    }

    document.addEventListener('click', onClick, true)
    navigationApi.addEventListener('navigate', onNavigate)
    return () => {
      document.removeEventListener('click', onClick, true)
      navigationApi.removeEventListener('navigate', onNavigate)
    }
  }, [router])

  return null
}
