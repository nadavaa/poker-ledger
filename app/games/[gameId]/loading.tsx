import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-14 rounded-2xl" />
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[7.5rem] rounded-2xl" />
        ))}
      </div>
    </main>
  )
}
