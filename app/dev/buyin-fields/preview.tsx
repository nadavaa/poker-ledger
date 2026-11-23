'use client'

import { GroupSettingsForm } from '@/components/group/group-settings-form'
import { EditGameForm } from '@/components/game/edit-game-form'
import { NewGameForm } from '@/app/groups/[groupId]/games/new/new-game-form'

/**
 * The three forms with a buy-in field, on fake data. Don't press Save:
 * the settings forms write through Supabase, and signed out with fake ids
 * the database refuses it, but there is nothing to see there anyway.
 */
export function BuyinFieldsPreview() {
  const tz = 'America/New_York'
  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-4">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Group settings</h2>
        <GroupSettingsForm
          groupId="dev-group"
          initial={{
            name: 'Poker Night',
            seatLimit: 9,
            buyinCents: 5000,
            chipsPerDollar: 10,
            timezone: tz,
            paymentMode: 'online',
          }}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">New game</h2>
        <NewGameForm
          defaults={{
            default_buyin_cents: 5000,
            chips_per_dollar: 10,
            default_seat_limit: 9,
            payment_mode: 'online',
          }}
          timeZone={tz}
          action={() => {}}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Edit game</h2>
        <EditGameForm
          gameId="dev-game"
          status="scheduled"
          timeZone={tz}
          initial={{
            name: 'Friday game',
            location: "Nadav's",
            scheduledAt: '2026-11-28T01:00:00Z',
            seatLimit: 9,
            buyinCents: 10000,
            chipsPerDollar: 10,
            paymentMode: 'online',
          }}
        />
      </section>
    </main>
  )
}
