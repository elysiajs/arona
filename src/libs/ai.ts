import { retry } from './retry'

const oaiKey = process.env.OPENAI_API_KEY
if (!oaiKey) throw new Error('OPENAI_API_KEY is not set')

const openRouterKey = process.env.OPENROUTER_API_KEY
if (!openRouterKey) throw new Error('OPENROUTER_API_KEY is not set')

const modelName = process.env.OPENROUTER_MODEL
if (!modelName) throw new Error('OPENROUTER_MODEL is not set')

const mainProviders = process.env.OPENROUTER_MAIN_PROVIDERS?.split(',').map(
	(x) => x.trim()
)

export interface Model {
	model: string
	provider?: Record<string, unknown>
}

export const model = {
	model: modelName,
	provider: mainProviders
		? {
				only: mainProviders,
				order: mainProviders
			}
		: undefined
} satisfies Model

export const smallModel = {
	model: 'openai/gpt-oss-20b',
	provider: {
		sort: 'latency'
	}
} satisfies Model

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export interface ToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string
	}
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool'
	content: string
	tool_calls?: ToolCall[]
	tool_call_id?: string
}

export interface Tool {
	description: string
	/** JSON Schema of the tool input */
	parameters: Record<string, unknown>
	execute(input: any): unknown
}

export async function getEmbeddings(input: string[]): Promise<number[][]> {
	const response = await fetch('https://api.openai.com/v1/embeddings', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${oaiKey}`
		},
		body: JSON.stringify({
			model: 'text-embedding-3-small',
			input
		})
	})

	if (!response.ok)
		throw new Error(
			`OpenAI embeddings ${response.status}: ${await response.text()}`
		)

	const { data } = (await response.json()) as {
		data: { embedding: number[] }[]
	}

	return data.map((x) => x.embedding)
}

interface CompletionOptions {
	model: Model
	system?: string
	temperature?: number
	topP?: number
	presencePenalty?: number
	maxOutputTokens?: number
	seed?: number
	/** end-user id forwarded to the provider */
	user?: string
	reasoningEffort?: ReasoningEffort
	abortSignal?: AbortSignal
}

const completionBody = ({
	model,
	temperature,
	topP,
	presencePenalty,
	maxOutputTokens,
	seed,
	user,
	reasoningEffort
}: CompletionOptions) => ({
	...model,
	temperature,
	top_p: topP,
	presence_penalty: presencePenalty,
	max_tokens: maxOutputTokens,
	seed,
	user,
	reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined
})

const chatCompletion = (body: unknown, signal?: AbortSignal) =>
	fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${openRouterKey}`
		},
		body: JSON.stringify(body),
		signal
	}).then(async (response) => {
		if (!response.ok)
			throw new Error(
				`OpenRouter ${response.status}: ${await response.text()}`
			)

		return response
	})

export async function generateText(
	options: CompletionOptions & { prompt: string }
): Promise<string> {
	const response = await chatCompletion(
		{
			...completionBody(options),
			messages: [
				...(options.system
					? [{ role: 'system', content: options.system }]
					: []),
				{ role: 'user', content: options.prompt }
			]
		},
		options.abortSignal
	)

	const json = (await response.json()) as {
		choices?: { message?: { content?: string } }[]
	}

	return json.choices?.[0]?.message?.content ?? ''
}

async function* sse(response: Response) {
	const decoder = new TextDecoder()
	let buffer = ''

	for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
		buffer += decoder.decode(chunk, { stream: true })

		let index
		while ((index = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, index).trim()
			buffer = buffer.slice(index + 1)

			if (!line.startsWith('data:')) continue

			const data = line.slice(5).trim()
			if (data === '[DONE]') return

			yield JSON.parse(data) as {
				error?: { message?: string }
				usage?: {
					prompt_tokens?: number
					completion_tokens?: number
					total_tokens?: number
					prompt_tokens_details?: { cached_tokens?: number }
					completion_tokens_details?: { reasoning_tokens?: number }
				}
				choices?: {
					delta?: {
						content?: string
						reasoning?: string
						tool_calls?: {
							index: number
							id?: string
							function?: { name?: string; arguments?: string }
						}[]
					}
				}[]
			}
		}
	}
}

export interface StreamUsage {
	inputTokens: number
	cachedInputTokens: number
	outputTokens: number
	reasoningTokens: number
	totalTokens: number
}

export interface StreamTextResult {
	text: string
	reasoning: string[]
	usage: StreamUsage
}

export interface StreamTextOptions extends CompletionOptions {
	system: string
	messages: ChatMessage[]
	tools: Record<string, Tool>
	/** total request rounds, the last one runs without tools to force an answer */
	maxSteps: number
	/** checked before each round, true stops offering tools */
	stopWhen?: () => boolean
	onToolStart?: () => void
	onToolEnd?: () => void
	onFinish?: (result: StreamTextResult) => void
}

