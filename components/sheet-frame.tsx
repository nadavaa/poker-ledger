'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** How long a sheet takes to slide away; matches sheet-down. */
const SHEET_EXIT_MS = 220

/**
 * The backdrop and panel every bottom sheet shares, with the motion: the
 * backdrop fades and the panel rises on open, and the same runs in reverse
 * on close before it unmounts. Reopening mid-exit turns it back around.
 *
 * Render it unconditionally and drive it with `open`; unmounting it skips
 * the exit. Whatever the content reads has to outlive `open` too: clear it
 * on close and the sheet slides away empty.
 */
export function SheetFrame({
  open,
  onClose,
  backdropClassName,
  panelClassName,
  portal = false,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Position, z-index and dim colour of the full-screen layer. */
  backdropClassName: string
  panelClassName: string
  /** Render at the document root, out of any stacking context. */
  portal?: boolean
  children: ReactNode
}) {
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  if (open && !shown) setShown(true)
  if (open && closing) setClosing(false)
  if (!open && shown && !closing) setClosing(true)

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => {
      setShown(false)
      setClosing(false)
    }, SHEET_EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])

  if (!shown) return null
  // A portal needs the document; an in-tree sheet renders on the server.
  if (portal && typeof document === 'undefined') return null

  const sheet = (
    <div
      className={`${backdropClassName} ${
        closing
          ? 'pointer-events-none animate-[backdrop-out_220ms_ease-in_forwards]'
          : 'animate-[backdrop-in_200ms_ease-out]'
      }`}
      onClick={onClose}
    >
      <div
        className={`${panelClassName} ${
          closing
            ? 'animate-[sheet-down_220ms_cubic-bezier(0.4,0,1,1)_forwards]'
            : 'animate-[sheet-up_280ms_cubic-bezier(0.32,0.72,0,1)]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )

  return portal ? createPortal(sheet, document.body) : sheet
}
