import { describe, expect, it } from 'vitest'
import { isPublicPath } from './public-paths'

describe('isPublicPath', () => {
  it.each([
    '/',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/og',
    '/ai-connector',
    '/guides',
    '/guides/settle-a-home-poker-game',
    '/login',
    '/auth/callback',
    '/manifest.webmanifest',
    '/sw.js',
    '/icon',
    '/apple-icon',
    '/offline',
    '/api/mcp',
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/api/mcp',
  ])('lets a signed-out visitor load %s', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it.each([
    '/join/x',
    '/claim/x',
    '/groups/x',
    '/groups/x/edit',
    '/groups/x/games/new',
    '/games/x',
    '/games/x/join',
    '/settings',
    '/profile',
    '/welcome',
    '/admin',
    '/admin/anything',
    '/oauth/consent',
    '/api/games/x/settle',
    '/api/other',
    '/robots.txt/x',
    '/sitemap.xml/x',
    '/guidesx',
    '/anything-else',
  ])('sends a signed-out visitor from %s to /login', (path) => {
    expect(isPublicPath(path)).toBe(false)
  })
})
