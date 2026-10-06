import { metadataCorsOptionsRequestHandler } from 'mcp-handler'
import { metadata } from '@/app/.well-known/oauth-protected-resource/protected-resource'

export const GET = metadata
export const OPTIONS = metadataCorsOptionsRequestHandler()
