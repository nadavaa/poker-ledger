/**
 * Placeholder blocks shaped like the content that's coming.
 *
 * The point isn't decoration: without this, a navigation shows the old page
 * until every query resolves, which reads as a frozen tap. A shape appearing
 * instantly makes the same wait feel like progress.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-muted ${className}`}
      aria-hidden
    />
  )
}

export function SkeletonRows({
  count = 3,
  className = 'h-16',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  )
}
