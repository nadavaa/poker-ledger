// A read tool comes as a pair that shares one handler:
//
//   the data tool    returns data only. The model uses it to look things up
//                    and to answer by combining, counting, comparing or
//                    filtering, and nothing is drawn.
//   the display tool returns the same data and is bound to the app view, so
//                    the host draws the screen. The model uses it once, as the
//                    final answer, when one screen is the answer.
//
// The binding is on the tool definition, so the only way to keep the screen
// from appearing on every lookup is to keep it off the tools used for lookups.

import type { McpServer } from '@modelcontextprotocol/server'
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server'
import type { z } from 'zod'
import { appUi } from '../ui/register'
import { runTool, type ToolContext } from './run'

export const DATA_ONLY =
  'Returns data only, no UI. Use for lookups and for any question you need to answer by ' +
  'combining, counting, comparing or filtering results. '

type DisplaySpec = {
  name: string
  title: string
  description: string
  /** Defaults to the data tool's own arguments. */
  inputSchema?: z.ZodType
}

type DataConfig = {
  title: string
  description: string
  inputSchema: z.ZodType
  annotations?: Record<string, unknown>
}

/**
 * The handler for both. `withUi` is true only for the display tool, so the
 * data tool does no work for the screen and carries nothing for it.
 */
export type PairHandler<S extends z.ZodType> = (
  args: z.infer<S>,
  tool: ToolContext,
  withUi: boolean
) => Promise<unknown>

export function registerPair<S extends z.ZodType>(
  server: McpServer,
  name: string,
  config: DataConfig & { inputSchema: S; display: DisplaySpec },
  run: PairHandler<S>
) {
  const { display, ...data } = config

  server.registerTool(
    name,
    { ...data, description: DATA_ONLY + data.description } as never,
    ((args: z.infer<S>, ctx: never) => runTool(name, ctx, (tool) => run(args, tool, false))) as never
  )

  registerAppTool(
    server,
    display.name,
    {
      title: display.title,
      description: display.description,
      inputSchema: (display.inputSchema ?? data.inputSchema) as never,
      annotations: data.annotations,
      _meta: appUi,
    } as never,
    ((args: z.infer<S>, ctx: never) => runTool(display.name, ctx, (tool) => run(args, tool, true))) as never
  )
}

/** The words the model reads to choose between a data tool and its display twin. */
export const SHOWN =
  'Renders an app screen for the user. Use only when the user asks to see this screen, or when this ' +
  'single screen fully answers the question. Call at most once per answer. Do not use for intermediate lookups. '
