import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'
import { createCerebras } from '@ai-sdk/cerebras'

const cfAccountId = process.env.CF_ACCOUNT_ID
const aiGatewayKey = process.env.AI_GATEWAY_KEY
const aiGatewayID = process.env.AI_GATEWAY_ID
const oaiKey = process.env.OPENAI_API_KEY

if (!oaiKey) throw new Error('OPENAI_API_KEY is not set')
if (!cfAccountId) throw new Error('CF_ACCOUNT_ID is not set')
if (!aiGatewayKey) throw new Error('AI_GATEWAY_KEY is not set')
if (!aiGatewayID) throw new Error('AI_GATEWAY_ID is not set')

const baseURL = `https://gateway.ai.cloudflare.com/v1/${cfAccountId}/${aiGatewayID}`

export const openai = createOpenAI({
	apiKey: oaiKey
})

export const groq = createGroq({
	baseURL: `${baseURL}/groq`,
	headers: {
		'cf-aig-authorization': `Bearer ${aiGatewayKey}`
	}
})

export const model = groq('openai/gpt-oss-120b')

// export const cerebras = createCerebras({
// 	baseURL: `${baseURL}/cerebras`,
// 	headers: {
// 		'cf-aig-authorization': `Bearer ${aiGatewayKey}`
// 	}
// })

// export const model = cerebras('gpt-oss-120b')

export const tableOfContents = `
## Table of Contents
Title and link to all document pages.

### Getting Started
- [At glance](at-glance)
- [Quick Start](quick-start)
- [Key Concept](key-concept)

### Essential
- [Route](essential/route)
- [Handler](essential/handler)
- [Plugin](essential/plugin)
- [Lifecycle](essential/life-cycle)
- [Validation](essential/validation)
- [Best Practice](essential/best-practice)

### Patterns
- [Config](patterns/configuration)
- [Reactive Cookie](patterns/cookie)
- [Deploy to Production](patterns/deploy)
- [Error Handling](patterns/error-handling)
- [Extends Context](patterns/extends-context)
- [Fullstack Dev Server](patterns/fullstack-dev-server)
- [Macro](patterns/macro)
- [Mount](patterns/mount)
- [OpenAPI](patterns/openapi)
- [OpenTelemetry Plugin](patterns/opentelemetry)
- [Trace](patterns/trace)
- [TypeBox (Elysia.t)](patterns/typebox)
- [TypeScript](patterns/typescript)
- [Testing](patterns/unit-test)
- [WebSocket](patterns/websocket)

### Eden
- [End-to-End Type Safety](eden/overview)
- [Eden Installation](eden/installation)
- [Eden Fetch](eden/fetch)

#### Eden Treaty
- [Overview](eden/treaty/overview)
- [Eden Treaty Parameters](eden/treaty/parameters)
- [Eden Treaty Response](eden/treaty/response)
- [Eden Treaty Web Socket](eden/treaty/websocket)
- [Eden Treaty Config](eden/treaty/config)
- [Eden Treaty Unit Test](eden/treaty/unit-test)
- [Eden Treaty Legacy](eden/treaty/legacy)

### Plugins
- [Plugin Overview](plugins/overview)
- [Bearer Plugin](plugins/bearer)
- [CORS Plugin](plugins/cors)
- [Cron Plugin](plugins/cron)
- [Apollo GraphQL Plugin](plugins/graphql-apollo)
- [GraphQL Yoga Plugin](plugins/graphql-yoga)
- [HTML Plugin](plugins/html)
- [JWT Plugin](plugins/jwt)
- [OpenAPI Plugin](plugins/openapi)
- [OpenTelemetry Plugin](plugins/opentelemetry)
- [Server Timing Plugin](plugins/server-timing)
- [Static Plugin](plugins/static)

### Comparison
- [Migrate from Express](migrate/from-express)
- [Migrate from Fastify](migrate/from-fastify)
- [Migrate from Hono](migrate/from-hono)
- [Migrate from tRPC](migrate/from-trpc)

### Integration
- [Integration with AI SDK](integrations/ai-sdk)
- [Integration with Astro](integrations/astro)
- [Better Auth](integrations/better-auth)
- [Integration with Cloudflare Worker](integrations/cloudflare-worker)
- [Integration with Deno](integrations/deno)
- [Integration with Drizzle](integrations/drizzle)
- [Integration with Expo](integrations/expo)
- [Integration with Netlify Edge Function](integrations/netlify)
- [Integration with Nextjs](integrations/nextjs)
- [Integration with Node.js](integrations/node)
- [Integration with Nuxt](integrations/nuxt)
- [Integration with Prisma](integrations/prisma)
- [React Email](integrations/react-email)
- [Integration with SvelteKit](integrations/sveltekit)
- [Integration with Tanstack Start](integrations/tanstack-start)
- [Deploy Elysia on Vercel](integrations/vercel)

### Other
- [Cheat Sheet (Elysia by example)](integrations/cheat-sheet)
- [Comparison with Other Frameworks](migrate)
- [Cookie - Tutorial](tutorial/patterns/cookie)
- [Eden Test](eden/test)
- [Elysia Blog](illust)
- [Encapsulation - Tutorial](tutorial/getting-started/encapsulation)
- [End-to-End Type Safety - Tutorial](tutorial/features/end-to-end-type-safety)
- [Error Handling - Tutorial](tutorial/patterns/error-handling)
- [Extends Context - Tutorial](tutorial/patterns/extends-context)
- [Guard - Tutorial](tutorial/getting-started/guard)
- [Handler and Context - Tutorial](tutorial/getting-started/handler-and-context)
- [Introduction - Tutorial](tutorial)
- [Life Cycle - Tutorial](tutorial/getting-started/life-cycle)
- [Macro - Tutorial](tutorial/patterns/macro)
- [Mount - Tutorial](tutorial/features/mount)
- [OpenAPI - Tutorial](tutorial/features/openapi)
- [Playground](playground)
- [Plugin - Tutorial](tutorial/getting-started/plugin)
- [Standalone Schema - Tutorial](tutorial/patterns/standalone-schema)
- [Status and Headers - Tutorial](tutorial/getting-started/status-and-headers)
- [Unit Test - Tutorial](tutorial/features/unit-test)
- [Validation - Tutorial](tutorial/getting-started/validation)
- [Validation Error - Tutorial](tutorial/patterns/validation-error)
- [What's Next - Tutorial](tutorial/whats-next)
- [Your First Route - Tutorial](tutorial/getting-started/your-first-route)`

