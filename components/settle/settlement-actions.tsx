'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

/**
 * The payer's half and the payee's half of the handshake. Each person only
 * ever gets their own button — and the database refuses the other half even
 * if the button is forged.
 */
export function SettlementActions({
  settlementId,
  status,
  role,
}: {
  settlementId: string
  status: string
  /** Which side of this transfer the viewer is on. */
  role: 'payer' | 'payee' | 'bystander'
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(next: 'paid' | 'pending' | 'confirmed') {
    setError(null)
    setPending(true)
    const { error } = await supabase
      .from('settlements')
      .update({ status: next })
      .eq('id', settlementId)
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    router.refresh()
  }

  if (role === 'bystander' || status === 'confirmed') return null

  return (
    <span className="flex flex-col items-end gap-1">
      {role === 'payer' && status === 'pending' && (
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

      {role === 'payer' && status === 'paid' && (
        <Button
          size="xs"
          variant="ghost"
          disabled={pending}
          onClick={() => move('pending')}
        >
          Undo paid
        </Button>
      )}

      {role === 'payee' && status === 'paid' && (
        <Button
          size="sm"
          className="rounded-xl"
          disabled={pending}
          onClick={() => move('confirmed')}
        >
          Confirm received
        </Button>
      )}

      {role === 'payee' && status === 'pending' && (
        <span className="text-xs text-muted-foreground">
          Waiting on payment
        </span>
      )}

      {error && <span className="text-xs text-down">{error}</span>}
    </span>
  )
}
