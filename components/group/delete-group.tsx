'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Preview = { members: number; games: number; open_settlements: number }

/**
 * The most destructive action in the app: it takes every game, buy-in and
 * settlement in the group with it. Owners only, and it makes you type the
 * name — there is no undo and no backup.
 */
export function DeleteGroup({
  groupId,
  groupName,
}: {
  groupId: string
  groupName: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setError(null)
    setPending(true)
    const { data, error } = await supabase
      .rpc('group_delete_preview', { p_group_id: groupId })
      .maybeSingle()
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setPreview(data as Preview)
  }

  async function remove() {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('delete_group', {
      p_group_id: groupId,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    router.replace('/')
  }

  return (
    <div className="flex flex-col gap-2">
      {!preview ? (
        // Just the button. Everything it used to explain is in the
        // confirmation, which still makes you type the name.
        <Button
          variant="destructive"
          className="h-11 w-full rounded-xl"
          disabled={pending}
          onClick={open}
        >
          Delete group
        </Button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-down/30 bg-down-soft p-3.5">
          <h3 className="text-sm font-semibold text-down">Delete group</h3>
          <p className="text-xs text-muted-foreground">
            This will permanently delete {preview.members}{' '}
            {preview.members === 1 ? 'member' : 'members'} and {preview.games}{' '}
            {preview.games === 1 ? 'game' : 'games'}, along with every buy-in
            and settlement in them.
          </p>

          {preview.open_settlements > 0 && (
            <p className="text-xs font-medium text-down">
              {preview.open_settlements} payment
              {preview.open_settlements === 1 ? '' : 's'} still
              {preview.open_settlements === 1 ? ' is' : ' are'} outstanding.
              Deleting the group erases the record of who owed what.
            </p>
          )}

          <label className="text-xs text-muted-foreground" htmlFor="confirm">
            Type <span className="font-medium">{groupName}</span> to confirm
          </label>
          <Input
            id="confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={groupName}
            autoComplete="off"
          />

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                setPreview(null)
                setTyped('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl"
              disabled={typed.trim() !== groupName.trim() || pending}
              onClick={remove}
            >
              {pending ? 'Deleting…' : 'Delete group'}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  )
}