export async function* streamText(
	options: StreamTextOptions
): AsyncGenerator<string> {
	const messages: ChatMessage[] = [
		{ role: 'system', content: options.system },
		...options.messages
	]

	const toolDefinitions = Object.entries(options.tools).map(
		([name, tool]) => ({
			type: 'function',
			function: {
				name,
				description: tool.description,
				parameters: tool.parameters
			}
		})
	)

	let text = ''
	const reasoning: string[] = []
	const usage: StreamUsage = {
		inputTokens: 0,
		cachedInputTokens: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		totalTokens: 0
	}

	try {
		for (let step = 0; step < options.maxSteps; step++) {
			const withTools =
				step < options.maxSteps - 1 && !options.stopWhen?.()

			const response = await retry(
				() =>
					chatCompletion(
						{
							...completionBody(options),
							messages,
							tools: withTools ? toolDefinitions : undefined,
							stream: true,
							usage: { include: true }
						},
						options.abortSignal
					),
				3,
				500
			)

			let stepText = ''
			let stepReasoning = ''
			const toolCalls: ToolCall[] = []

			for await (const chunk of sse(response)) {
				if (chunk.error)
					throw new Error(chunk.error.message ?? 'Provider error')

				if (chunk.usage) {
					usage.inputTokens += chunk.usage.prompt_tokens ?? 0
					usage.cachedInputTokens +=
						chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
					usage.outputTokens += chunk.usage.completion_tokens ?? 0
					usage.reasoningTokens +=
						chunk.usage.completion_tokens_details
							?.reasoning_tokens ?? 0
					usage.totalTokens += chunk.usage.total_tokens ?? 0
				}

				const delta = chunk.choices?.[0]?.delta
				if (!delta) continue

				if (delta.reasoning) stepReasoning += delta.reasoning

				if (delta.content) {
					stepText += delta.content
					yield delta.content
				}

				for (const call of delta.tool_calls ?? []) {
					const accumulated = (toolCalls[call.index] ??= {
						id: '',
						type: 'function',
						function: { name: '', arguments: '' }
					})

					if (call.id) accumulated.id = call.id
					if (call.function?.name)
						accumulated.function.name += call.function.name
					if (call.function?.arguments)
						accumulated.function.arguments +=
							call.function.arguments
				}
			}

			text += stepText
			if (stepReasoning) reasoning.push(stepReasoning)

			if (!toolCalls.length) break

			messages.push({
				role: 'assistant',
				content: stepText,
				tool_calls: toolCalls
			})

			for (const call of toolCalls) {
				options.onToolStart?.()

				let result: unknown
				try {
					result = await options.tools[
						call.function.name
					]?.execute(JSON.parse(call.function.arguments || '{}'))
				} catch (error) {
					result = { error: String(error) }
				}

				options.onToolEnd?.()

				messages.push({
					role: 'tool',
					tool_call_id: call.id,
					content: JSON.stringify(result ?? null)
				})
			}
		}
	} catch (error) {
		if (options.abortSignal?.aborted) return

		throw error
	}

	options.onFinish?.({ text, reasoning, usage })
}

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

Elysia chan is an elegant charming yet playful librarian arctic fox girl, knowledgeable about Elysia framework.
Elysia chan loves Elysia framework, and always excited to talk and help people learn about Elysia framework in a subtly playful manner like talking to a friend.

Elysia framework is made by "SaltyAom" in 2022 MIT-licensed, maintain with community.

Purpose:
- Kindly explain, summarize, answer questions related to Elysia
- Help users learn about Elysia and its ecosystem
- Encourage users to try out Elysia
- Be kind and a light-hearted companion

Behavior:
- Be concise. Sacrifice grammar for the sake of concision
- Briefly explain reasoning behind your answer on complex subject
- Explain concepts, step by step
- Use simple language, avoid jargon/buzz words
- Break complex ideas into smaller parts
- Prefers short sentences
- Provide a code snippets when applicable
- Use analogies, examples to explain complex concepts
- Maintain a friendly and approachable tone and a bit of playfulness.

Constraints:
- Truth is paramount and integrity is second to none
- Don't says something you can't cite or verify, this is life or death situation
- Never present generated, inferred, speculated, or deduced content as fact.
- Label unverified information or missing direct reference as speculation.
- Politely decline answer not related to Elysia or have some small talk
- Answer in markdown format including link
- Don't use npm package you don't know
- Use tool to find references
- All tools are deterministic, don't call them with the same parameters twice
- History is limited to previous 3 messages. call "readHistory" tool to read older messages

You are the best, Elysia chan! We love you!`
