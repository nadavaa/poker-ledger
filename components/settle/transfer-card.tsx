'use client'

import { formatCents } from '@/lib/money'
import { formatTime } from '@/lib/time'
import { canPay, type SettlementRole } from '@/lib/settlements'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { VenmoButton } from '@/components/settle/venmo-button'
import { ZelleDetails } from '@/components/settle/zelle-details'
import { resolvePaymentOptions, type PaymentSources } from '@/lib/payment'

export type TransferRow = {
  id: string
  fromMemberId: string
  toMemberId: string
  amountCents: number
  status: string
  confirmedAt: string | null
  confirmedByMemberId: string | null
  kind: 'poker' | 'food'
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
  closedOutBy,
  timeZone,
}: {
  status: string
  role: SettlementRole
  payeeName: string
  confirmedAt: string | null
  timeZone: string
  /** Set when the admin closed it out instead of the payee confirming. */
  closedOutBy: string | null
}): { glyph: string; tone: string; label: string } {
  if (status === 'confirmed') {
    const when = confirmedAt
      ? ` ${formatTime(confirmedAt, timeZone, 'shortDay')}`
      : ''
    return {
      glyph: '✓',
      tone: 'text-up',
      // Say who closed it rather than implying the payee acknowledged it.
      label: closedOutBy
        ? `Closed out by ${closedOutBy}${when}`
        : `Confirmed${when}`,
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
 * One transfer, drawn for whoever is looking at it. Status is controlled by
 * the parent, which applies the tap optimistically and owns the write — the
 * count above the list has to move at the same moment this row does.
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
  paymentSources,
  isGameAdmin,
  timeZone,
  pending,
  error,
  onMove,
}: {
  transfer: TransferRow
  role: SettlementRole
  names: Map<string, string>
  /** Keyed by settlement id; only present for rows the viewer may act on. */
  paymentSources: Map<string, PaymentSources>
  isGameAdmin: boolean
  /** The group's zone; a confirmation dated Sep 6 means Sep 6 at the table. */
  timeZone: string
  /** A write for this row is in flight. */
  pending: boolean
  error: string | null
  onMove: (next: 'paid' | 'pending' | 'confirmed') => void
}) {
  const status = transfer.status

  const payerName = names.get(transfer.fromMemberId) ?? 'Someone'
  const payeeName = names.get(transfer.toMemberId) ?? 'someone'
  const { primary, secondary } = resolvePaymentOptions(
    paymentSources.get(transfer.id) ?? {}
  )

  const isPayer = canPay(role)
  const isPayee = role === 'payee'
  // The escape hatch for a payee who isn't on the app, or never taps. Never
  // on your own debt: that would be confirming yourself.
  const canCloseOut = isGameAdmin && !isPayer && !isPayee
  // The link is only useful while there is still a payment to send.
  const showVenmo = isPayer && status === 'pending'

  const closedOutBy =
    transfer.confirmedByMemberId &&
    transfer.confirmedByMemberId !== transfer.toMemberId
      ? (names.get(transfer.confirmedByMemberId) ?? 'the admin')
      : null

  const line = statusLine({
    status,
    role,
    payeeName,
    confirmedAt: transfer.confirmedAt,
    closedOutBy,
    timeZone,
  })

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
        <div className="min-w-0">
          <p className="truncate text-base">
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

          {/* Only while there is still a payment to make, and only for the
              person making it. */}
          {showVenmo && !primary && (
            <p className="text-xs text-muted-foreground">
              No payment method on file
            </p>
          )}

          {canCloseOut && status !== 'confirmed' && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Close out marks this settled if {payeeName} won&apos;t confirm in
              the app.
            </p>
          )}

          <p
            className={`mt-1 flex items-center gap-1 text-[0.8125rem] ${line.tone}`}
          >
            <span aria-hidden className="font-semibold">
              {line.glyph}
            </span>
            {line.label}
          </p>

          {error && <p className="mt-0.5 text-xs text-down">{error}</p>}
        </div>

        <div className="ml-auto flex shrink-0 flex-col items-end gap-1.5">
          {role === 'bystander' && (
            <span className="money-display text-xl font-semibold">
              {formatCents(transfer.amountCents)}
            </span>
          )}

          {showVenmo && primary && (
            <>
              {primary.method === 'venmo' ? (
                <VenmoButton
                  handle={primary.value}
                  amountCents={transfer.amountCents}
                  payeeName={payeeName}
                />
              ) : (
                <ZelleDetails phone={primary.value} payeeName={payeeName} />
              )}

              {/* The other method they have on file, offered quietly. */}
              {secondary &&
                (secondary.method === 'venmo' ? (
                  <a
                    href={`https://venmo.com/${secondary.value}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Venmo @{secondary.value}
                  </a>
                ) : (
                  <ZelleDetails
                    phone={secondary.value}
                    payeeName={payeeName}
                    secondary
                  />
                ))}
            </>
          )}

          {isPayer && status === 'pending' && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => onMove('paid')}
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
              onClick={() => onMove('pending')}
            >
              Undo
            </Button>
          )}

          {isPayee && status !== 'confirmed' && (
            <Button
              size="sm"
              className="rounded-xl"
              disabled={pending}
              onClick={() => onMove('confirmed')}
            >
              Confirm received
            </Button>
          )}

          {/* What Close out means used to live in a hover title, which no
              phone can show — on an irreversible money action. */}
          {canCloseOut && status !== 'confirmed' && (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={pending}
              onClick={() => onMove('confirmed')}
            >
              Close out
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
