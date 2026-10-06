import { RATE_LIMIT_MESSAGE, withinRate } from '../limits'
import { ToolError, type Db, type Phase } from './run'

/**
 * Refuse before doing any work if this user has been changing too much too
 * fast. The counts are the caller's own recent attempts from the call log.
 */
export async function enforceRate(db: Db, phase: Exclude<Phase, 'read'>) {
  const { data } = await db.rpc('mcp_rate_counts').maybeSingle()
  const counts = {
    commits: data?.commits ?? 0,
    previews: data?.previews ?? 0,
  }
  if (!withinRate(counts, phase)) throw new ToolError(RATE_LIMIT_MESSAGE)
}

/**
 * True exactly once per token. The signature proves who the token was issued
 * to and for what; this is what stops it being used twice.
 */
export async function consumeConfirmation(
  db: Db,
  jti: string,
  expiresAt: number
): Promise<boolean> {
  const { data, error } = await db.rpc('mcp_consume_confirmation', {
    p_jti: jti,
    p_expires_at: new Date(expiresAt).toISOString(),
  })
  return !error && data === true
}
