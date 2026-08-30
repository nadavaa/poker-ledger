'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Enums } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'

type Role = Enums<'member_role'>
const ROLES: Role[] = ['owner', 'admin', 'member']
const PRESS_MS = 500

/**
 * Roles are a once-a-year job, so they don't earn a permanent control on every
 * row. Long-press or right-click the name, or use the dots — the dots exist
 * because a gesture nobody can see is a gesture nobody finds.
 */
export function MemberRoleMenu({
  memberId,
  role,
  name,
  children,
}: {
  memberId: string
  role: Role
  name: string
  /** The member's name, wrapped so the gesture has something to land on. */
  children: React.ReactNode
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  function start() {
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      setOpen(true)
    }, PRESS_MS)
  }

  /** Scrolling past a name must not open a menu. */
  function cancel() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  async function change(next: Role) {
    setError(null)
    setPending(true)
    const { error } = await supabase.rpc('set_member_role', {
      p_member_id: memberId,
      p_role: next,
    })
    setPending(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onTouchMove={cancel}
          onContextMenu={(e) => {
            e.preventDefault()
            setOpen(true)
          }}
          className="min-w-0 flex-1 select-none"
        >
          {children}
        </span>

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Role options for ${name}`}
          onClick={() => setOpen(true)}
        >
          <svg viewBox="0 0 20 20" aria-hidden className="size-4 fill-current">
            <circle cx="10" cy="4" r="1.6" />
            <circle cx="10" cy="10" r="1.6" />
            <circle cx="10" cy="16" r="1.6" />
          </svg>
        </Button>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="material w-full max-w-md rounded-t-3xl border-t border-white/10 bg-popover/95 p-4 pb-safe backdrop-blur-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Change their role in this group.
            </p>

            <div className="mt-3 flex flex-col gap-1.5">
              {ROLES.map((r) => (
                <Button
                  key={r}
                  variant={r === role ? 'secondary' : 'outline'}
                  className="h-11 justify-start rounded-xl capitalize"
                  disabled={pending || r === role}
                  onClick={() => change(r)}
                >
                  {r}
                  {r === role && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      current
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {error && <p className="mt-2 text-sm text-down">{error}</p>}

            <Button
              variant="ghost"
              className="mt-3 h-11 w-full rounded-xl"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
