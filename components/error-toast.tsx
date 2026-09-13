'use client'

import { createPortal } from 'react-dom'

/**
 * A refused write, where the admin is actually looking.
 *
 * Every admin screen used to print its error at the top of its own section.
 * On a phone that is off-screen from the row you tapped, and behind the sheet
 * you tapped it from — which is how a rejected write came to look like
 * nothing happening. This sits at the bottom, above every sheet and menu, and
 * stays until it is read.
 */
export function ErrorToast({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  if (!message || typeof document === 'undefined') return null

  return createPortal(
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[110] flex justify-center pb-safe"
    >
      <div className="material pointer-events-auto mx-4 mb-3 flex w-full max-w-md items-start justify-between gap-3 rounded-2xl border border-down/40 bg-popover/95 py-2.5 pl-4 pr-2 shadow-2xl backdrop-blur-xl">
        <p className="text-sm text-down">
          <span aria-hidden className="font-semibold">! </span>
          {message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-1 flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground active:bg-muted"
        >
          OK
        </button>
      </div>
    </div>,
    document.body
  )
}
