'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const GAP = 6
/** Never let the menu touch the screen edge on a narrow phone. */
const MARGIN = 8

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

  // Positioned by writing styles rather than through state: the menu is
  // measured and placed in the same frame it mounts, so it never renders once
  // in the wrong spot and again in the right one.
  const place = useCallback(() => {
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return

    const a = anchor.getBoundingClientRect()
    const { width, height } = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // Aligned to the anchor's right edge, then pulled back inside the screen
    // rather than allowed to hang off it.
    let left = a.right - width
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - width - MARGIN))

    // Below by default; above when there isn't room, which is what happens
    // when the anchor sits near the bottom of a short screen.
    let top = a.bottom + GAP
    if (top + height > vh - MARGIN) {
      const above = a.top - height - GAP
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - height - MARGIN)
    }

    menu.style.top = `${top}px`
    menu.style.left = `${left}px`
    menu.style.visibility = 'visible'
  }, [anchorRef])

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node
      if (node) place()
    },
    [place]
  )

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
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100]"
        aria-hidden
        onClick={onClose}
        onTouchStart={onClose}
      />
      <div
        ref={attach}
        role="menu"
        aria-label={label}
        className="material fixed z-[101] flex min-w-52 max-w-[calc(100vw-1rem)] flex-col gap-0.5 rounded-2xl border border-border/60 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl"
        // Off-screen and hidden until `attach` has measured it.
        style={{ top: -9999, left: -9999, visibility: 'hidden' }}
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
