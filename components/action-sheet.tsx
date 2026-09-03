'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/**
 * The bottom sheet the role menu introduced, pulled out so anything hidden
 * behind a long-press or a dots button opens the same way.
 */
export function ActionSheet({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="material w-full max-w-md rounded-t-3xl border-t border-white/10 bg-popover/95 p-4 pb-safe backdrop-blur-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}

        <div className="mt-3 flex flex-col gap-1.5">{children}</div>

        <Button
          variant="ghost"
          className="mt-3 h-11 w-full rounded-xl"
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </div>
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
