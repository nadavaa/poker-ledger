// Where "Open in Poker Ledger" goes: the site this server is running as.
// Production is the canonical www address (see docs/MCP.md); a preview points
// at its own deployment, so a test never sends anyone to production.

export function appOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === 'production') return 'https://www.kevespoker.com'
  if (env.VERCEL_BRANCH_URL) return `https://${env.VERCEL_BRANCH_URL}`
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`
  return 'http://localhost:3000'
}
