'use client'

import { useCallback, useRef } from 'react'
import Link from 'next/link'
import { NO_PAYMENT_BODY, NO_PAYMENT_TITLE } from '@/lib/payment'

const KEY = 'payment-banner-dismissed'

/**
 * Nobody can pay you. Persistent, because it stays true until they fix it,
 * and dismissible, because being told twice is a reminder and being told
 * forever is nagging.
 *
 * Dismissal is written straight to the node rather than held in state: the
 * server has no localStorage, so deciding this in a render would either flash
 * the banner at somebody who dismissed it or disagree with the server about
 * what to draw.
 */
export function PaymentBanner() {
  const box = useRef<HTMLDivElement>(null)

  const attach = useCallback((node: HTMLDivElement | null) => {
    box.current = node
    if (!node) return
    try {
      if (localStorage.getItem(KEY) === '1') node.hidden = true
    } catch {
      // Private window, or storage blocked. Showing it is the safe failure.
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // Can't remember it; can still hide it for this visit.
    }
    if (box.current) box.current.hidden = true
  }

  return (
    <div
      ref={attach}
      className="flex flex-col gap-1.5 rounded-2xl border border-pending/30 bg-pending-soft px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-pending">
          {NO_PAYMENT_TITLE}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground active:bg-muted"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-current">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{NO_PAYMENT_BODY}</p>
      <Link
        href="/settings"
        className="text-sm font-semibold text-pending underline-offset-2 hover:underline"
      >
        Add a payment method
      </Link>
    </div>
  )
}
