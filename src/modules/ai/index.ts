import { Elysia, t } from 'elysia'
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
import { createCacheKey, deduplicateReferences } from './libs'
import { Models, Reference } from './model'

export const ai = new Elysia()
	.model(Models)
	.prefix('model', 'AI.')
	.decorate({ AI })
	.use(powMacro)
	.use(rateLimitMacro)
	.use(turnstileMacro)
	.patch('/database/index', async ({ headers, status }) => {
		if (headers['x-api-key'] !== API_KEY) return status(404)

		await structure()

		return 'ok'
	})
	.post(
		'/ask',
		async function* ({
			AI,
			body: { seed, message, history, reference: requestedPage, think },
			ip,
			request
		}) {
			const key = createCacheKey({
				message,
				seed,
				history,
				think,
				page: requestedPage
			})

			if (key)
				try {
					const cache = await redis.get(key)

					if (cache) {
						log(`AI Cache hit for '${key}'`)

						yield cache

						return
					}
				} catch {}

			const references: Reference[] = []
			if (requestedPage) {
				const pages = await retry(() =>
					cache(
						`page:${requestedPage}`,
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

			// Intentionally not awaiting to not block the response
			if (key) redis.set(key, response, 'EX', 10_800)
		},
		{
			headers: 'turnstile',
			body: 'AI.Ask',
			parse: 'json',
			turnstile: true,
			pow: !isDev as true
		}
	)

// Separate from main app so it doesn't has type inference
ai.use((app) => {
	const GATEWAY_ID = process.env.AI_GATEWAY_ID
	const ACCOUNT_ID = process.env.CF_ACCOUNT_ID

	if (!ACCOUNT_ID || !GATEWAY_ID) return app

	return app.post(
		'/feedback/:id',
		({ body, status, params: { id } }) =>
			retry(() =>
				fetch(
					`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${GATEWAY_ID}/logs/${id}`,
					{
						method: 'PATCH',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${process.env.AI_GATEWAY_KEY}`
						},
						body: JSON.stringify({
							feedback: body ? 1 : -1
						})
					}
				)
			)
				.then(() => body)
				.catch(() => status(418)),
		{
			parse: 'text',
			body: t.Boolean()
		}
	)
})
