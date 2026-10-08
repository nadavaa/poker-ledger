// The shape of the view-only data, and nothing else, so the page can import it
// without pulling in anything that reads the environment.

import type { Money } from '../format'

export const UI_META_KEY = 'poker-ledger/ui'

export type UiMeta = {
  /** list_my_groups: one per group. */
  groups?: { avatar: string | null }[]
  /** list_group_members: one per member. */
  members?: { avatar: string | null; isMe: boolean }[]
  /** list_games: one per game. Finished games only carry players and pot. */
  games?: { players: number | null; pot: Money | null; myNet: Money | null }[]
  /** get_game: parallel to roster, waitlist and money.players. */
  roster?: { avatar: string | null }[]
  waitlist?: { avatar: string | null }[]
  players?: { avatar: string | null }[]
  /** get_game: what the status banner and the way back need. */
  game?: { groupId: string; buyin: Money; chips: number; overdue: boolean }
}
