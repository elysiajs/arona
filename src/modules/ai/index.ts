import { Elysia, prefix } from 'elysia'
import { startSpan } from '@elysiajs/opentelemetry'

import { powMacro } from '@arona/modules/pow'
import {
	API_KEY,
	cache,
	isDev,
	log,
	rateLimitMacro,
	redis,
	retry,
	structure,
	turnstileMacro
} from '@arona/libs'

import { AI } from './service'
import { createCacheKey, deduplicateReferences, SemanticCache } from './libs'
import { Models, type Reference } from './model'

export const ai = new Elysia()
	.model(prefix.capitalize('AI', Models))
	.decorate({ AI })
	.use(powMacro)
	.use(rateLimitMacro)
	.use(turnstileMacro)
	.post(
		'/ask',
		{
			body: 'AI.Ask',
			parse: 'json',
			turnstile: true,
			pow: !isDev as true,
			beforeHandle({ body, status, AI }) {
				if (!body.history) return

				if (body.history?.length > 8)
					body.history = body.history.slice(-8)

				// for (const { content, checksum, role } of body.history)
				// 	if (
				// 		role === 'assistant' &&
				// 		!AI.Checksum.verify(content, checksum)
				// 	)
				// 		return status(
				// 			422,
				// 			'Invalid history. Please start a new conversation.'
				// 		)
			},
			error: function* () {
				yield 'Elysia chan is feeling a bit under the weather right now. Please try again later!'
			}
		},
		async function* ({
			AI,
			body,
			body: { seed, message, history, reference, think },
			ip,
			request
		}) {
			// yield 'Elysia chan is busy packing her things to a library... Please visit her later in a while!'

			const responseCache = await AI.getCache(body, ip)
			if (responseCache) {
				yield AI.withMetadata(responseCache)
				return
			}

			const references: Reference[] = []
			if (reference)
				await cache(`page:${reference}`, () =>
					retry(
						() => AI.readPage(reference) as unknown as Reference[]
					)
				).then((pages) => {
					if (pages.length)
						references.push(
							...pages.map((page) => ({
								...page,
								score: 1
							}))
						)
				})

			const stream = AI.ask({
				abortSignal: request.signal,
				seed,
				message,
				history,
				references,
				ip,
				think:
					message.includes('```') || message.length > 1024
						? true
						: think,
				onFinish({ usage, content }) {
					const last = content.at(-1)

					const attributes = {
						'ai.question': message,
						'ai.response': last?.type === 'text' ? last.text : '',
						'ai.reasoning': content
							.filter((content) => content.type === 'reasoning')
							.map((reasoning) => reasoning.text),
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
			})

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
				yield '\n\n'

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

			if (!response)
				yield 'Elysia chan is feeling a bit under the weather right now. Please try again later!'

			yield AI.withMetadata(response, { returnContent: false })

			// Intentionally no await the rest to not block the response
			const key = createCacheKey({
				message,
				seed,
				history,
				think,
				page: reference
			})

			if (key)
				redis.set(
					key,
					response,
					'EX',
					// shorter expiration for long messages
					message.length > 256 ? 1_800 : 10_800
				)

			if (history?.length) AI.VolatileHistoryCache.set(body, response)
			else if (seed && !reference)
				AI.NoHistoryWithSeedCache.set({ message, seed }, response)

			AI.FallbackCache.set(body, response)

			if (!reference)
				SemanticCache.normalize(message, ip).then((normalized) => {
					if (normalized) SemanticCache.set(normalized, response)
				})
		}
	)

const reIndexWebhookEndpoint = process.env.REINDEX_ENDPOINT
const reIndexSecret = process.env.REINDEX_SECRET

if (reIndexWebhookEndpoint && reIndexSecret)
	ai.patch(
		reIndexWebhookEndpoint,
		{
			beforeHandle({ headers, status }) {
				if (headers['reindex_secret'] !== reIndexSecret)
					return status(404, 'NOT_FOUND')
			}
		},
		async function* () {
			yield 'Indexing...'

			await structure()

			yield 'Done'
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
