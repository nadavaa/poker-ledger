'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

/**
 * Owner only (the function checks). Kills every copy of the old invite link;
 * nobody already in the group is affected, and game links keep working.
 */
export function ResetInviteLink({ groupId }: { groupId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reset() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('reset_invite_code', {
      p_group_id: groupId,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setConfirming(false)
    setDone(true)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Anyone with the group&apos;s invite link can join. If it ended up
        somewhere it shouldn&apos;t, reset it: the old link stops working.
        Everyone already in the group stays, and game links still work.
      </p>
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="destructive"
            className="h-11 flex-1 rounded-xl"
            disabled={pending}
            onClick={reset}
          >
            {pending ? 'Resetting…' : 'Yes, reset the link'}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => {
            setDone(false)
            setConfirming(true)
          }}
        >
          Reset invite link
        </Button>
      )}
      {done && (
        <p className="text-sm text-up">
          New link ready. Use Copy invite on the group page to share it.
        </p>
      )}
      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  )
}
