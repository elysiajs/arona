import { Elysia, t } from 'elysia'
import { startSpan } from '@elysiajs/opentelemetry'

import { powMacro } from '@arona/modules/pow'
import {
	API_KEY,
	cache,
	isDev,
	log,
	raceFirstTruthy,
	rateLimitMacro,
	redis,
	retry,
	structure,
	turnstileMacro
} from '@arona/libs'

import { AI } from './service'
import { createCacheKey, deduplicateReferences, SemanticCache } from './libs'
import { Models, Reference } from './model'

export const ai = new Elysia()
	.model(Models)
	.prefix('model', 'AI.')
	.decorate({ AI })
	.use(powMacro)
	.use(rateLimitMacro)
	.use(turnstileMacro)
	.post(
		'/ask',
		async function* ({
			AI,
			body,
			body: { seed, message, history, reference: requestedPage, think },
			ip,
			request
		}) {
			// yield 'Elysia chan is busy packing her things to a library... Please visit her later in a while!'
			const key = createCacheKey({
				message,
				seed,
				history,
				think,
				page: requestedPage
			})

			let normalized: Promise<string | undefined> | undefined

			if (!seed || (seed && Math.random() <= 0.1)) {
				if (key) {
					const cache = await redis.get(key).catch(() => {})

					if (cache) {
						log(`AI Cache hit for '${key}'`)

						yield AI.withMetadata(cache)
						return
					}
				}

				let done = false

				const cache = await raceFirstTruthy(
					SemanticCache.get(message),
					async () => {
						normalized = SemanticCache.normalize(message)

						const key = await normalized
						if (!key || done) return

						return SemanticCache.get(key)
					}
				)

				done = true

				if (cache) {
					yield AI.withMetadata(cache)
					return
				}
			}

			if (!normalized) normalized = SemanticCache.normalize(message)

			const references: Reference[] = []
			if (requestedPage) {
				const pages = await cache(`page:${requestedPage}`, () =>
					retry(
						() =>
							AI.readPage(requestedPage) as unknown as Reference[]
					)
				)

				if (pages)
					references.push(
						...pages.map((page) => ({
							...page,
							score: 1
						}))
					)
			}

			const stream = await AI.ask({
				abortSignal: request.signal,
				seed,
				message,
				history,
				references,
				ip,
				think,
				onFinish({ usage, content }) {
					const attributes = {
						'ai.question': message,
						'ai.response': content.map((answer) =>
							JSON.stringify(answer)
						),
						'ai.references': references.map((x) => x.link),
						'ai.input_tokens': usage.inputTokens ?? 0,
						'ai.cached_input_tokens':
							usage.inputTokenDetails.cacheReadTokens ?? 0,
						'ai.output_tokens': usage.outputTokens ?? 0,
						'ai.reasoning_tokens':
							usage.outputTokenDetails.reasoningTokens ?? 0,
						'ai.total_tokens': usage.totalTokens ?? 0
					} as const

					const ai = startSpan('AI Log')
					ai.setAttributes(attributes)
					ai.end()
				}
			}).catch((err) => new Error(err))

			if (stream instanceof Error) {
				yield 'Elysia chan is feeling a bit under the weather right now. Please try again later!'
				return
			}

			let response = ''

			const streamSpan = startSpan('Stream')
			for await (const chunk of stream) {
				response += chunk
				yield chunk
			}
			streamSpan.end()

			const sources = deduplicateReferences(references).toSorted(
				(a, b) => b.score - a.score
			)

			if (sources.length) {
				yield '\n'

				const sourceText = sources
					.map(
						(source) =>
							`- [${source.title}](https://elysiajs.com/${source.link})`
					)
					.join('\n')

				yield sourceText
				response += `\n${sourceText}`
			}

			response = response.trimEnd()

			yield AI.withMetadata('')

			// Intentionally no await the rest to not block the response
			if (key)
				redis.set(
					key,
					response,
					'EX',
					// shorter expiration for long messages
					message.length > 256 ? 1_800 : 10_800
				)

			if (history?.length) AI.VolatileHistoryCache.set(body, response)

			normalized.then((value) => {
				if (value) SemanticCache.set(value, response)
			})
		},
		{
			body: 'AI.Ask',
			parse: 'json',
			turnstile: true,
			pow: !isDev as true,
			beforeHandle({ body, status, AI }) {
				if (!body.history) return

				if (body.history?.length > 13)
					body.history = body.history.slice(-13)

				for (const { content, checksum, role } of body.history)
					if (
						role === 'assistant' &&
						!AI.Checksum.verify(content, checksum)
					)
						return status(
							422,
							'Invalid history. Please start a new conversation.'
						)

				if (AI.VolatileHistoryCache.has(body))
					return AI.withMetadata(AI.VolatileHistoryCache.get(body)!)
			}
		}
	)

const reIndexWebhookEndpoint = process.env.REINDEX_ENDPOINT
const reIndexSecret = process.env.REINDEX_SECRET

if (reIndexWebhookEndpoint && reIndexSecret)
	ai.patch(
		reIndexWebhookEndpoint,
		async function* () {
			yield 'Indexing...'

			await structure()

			yield 'Done'
		},
		{
			beforeHandle({ headers, status }) {
				if (headers['reindex_secret'] !== reIndexSecret)
					return status(404, 'NOT_FOUND')
			}
		}
	)

// Separate from main app so it doesn't has type inference
// ai.use((app) => {
// 	const GATEWAY_ID = process.env.AI_GATEWAY_ID
// 	const ACCOUNT_ID = process.env.CF_ACCOUNT_ID

// 	if (!ACCOUNT_ID || !GATEWAY_ID) return app

// 	return app.post(
// 		'/feedback/:id',
// 		({ body, status, params: { id } }) =>
// 			retry(() =>
// 				fetch(
// 					`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${GATEWAY_ID}/logs/${id}`,
// 					{
// 						method: 'PATCH',
// 						headers: {
// 							'Content-Type': 'application/json',
// 							Authorization: `Bearer ${process.env.AI_GATEWAY_KEY}`
// 						},
// 						body: JSON.stringify({
// 							feedback: body ? 1 : -1
// 						})
// 					}
// 				)
// 			)
// 				.then(() => body)
// 				.catch(() => status(418)),
// 		{
// 			parse: 'text',
// 			body: t.Boolean()
// 		}
// 	)
// })
