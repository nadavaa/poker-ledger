'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

/** How long a sheet with `enter` takes to slide away; matches sheet-down. */
const SHEET_EXIT_MS = 220

/**
 * The bottom sheet, for the things that are too big to be a menu — a form, a
 * choice with an explanation.
 *
 * Portalled to the document root for the same reason the popover is: inside
 * the page tree it sits in whatever stacking context the transition wrapper
 * creates, and a sticky button in a sibling subtree draws straight through
 * the middle of it however high its z-index goes.
 */
export function ActionSheet({
  open,
  title,
  description,
  onClose,
  hideCancel = false,
  enter = false,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  /** For a sheet whose own buttons already include the way out — a second
   *  Cancel underneath them is one more thing to read. */
  hideCancel?: boolean
  /** Slide the sheet up and fade the backdrop in on open, and run the same
   *  in reverse on close, rather than popping in and out. */
  enter?: boolean
  children: ReactNode
}) {
  // With `enter`, the sheet stays mounted for its exit after `open` goes
  // false, then unmounts. Reopening mid-exit just turns it back around.
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  if (open && !shown) setShown(true)
  if (open && closing) setClosing(false)
  if (!open && shown && !closing) {
    if (enter) setClosing(true)
    else setShown(false)
  }
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => {
      setShown(false)
      setClosing(false)
    }, SHEET_EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])

  // Only ever opened by a tap, so this never runs during SSR.
  if (!shown || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/50 sm:items-center ${
        closing
          ? 'pointer-events-none animate-[backdrop-out_220ms_ease-in_forwards]'
          : enter
            ? 'animate-[backdrop-in_200ms_ease-out]'
            : ''
      }`}
      onClick={onClose}
    >
      <div
        className={`material w-full max-w-md rounded-t-3xl border-t border-white/10 bg-popover/95 p-4 pb-safe backdrop-blur-xl sm:rounded-3xl ${
          closing
            ? 'animate-[sheet-down_220ms_cubic-bezier(0.4,0,1,1)_forwards]'
            : enter
              ? 'animate-[sheet-up_280ms_cubic-bezier(0.32,0.72,0,1)]'
              : ''
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}

        <div className="mt-3 flex flex-col gap-1.5">{children}</div>

        {!hideCancel && (
          <Button
            variant="ghost"
            className="mt-3 h-11 w-full rounded-xl"
            onClick={onClose}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>,
    document.body
  )
}

/** The dots that make a hidden gesture findable. */
export function DotsButton({
  label,
  onClick,
  /** 'icon' is the full 44px target, for dots that stand alone rather than
   *  sitting inside a row that is itself tappable. */
  size = 'icon-xs',
}: {
  label: string
  onClick: () => void
  size?: 'icon-xs' | 'icon'
}) {
  return (
    <Button variant="ghost" size={size} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-current">
        <circle cx="10" cy="4" r="1.6" />
        <circle cx="10" cy="10" r="1.6" />
        <circle cx="10" cy="16" r="1.6" />
      </svg>
    </Button>
  )
}
