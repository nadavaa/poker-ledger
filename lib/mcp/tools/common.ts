import { must, ToolError, type Db } from './run'

/**
 * A group the user belongs to. RLS hides every other group, so "not found"
 * and "not yours" are the same answer — and say so.
 */
export async function loadGroup(db: Db, groupId: string) {
  const { data } = await db
    .from('groups')
    .select('id, name, timezone')
    .eq('id', groupId)
    .maybeSingle()
  if (!data) {
    throw new ToolError(
      'Group not found, or you are not a member. Call list_my_groups for valid group_ids.'
    )
  }
  return data
}

/** The user's own member row in a group: the id everything else keys on. */
export async function myMemberId(
  db: Db,
  groupId: string,
  userId: string
): Promise<string | null> {
  const rows = must(
    await db
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('profile_id', userId)
      .limit(1)
  )
  return rows[0]?.id ?? null
}
