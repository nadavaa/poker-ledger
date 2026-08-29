import { Skeleton, SkeletonRows } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-3 w-32" />
      <SkeletonRows count={2} className="h-[4.5rem]" />
    </main>
  )
}
