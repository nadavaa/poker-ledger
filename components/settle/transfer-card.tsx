'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCents } from '@/lib/money'
import { canPay, type SettlementRole } from '@/lib/settlements'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { VenmoButton } from '@/components/settle/venmo-button'

export type TransferRow = {
  id: string
  fromMemberId: string
  toMemberId: string
  amountCents: number
  status: string
  confirmedAt: string | null
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Status never rides on colour alone — every state carries a glyph and a
 * word, because a colourblind player is being told what they owe.
 */
function statusLine({
  status,
  role,
  payeeName,
  confirmedAt,
}: {
  status: string
  role: SettlementRole
  payeeName: string
  confirmedAt: string | null
}): { glyph: string; tone: string; label: string } {
  if (status === 'confirmed') {
    return {
      glyph: '✓',
      tone: 'text-up',
      label: confirmedAt
        ? `Confirmed ${formatDay(confirmedAt)}`
        : 'Confirmed',
    }
  }
  if (status === 'paid') {
    return {
      glyph: '◐',
      tone: 'text-amber-500',
      label:
        role === 'payer'
          ? `Paid — waiting for ${payeeName} to confirm`
          : 'Marked paid — confirm when it lands',
    }
  }
  if (status === 'deferred') {
    return { glyph: '»', tone: 'text-muted-foreground', label: 'Deferred' }
  }
  return { glyph: '○', tone: 'text-pending', label: 'Pending' }
}

/**
 * One transfer, drawn for whoever is looking at it, and holding its own
 * status so a tap redraws the row immediately rather than after the server
 * round trip. The parent keys this on the server status, so a refresh that
 * disagrees replaces the component outright.
 *
 * The payer gets the Venmo link only while there is still a payment to make;
 * the payee gets "Confirm received" and no link, because settlement is
 * one-directional. A bystander — including the game admin on other people's
 * rows — gets the facts and no buttons.
 */
export function TransferCard({
  transfer,
  role,
  names,
  venmoHandles,
  venmoNote,
}: {
  transfer: TransferRow
  role: SettlementRole
  names: Map<string, string>
  venmoHandles: Map<string, string | null>
  venmoNote: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [status, setStatus] = useState(transfer.status)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payerName = names.get(transfer.fromMemberId) ?? 'Someone'
  const payeeName = names.get(transfer.toMemberId) ?? 'someone'
  const payeeHandle = venmoHandles.get(transfer.toMemberId) ?? null

  const isPayer = canPay(role)
  const isPayee = role === 'payee'
  // The link is only useful while there is still a payment to send.
  const showVenmo = isPayer && status === 'pending'

  async function move(next: 'paid' | 'pending' | 'confirmed') {
    const previous = status
    setError(null)
    setPending(true)
    setStatus(next) // optimistic: the row redraws on tap
    const { error } = await supabase
      .from('settlements')
      .update({ status: next })
      .eq('id', transfer.id)
    setPending(false)
    if (error) {
      setStatus(previous)
      setError(error.message)
      return
    }
    router.refresh()
  }

  const line = statusLine({ status, role, payeeName, confirmedAt: transfer.confirmedAt })

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm">
            {isPayer ? (
              <>
                <span className="font-medium">Pay {payeeName}</span>{' '}
                <span className="money-display font-semibold">
                  {formatCents(transfer.amountCents)}
                </span>
              </>
            ) : isPayee ? (
              <>
                <span className="font-medium">Collect from {payerName}</span>{' '}
                <span className="money-display font-semibold">
                  {formatCents(transfer.amountCents)}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">{payerName}</span>{' '}
                <span className="text-muted-foreground">pays</span>{' '}
                <span className="font-medium">{payeeName}</span>
              </>
            )}
          </p>

          {/* The handle is the payer's fallback when the link doesn't land,
              so it goes away with the link. */}
          {showVenmo &&
            (payeeHandle ? (
              <p className="money select-text text-xs text-muted-foreground">
                @{payeeHandle}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No Venmo handle on file
              </p>
            ))}

          <p className={`mt-0.5 flex items-center gap-1 text-xs ${line.tone}`}>
            <span aria-hidden className="font-semibold">
              {line.glyph}
            </span>
            {line.label}
          </p>

          {error && <p className="mt-0.5 text-xs text-down">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {role === 'bystander' && (
            <span className="money-display text-xl font-semibold">
              {formatCents(transfer.amountCents)}
            </span>
          )}

          {showVenmo && (
            <VenmoButton
              handle={payeeHandle}
              amountCents={transfer.amountCents}
              note={venmoNote}
              payeeName={payeeName}
            />
          )}

          {isPayer && status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => move('paid')}
            >
              Mark as paid
            </Button>
          )}

          {/* Without this, a mistaken tap strands them: no link, and they'd
              have to open Venmo and retype the amount by hand. */}
          {isPayer && status === 'paid' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => move('pending')}
            >
              Undo
            </Button>
          )}

          {isPayee && status !== 'confirmed' && (
            <Button
              size="sm"
              className="rounded-xl"
              disabled={pending}
              onClick={() => move('confirmed')}
            >
              Confirm received
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
