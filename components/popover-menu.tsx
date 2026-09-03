'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
/** Never let the menu touch the screen edge on a narrow phone. */
const MARGIN = 8

// Faster than the 280ms page transition: a menu is a smaller commitment than
// a screen. Out is quicker than in, because a thing you've dismissed should
// get out of the way.
const OPEN_MS = 170
const CLOSE_MS = 140

/**
 * A menu anchored to the control that opened it, rendered in a portal at the
 * document root.
 *
 * The portal is the point, not a detail: raising z-index inside the page tree
 * does nothing when an ancestor has a transform, filter or opacity, because
 * that ancestor creates a stacking context the child can never escape. The
 * page transition wrapper is exactly such an ancestor, which is how this menu
 * ended up underneath the sticky Start game button.
 *
 * The backdrop is transparent but present, so while the menu is open nothing
 * behind it — sticky buttons included — is tappable.
 */
export function PopoverMenu({
  open,
  anchorRef,
  onClose,
  label,
  children,
}: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{
    top: number
    left: number
    origin: string
  } | null>(null)

  // `mounted` lags `open` on the way out so the close animation can play;
  // `entered` lags mount by a frame so there is something to animate from.
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  if (open && !mounted) setMounted(true)

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return

    const a = anchor.getBoundingClientRect()
    // offsetWidth, not the bounding rect: the menu is mid-scale while it
    // animates, and a scaled rect would place it a few pixels out.
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Aligned to the anchor's right edge, then pulled back inside the screen
    // rather than allowed to hang off it.
    const wanted = a.right - width
    const left = Math.min(
      Math.max(wanted, MARGIN),
      Math.max(MARGIN, vw - width - MARGIN)
    )

    // Below by default; above when there isn't room, which is what happens
    // when the anchor sits near the bottom of a short screen.
    let top = a.bottom + GAP
    let below = true
    if (top + height > vh - MARGIN) {
      const above = a.top - height - GAP
      below = false
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - height - MARGIN)
    }

    setPos({
      top,
      left,
      // Grow out of the corner nearest the trigger, so the menu reads as
      // coming from the dots rather than appearing over them.
      origin: `${below ? 'top' : 'bottom'} ${
        left === wanted ? 'right' : 'left'
      }`,
    })
  }, [anchorRef])

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node
      if (node) place()
    },
    [place]
  )

  useEffect(() => {
    if (!mounted) return
    // One frame at the "from" values, so the transition has somewhere to
    // start. rAF rather than a timeout: no duration to guess at.
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [mounted])

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Scrolling the page under an anchored menu leaves it pointing at
    // nothing, so follow the anchor rather than stranding it.
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, onClose, place])

  // Only ever opened by a tap, so this never runs during SSR.
  if (!mounted || typeof document === 'undefined') return null

  const visible = open && entered

  return createPortal(
    <>
      {/* Click only. Closing on touchstart as well unmounted this backdrop
          before the tap finished, so the click landed on the trigger
          underneath and toggled the menu straight back open. One tap, one
          handler — not a timeout hiding the second one. */}
      <div className="fixed inset-0 z-[100]" aria-hidden onClick={onClose} />
      <div
        ref={attach}
        role="menu"
        aria-label={label}
        onTransitionEnd={(e) => {
          // The close finished: now it can leave. Guarded on `open` so a
          // reopen mid-close doesn't unmount the menu the user just asked for.
          if (e.target === e.currentTarget && !open) {
            setMounted(false)
            setEntered(false)
            setPos(null)
          }
        }}
        className={`material fixed z-[101] flex min-w-52 max-w-[calc(100vw-1rem)] flex-col gap-0.5 rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl transition-[opacity,transform] ${
          visible
            ? 'scale-100 opacity-100 duration-[170ms] ease-[cubic-bezier(0.32,0.72,0,1)]'
            : 'scale-95 opacity-0 duration-[140ms] ease-[cubic-bezier(0.4,0,1,1)]'
        }`}
        // Off-screen until `attach` has measured it, which happens in the
        // same commit — so there is no frame where it is drawn in the wrong
        // place. Transitions interpolate from wherever they are, so a fast
        // toggle reverses rather than queuing a second animation.
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          transformOrigin: pos?.origin,
          visibility: pos ? 'visible' : 'hidden',
          transitionDuration: visible ? `${OPEN_MS}ms` : `${CLOSE_MS}ms`,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

/** One row of a PopoverMenu. Full 44px target, whatever the label's length. */
export function PopoverMenuItem({
  onClick,
  destructive = false,
  disabled = false,
  children,
}: {
  onClick: () => void
  destructive?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left text-[0.9375rem] transition-colors active:bg-muted disabled:opacity-50 ${
        destructive ? 'text-down' : 'text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