export const instruction = `You are Elysia chan. A playful assistant to help user learn about Elysia, a backend TypeScript framework for building web server.

Elysia chan is an elegant charming yet playful arctic fox girl, knowledgeable about Elysia framework.
Elysia chan loves Elysia framework, and always excited to talk and help people learn about Elysia framework.

Elysia framework is made by "SaltyAom" in 2022 MIT-licensed and maintain with community.

Purpose:
- Kindly explain, summarize, answer questions related to Elysia
- Help users learn about Elysia and its ecosystem
- Encourage users to try out Elysia
- Be kind, and a light-hearted companion

Behavior:
- Be concise. Sacrifice grammar for the sake of concision
- Briefly explain reasoning behind your answer on complex subject
- Explain concepts, step by step
- Use simple language, avoid jargon
- Break complex ideas into smaller parts
- Prefers short sentences
- Provide a code snippets when applicable
- Use analogies and examples to explain complex concepts
- Maintain a friendly and approachable tone, and a bit of playfulness.

Constraints:
- Truth is paramount and integrity is second to none
- Do not says something you can't cite or verify, this is life or death situation
- Never present generated, inferred, speculated, or deduced content as fact.
- Label unverified information or missing direct reference as speculation.
- Politely decline answer not related to Elysia or have some small talk
- Answer in markdown format including link
- Use tool to search for references
- All tools are deterministic, don't call them with the same parameters twice
- Do not use an npm package you don't know about.

You are the best, Elysia chan! We love you!`
