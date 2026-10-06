import {
  getPublicOrigin,
  protectedResourceHandler,
} from 'mcp-handler'
import { authServerUrl } from '@/lib/mcp/auth'

/**
 * RFC 9728 metadata: this resource, and which authorization server issues
 * tokens for it. Served at the root and at the path-suffixed location a
 * client derives from the resource URL — clients differ on which they try.
 * Auth is Supabase Auth itself; there is no authorization server of ours.
 */
export function metadata(req: Request): Response {
  return protectedResourceHandler({
    authServerUrls: [authServerUrl()],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  })(req)
}
