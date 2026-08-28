'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

type Preview = {
  mode: 'delete' | 'deactivate' | 'blocked'
  blocked_reason: string | null
  games_played: number
  display_name: string
}

/**
 * Removal is two different operations wearing one button, so the dialog has
 * to say which one is about to happen: a placeholder nobody has played with
 * is deleted outright, anyone with history is only hidden.
 */
export function RemoveMemberButton({
  memberId,
  name,
}: {
  memberId: string
  name: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setError(null)
    setPending(true)
    const { data, error } = await supabase
      .rpc('member_removal_preview', { p_member_id: memberId })
      .maybeSingle()
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setPreview(data as Preview)
  }

  async function confirm() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('remove_group_member', {
      p_member_id: memberId,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setPreview(null)
    router.refresh()
  }

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={open}
        aria-label={`Remove ${name}`}
      >
        Remove
      </Button>

      {error && !preview && (
        <p className="w-full text-xs text-down">{error}</p>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setPreview(null)}
        >
          <div
            className="material w-full max-w-md rounded-t-3xl border-t border-white/10 bg-popover/95 p-4 pb-safe backdrop-blur-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {preview.mode === 'blocked' ? (
              <>
                <h3 className="text-base font-semibold">
                  Can&apos;t remove {preview.display_name}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {preview.blocked_reason}
                </p>
                <Button
                  className="mt-4 h-11 w-full rounded-xl"
                  onClick={() => setPreview(null)}
                >
                  OK
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold">
                  {preview.mode === 'delete'
                    ? `Remove ${preview.display_name}?`
                    : `${preview.display_name} has played ${preview.games_played} ${
                        preview.games_played === 1 ? 'game' : 'games'
                      }.`}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {preview.mode === 'delete'
                    ? 'They have no game history, so this removes them completely.'
                    : "They'll be hidden from this group but their game history stays intact. You can reactivate them later and they get the same record back."}
                </p>
                {error && <p className="mt-2 text-sm text-down">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="ghost"
                    className="h-11 flex-1 rounded-xl"
                    onClick={() => setPreview(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-11 flex-1 rounded-xl"
                    disabled={pending}
                    onClick={confirm}
                  >
                    {preview.mode === 'delete' ? 'Remove' : 'Hide them'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export function ReactivateMemberButton({
  memberId,
  name,
}: {
  memberId: string
  name: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reactivate() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('reactivate_group_member', {
      p_member_id: memberId,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    router.refresh()
  }

  return (
    <>
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={reactivate}
        aria-label={`Reactivate ${name}`}
      >
        Reactivate
      </Button>
      {error && <p className="w-full text-xs text-down">{error}</p>}
    </>
  )
}
