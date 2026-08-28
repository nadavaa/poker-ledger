'use client'

import { useSyncExternalStore } from 'react'

const EVENT = 'themechange'

/** Reads the theme off the document so it survives the no-flash script. */
function useIsDark() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange)
      return () => window.removeEventListener(EVENT, onChange)
    },
    () => document.documentElement.classList.contains('dark'),
    () => false // light is the default
  )
}

export function ThemeToggle() {
  const dark = useIsDark()

  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      // Private mode or blocked storage: the choice just won't persist.
    }
    window.dispatchEvent(new Event(EVENT))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition-[transform,color,background-color] duration-100 active:scale-95 active:bg-muted"
    >
      {dark ? (
        // Moon
        <svg viewBox="0 0 20 20" className="size-4 fill-current" aria-hidden>
          <path d="M17 11.7A7.5 7.5 0 0 1 8.3 3a7.5 7.5 0 1 0 8.7 8.7Z" />
        </svg>
      ) : (
        // Sun
        <svg
          viewBox="0 0 20 20"
          className="size-4 fill-none stroke-current stroke-[1.6]"
          aria-hidden
        >
          <circle cx="10" cy="10" r="3.6" />
          <path
            strokeLinecap="round"
            d="M10 1.8v1.6M10 16.6v1.6M18.2 10h-1.6M3.4 10H1.8M15.8 4.2l-1.1 1.1M5.3 14.7l-1.1 1.1M15.8 15.8l-1.1-1.1M5.3 5.3 4.2 4.2"
          />
        </svg>
      )}
    </button>
  )
}
