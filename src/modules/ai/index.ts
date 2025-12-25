import { Elysia, t } from 'elysia'
import { startSpan } from '@elysiajs/opentelemetry'

import {
	API_KEY,
	cache,
	isDev,
	log,
	logger,
	pow,
	retry,
	structure,
	turnstile
} from '@arona/libs'
import {
	ask,
	deduplicateReferences,
	Models,
	rateLimit,
	readPage,
	type Reference
} from './libs'

export const ai = new Elysia()
	.use([logger.into(), rateLimit, pow, turnstile])
	.patch('/database/index', async ({ headers, status }) => {
		if (headers['x-api-key'] !== API_KEY) return status(404)

		await structure()

		return 'ok'
	})
	.use((app) => {
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
	.post(
		'/ask',
		async function* ({
			request,
			body: { seed, message, history, reference: requestedPage, think },
			ip
		}) {
			const references: Reference[] = []
			if (requestedPage) {
				const pages = await retry(() =>
					cache(
						`page:${requestedPage}`,
						() => readPage(requestedPage) as unknown as Reference[]
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

			let logId: string | undefined

			const stream = await ask({
				abortSignal: request.signal,
				seed,
				message,
				history,
				references,
				ip,
				think,
				onFinish({ usage, response, content }) {
					logId = response.headers?.['cf-aig-log-id']

					const attributes = {
						'ai.cf_log_id': logId,
						'ai.question': message,
						'ai.response': content.map((answer) =>
							JSON.stringify(answer)
						),
						'ai.references': JSON.stringify(
							references.map((x) => x.link)
						),
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
					log(attributes)
					ai.end()
				}
			}).catch((err) => new Error(err))

			if (stream instanceof Error) {
				yield 'Elysia chan is feeling a bit under the weather right now. Please try again later!'
				return
			}

			const streamSpan = startSpan('Stream')
			for await (const chunk of stream) yield chunk
			streamSpan.end()

			const sources = deduplicateReferences(references).toSorted(
				(a, b) => b.score - a.score
			)

			yield '\n'

			if (sources.length)
				yield sources
					.map(
						(source) =>
							`- [${source.title}](https://elysiajs.com/${source.link})`
					)
					.join('\n')

			yield `\n- id:${logId ?? 'UNKNOWN'}`
		},
		{
			headers: 'turnstile',
			body: Models.ask,
			parse: 'json',
			AIRateLimit: true,
			turnstile: true,
			pow: !isDev
		}
	)
