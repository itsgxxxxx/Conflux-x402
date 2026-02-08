#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { loadMcpConfig } from './config.js'
import { checkBalanceTool } from './tools/check-balance.js'
import { paymentHistoryTool } from './tools/payment-history.js'
import { payFetchTool } from './tools/pay-fetch.js'
import { discoverAgentsTool } from './tools/discover-agents.js'

// --- Zod schemas for MCP tool argument validation ---

const PayFetchArgsSchema = z.object({
  url: z.string().min(1, 'url is required'),
  method: z
    .enum(['GET', 'POST', 'PUT', 'DELETE'])
    .optional()
    .default('GET'),
  body: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  max_payment: z.string().optional(),
})

const CheckBalanceArgsSchema = z.object({})

const PaymentHistoryArgsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
})

const DiscoverAgentsArgsSchema = z.object({
  capability: z.string().min(1, 'capability is required'),
  limit: z.number().int().min(1).max(50).optional().default(5),
  max_scan: z.number().int().min(1).max(5000).optional().default(200),
  include_bazaar: z.boolean().optional().default(true),
})

const config = loadMcpConfig()

const server = new Server(
  {
    name: 'x402-payment',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'x402_pay_fetch',
        description: 'Make an HTTP request to an x402-protected API endpoint with automatic payment handling',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the x402-protected API endpoint',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              description: 'HTTP method (default: GET)',
            },
            body: {
              type: 'string',
              description: 'JSON request body for POST/PUT requests',
            },
            headers: {
              type: 'object',
              description: 'Additional HTTP headers',
            },
            max_payment: {
              type: 'string',
              description: 'Maximum payment amount in USDT0 (default: 0.10)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'x402_check_balance',
        description: 'Check the USDT0 balance of the configured wallet on Conflux eSpace',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'x402_payment_history',
        description: 'View recent payment history from the current session',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of recent payments to return (default: 10)',
            },
          },
        },
      },
      {
        name: 'x402_discover_agents',
        description: 'Discover registered agents on Conflux eSpace by capability',
        inputSchema: {
          type: 'object',
          properties: {
            capability: {
              type: 'string',
              description: 'Capability string used at registration (e.g. "movie-info")',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of agents to return (default: 5)',
            },
            max_scan: {
              type: 'number',
              description: 'Maximum agent IDs to scan from registry (default: 200)',
            },
            include_bazaar: {
              type: 'boolean',
              description: 'Fetch /.well-known/x402-bazaar.json for each agent (default: true)',
            },
          },
          required: ['capability'],
        },
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: rawArgs } = request.params

    switch (name) {
      case 'x402_pay_fetch': {
        const args = PayFetchArgsSchema.parse(rawArgs)
        const result = await payFetchTool(args, config)
        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'x402_check_balance': {
        CheckBalanceArgsSchema.parse(rawArgs)
        const result = await checkBalanceTool(config)
        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'x402_payment_history': {
        const args = PaymentHistoryArgsSchema.parse(rawArgs)
        const result = paymentHistoryTool(args.limit)
        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'x402_discover_agents': {
        const args = DiscoverAgentsArgsSchema.parse(rawArgs)
        const result = await discoverAgentsTool(args, config)
        return {
          content: [{ type: 'text', text: result }],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      return {
        content: [{ type: 'text', text: `Validation error: ${issues}` }],
        isError: true,
      }
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('x402 MCP Server started')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
