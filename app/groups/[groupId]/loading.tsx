import { Skeleton, SkeletonRows } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="size-9" />
        </div>
      </div>
      {/* Same height as the real segmented control, so nothing shifts. */}
      <Skeleton className="h-[2.75rem] rounded-2xl" />
      <Skeleton className="h-12 rounded-xl" />
      <SkeletonRows count={3} className="h-[4.5rem]" />
    </main>
  )
}
