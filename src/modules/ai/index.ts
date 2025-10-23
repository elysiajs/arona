import { Elysia, t, NotFoundError } from 'elysia'
import { record, setAttributes, startSpan } from '@elysiajs/opentelemetry'

import { streamText, stepCountIs } from 'ai'

import {
	API_KEY,
	instruction,
	isDev,
	logger,
	model,
	pow,
	retry,
	structure,
	turnstile
} from '@arona/libs'
import {
	cache,
	createPageTool,
	createSearchTool,
	deduplicateReferences,
	rateLimit,
	readPage,
	type Reference
} from './libs'

export const ai = new Elysia()
	.use(turnstile)
	.use(pow)
	.use(rateLimit)
	.use(logger.into())
	.patch('/database/index', async ({ headers }) => {
		if (headers['x-api-key'] !== API_KEY) throw new NotFoundError()

		await structure()

		return 'ok'
	})
	.post(
		'/ask',
		async function* ({
			request,
			log,
			body: { message, history, reference: requestedPage },
			ip
		}) {
			const references: Reference[] = []
			if (requestedPage) {
				const pages = (await retry(() =>
					cache(`page:${requestedPage}`, () =>
						readPage(requestedPage)
					)
				)) as unknown as Reference[]

				if (pages)
					references.push(
						...pages.map((page) => ({
							...page,
							score: 1 // Highest priority
						}))
					)
			}

			const searchTool = createSearchTool(references)
			const readPageTool = createPageTool(references)

			const compactHistory =
				history
					?.map((x) => {
						if (x.content.length < 2048) return x

						const sourceIndex = x.content.lastIndexOf('Sources:\n')
						const source =
							sourceIndex !== -1
								? '\n\n' + x.content.slice(sourceIndex)
								: ''

						return {
							...x,
							content: x.content.slice(0, 2048) + '...' + source
						}
					})
					.slice(-8) ?? []

			const instruct = references.length
				? `${instruction}\nPage Data:\n${references
						.map((x) => `# ${x.title}\n${x.content}`)
						.join('\n')}`
				: instruction

			const response = await retry(
				() =>
					record(
						'Gather Resources',
						() =>
							new Promise<AsyncGenerator<string, any, any>>(
								async (resolve, reject) => {
									const response = streamText({
										model,
										abortSignal: request.signal,
										tools: {
											readPage: readPageTool,
											search: searchTool
										},
										stopWhen: stepCountIs(8),
										messages: [
											{
												role: 'system',
												content: instruct
											},
											...compactHistory,
											{
												role: 'user',
												content: history?.length
													? message
													: `Hi Elysia chan! ${message}. Would you kindly help me?`
											}
										],
										providerOptions: {
											groq: {
												reasoningFormat: 'hidden',
												reasoningEffort: 'medium',
												user: ip
											}
										},
										onFinish({ usage }) {
											log.info({
												question: message,
												sources: references.length
											})
											log.info(usage)

											setAttributes({
												'custom.question': message,
												'custom.references':
													references.length,
												'custom.input_tokens':
													usage.inputTokens,
												'custom.cached_input_tokens':
													usage.cachedInputTokens,
												'custom.output_tokens':
													usage.outputTokens,
												'custom.reasoning_tokens':
													usage.reasoningTokens,
												'custom.total_tokens':
													usage.totalTokens
											})
										}
									})

									for await (const content of response.textStream)
										if (content.trim())
											resolve(response.textStream as any)

									reject('Retry')
								}
							)
					),
				3,
				0
			)

			const streamSpan = startSpan('Stream')
			let i = 0
			for await (const chunk of response) {
				i += chunk.length
				yield chunk
			}
			streamSpan.end()

			const sources = deduplicateReferences(references).toSorted(
				(a, b) => b.score - a.score
			)

			if (sources.length) {
				const referencedFiles = new Set<string>()

				yield '\n\nSources:\n' +
					sources
						.filter((source) =>
							referencedFiles.has(source.file)
								? false
								: referencedFiles.add(source.file)
						)
						.map(
							(source) =>
								`- [${source.file.slice(5, -3)} - ${source.title}](https://elysiajs.com/${source.link})`
						)
						.join('\n')
			}
		},
		{
			AIRateLimit: true,
			turnstile: true,
			pow: !isDev,
			headers: 'turnstile',
			body: t.Object({
				reference: t.Optional(t.String()),
				message: t.String({
					maxLength: 4096
				}),
				history: t.Optional(
					t.Array(
						t.Object({
							role: t.UnionEnum(['user', 'assistant']),
							content: t.String({
								maxLength: 16384
							})
						}),
						{
							maxItems: 16
						}
					)
				)
			})
		}
	)
