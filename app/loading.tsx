import { Skeleton, SkeletonRows } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <Skeleton className="h-3 w-24" />
      <SkeletonRows count={2} className="h-[4.5rem]" />
    </main>
  )
}
