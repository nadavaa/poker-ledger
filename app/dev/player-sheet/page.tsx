import { PlayerSheetPreview } from './preview'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ buyins?: string; cashedOut?: string }>
}) {
  const sp = await searchParams
  const count = Math.min(Math.max(Number(sp.buyins ?? 14) || 0, 0), 60)
  return <PlayerSheetPreview count={count} cashedOut={sp.cashedOut === '1'} />
}
