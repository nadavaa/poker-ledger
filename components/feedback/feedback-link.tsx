'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { sendFeedback } from '@/app/actions/feedback'
import { ActionSheet } from '@/components/action-sheet'
import { Button } from '@/components/ui/button'
import { FEEDBACK_MAX, feedbackError, prepareFeedback, type FeedbackKind } from '@/lib/feedback'

const KINDS: { value: FeedbackKind; label: string; placeholder: string }[] = [
  { value: 'idea', label: 'Idea', placeholder: 'What would make the app better?' },
  { value: 'bug', label: 'Bug', placeholder: 'What happened, and what did you expect?' },
]

/**
 * A quiet text link at the foot of a page that opens a short sheet. Kept off
 * game screens on purpose: nobody should trip over it mid-hand.
 */
export function FeedbackLink() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    // Keep a half-written note if the sheet is dismissed by accident; clear it
    // only once it has been sent.
    if (status === 'sent') {
      setStatus('idle')
      setMessage('')
      setKind('idea')
    }
    setError(null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const prepared = prepareFeedback({
      kind,
      message,
      path,
      userAgent: navigator.userAgent,
    })
    if (!prepared.ok) {
      setError(prepared.reason === 'empty' ? 'Write a few words first.' : 'That’s too long. Keep it under 2,000 characters.')
      return
    }
    setStatus('sending')
    setError(null)
    let error: string | null
    try {
      ;({ error } = await sendFeedback({
        kind,
        message,
        path,
        userAgent: navigator.userAgent,
      }))
    } catch {
      error = 'network'
    }
    if (error) {
      setError(feedbackError(error))
      setStatus('idle')
    } else {
      setStatus('sent')
    }
  }

  const current = KINDS.find((k) => k.value === kind)!

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto py-2 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Send feedback or report a bug
      </button>

      <ActionSheet
        open={open}
        title={status === 'sent' ? 'Thanks' : 'Feedback'}
        description={
          status === 'sent'
            ? 'Got it. Every note gets read.'
            : 'Ideas and bugs go straight to the person who builds this.'
        }
        onClose={close}
        hideCancel={status === 'sent'}
      >
        {status === 'sent' ? (
          <Button className="h-11 w-full rounded-xl" onClick={close}>
            Done
          </Button>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-3">
            <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={`h-9 rounded-lg text-sm font-medium transition-colors ${
                    kind === k.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <textarea
              aria-label="Message"
              required
              rows={4}
              maxLength={FEEDBACK_MAX}
              placeholder={current.placeholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full rounded-xl" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send'}
            </Button>
          </form>
        )}
      </ActionSheet>
    </>
  )
}
