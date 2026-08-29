'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Enums } from '@/lib/supabase/types'

type Role = Enums<'member_role'>

/**
 * Owners only. A group can hold as many owners as it likes; the database
 * refuses to let the last one step down, since a group with no owner can
 * neither be administered nor deleted.
 */
export function MemberRoleSelect({
  memberId,
  role,
  name,
}: {
  memberId: string
  role: Role
  name: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    router.refresh()
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <select
        value={role}
        disabled={pending}
        aria-label={`Role for ${name}`}
        onChange={(e) => change(e.target.value as Role)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
      >
        <option value="owner">Owner</option>
        <option value="admin">Admin</option>
        <option value="member">Member</option>
      </select>
      {error && <span className="text-xs text-down">{error}</span>}
    </span>
  )
}
