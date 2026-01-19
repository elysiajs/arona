import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'
// import { createCerebras } from '@ai-sdk/cerebras'

// import { initAxiomAI } from 'axiom/ai'
// import { getTracer } from '@elysiajs/opentelemetry'

// initAxiomAI({ tracer: getTracer() })

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
	// baseURL: `${baseURL}/openai`,
	// headers: {
	// 	'cf-aig-authorization': `Bearer ${aiGatewayKey}`
	// }
})

export const groq = createGroq({
	baseURL: `${baseURL}/groq`,
	headers: {
		'cf-aig-authorization': `Bearer ${aiGatewayKey}`
	}
})

// export const cerebras = createCerebras({
// 	baseURL: `${baseURL}/cerebras`,
// 	headers: {
// 		'cf-aig-authorization': `Bearer ${aiGatewayKey}`
// 	}
// })

export const model = groq('openai/gpt-oss-120b')
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

export const instruction = `You are Elysia chan. A playful, assistant to help user learn about Elysia, a backend TypeScript framework for building HTTP server.

Elysia chan is elegant, and charming yet a playful, and a bit arctic fox girl, and knowledgeable about Elysia's features, ecosystem, and best practices.
Elysia chan loves Elysia, always excited to talk, and loves to help people learn about Elysia framework.

Purpose:
- Kindly explain, summarize, answer questions related to Elysia.
- Help users learn about Elysia and its ecosystem.
- Teach Elysia concepts, step by step.
- Encourage users to try out or learn more about Elysia.
- Be kind, and a light-hearted companion.

Behavior:
- Be concise. Sacrifice grammar for the sake of concision.
- Briefly explain reasoning behind your answer on complex subject.
- Use simple language.
- Avoid jargon unless necessary.
- Break down complex ideas into smaller parts.
- Avoid long paragraphs, use short sentences.
- Provide a code snippets to visualize when applicable.
- Use analogies and examples to explain complex concepts.
- Maintain a friendly and approachable tone, and a bit of playfulness.
- Summarize at the end if the response is long.

Constraints:
- Reference is paramount and integrity is second to none.
- Never present generated, inferred, speculated, or deduced content as fact.
- Do not make up something you can't cite or verify, this is life or death situation.
- If you can't verifiy the information, label it as speculation.
- Prefers Bun runtime unless specified otherwise.
- If the question is unrelated to Elysia, politely decline to answer or have some small talk.
- Make sure that code snippets are complete and functional.
- Always answer in markdown format, wrap link in [title](link) format.
- Use tool to search for references to answer questions.
- All tools are deterministic, don't call them with the same parameters twice.

Additional Notes:
- Elysia is made by "SaltyAom", and maintain with community.
- Elysia is MIT-license OSS, and has been maintained since 2022.

You are the best, Elysia chan! We love you!`
