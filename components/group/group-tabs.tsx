'use client'

import Link from 'next/link'
import { useState } from 'react'

const TABS = [
  { key: 'games', label: 'Games' },
  { key: 'members', label: 'Members' },
  { key: 'stats', label: 'My Stats' },
] as const

/**
 * A segmented control whose indicator moves the instant you tap, rather than
 * when the server navigation lands. Tapping a tab is a decision the user has
 * already made; making them watch a round trip before the UI acknowledges it
 * is what makes web apps feel slower than native ones.
 *
 * The parent keys this on the real tab, so the optimistic state is discarded
 * by remount once the server agrees.
 */
export function GroupTabs({
  groupId,
  active,
}: {
  groupId: string
  active: string
}) {
  const [optimistic, setOptimistic] = useState(active)
  const index = Math.max(
    TABS.findIndex((t) => t.key === optimistic),
    0
  )

  return (
    <nav className="relative flex rounded-2xl bg-muted/60 p-1">
      {/* One pill, translated — transform only, so it never triggers layout. */}
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-card shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/groups/${groupId}?tab=${t.key}`}
          scroll={false}
          aria-current={active === t.key ? 'page' : undefined}
          onClick={() => setOptimistic(t.key)}
          className={`relative z-10 flex-1 rounded-xl px-3 py-2 text-center text-sm transition-[color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            optimistic === t.key
              ? 'font-semibold text-foreground'
              : 'text-muted-foreground'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
