// Whose name to show.
//
// group_members.display_name is a snapshot taken when the row was created. For
// a claimed member the profile is the living value — change your name in
// Settings and it should follow you, including through games already played.
// For an unclaimed member there is no profile, and the snapshot is all there is.

export function resolveDisplayName(
  memberDisplayName: string | null | undefined,
  profileDisplayName: string | null | undefined
): string {
  const profile = profileDisplayName?.trim()
  if (profile) return profile
  const member = memberDisplayName?.trim()
  return member || 'Unknown'
}
