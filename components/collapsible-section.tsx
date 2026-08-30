import type { ReactNode } from 'react'

/**
 * The disclosure Game Settings has always used, pulled out so everything that
 * starts collapsed looks and behaves the same. Native <details>, so it works
 * without JavaScript and keeps its own open state.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = '',
}: {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details
      open={defaultOpen}
      className={`rounded-lg border border-border px-3 py-2 ${className}`}
    >
      <summary className="cursor-pointer text-sm text-muted-foreground">
        {title}
      </summary>
      <div className="flex flex-col gap-3 pt-3">{children}</div>
    </details>
  )
}
