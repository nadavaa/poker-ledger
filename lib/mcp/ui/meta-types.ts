// The shape of the view-only data, and nothing else, so the page can import it
// without pulling in anything that reads the environment.

import type { Money } from '../format'

export const UI_META_KEY = 'poker-ledger/ui'

/** A picture, and the id the app colours the initials circle by when there is none. */
export type Face = { id: string; avatar: string | null }

export type UiMeta = {
  /** show_groups: one per group, with what the app's home shows beside it. */
  groups?: (Face & { members: number; lifetime: Money | null })[]
  /** show_group: the group's members, for its Members tab. */
  groupMembers?: (Face & { name: string; isMe: boolean })[]
  /** show_group: one per game. Finished games only carry players and pot. */
  games?: { players: number | null; pot: Money | null; myNet: Money | null }[]
  /** show_game: parallel to roster, waitlist and money.players. */
  roster?: Face[]
  waitlist?: Face[]
  players?: Face[]
  /** show_game: what the status banner and the way back need. */
  game?: { groupId: string; buyin: Money; chips: number; overdue: boolean }
}
