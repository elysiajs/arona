import { Elysia, t, NotFoundError } from 'elysia'

import { streamText, stepCountIs } from 'ai'

import { API_KEY, isDev, model, pow, structure, turnstile } from '@arona/libs'
import {
	createPageTool,
	createSearchTool,
	instruct,
	rateLimit,
	readPage,
	search,
	type Reference
} from './libs'

export const ai = new Elysia()
	.use(turnstile)
	.use(pow)
	.use(rateLimit)
	.patch('/database/index', async ({ headers }) => {
		if (headers['x-api-key'] !== API_KEY) throw new NotFoundError()

		await structure()

		return 'ok'
	})
	.post(
		'/ask',
		async function* ({
			request,
			body: { message, history, reference: requestedReference }
		}) {
			let requested: Reference[] | undefined
			if (requestedReference) {
				const pages = (await readPage(
					requestedReference
				)) as Reference[]

				if (pages)
					requested = pages.map((page) => ({
						...page,
						score: 1 // Highest priority
					}))
			}

			const references = requested?.length
				? []
				: await search(
						message +
							(history?.length
								? '\n\n' +
									history
										?.filter((x) => x.role === 'user')
										.map((x) => x.content)
										.join('\n\n')
								: ''),
						request.signal
					)

			const searchTool = createSearchTool(references)
			const readPageTool = createPageTool(references)

			references.sort((a, b) => b.score - a.score)

			const response = streamText({
				model,
				abortSignal: request.signal,
				tools: {
					search: searchTool,
					readPage: readPageTool
				},
				stopWhen: stepCountIs(5),
				messages: [
					{
						role: 'system',
						content: await instruct(
							requested
								? [...references, ...requested]
								: references
						)
					},
					...(history
						?.map((x) => {
							if (x.content.length < 2048) return x

							const sourceIndex =
								x.content.lastIndexOf('Sources:\n')
							const source =
								sourceIndex !== -1
									? '\n\n' + x.content.slice(sourceIndex)
									: ''

							return {
								...x,
								content:
									x.content.slice(0, 2048) + '...' + source
							}
						})
						.slice(-8) ?? []),
					{
						role: 'user',
						content: history?.length
							? message
							: `Hi Elysia chan! ${message}. Would you kindly help me?`
					}
				]
			})

			for await (const content of response.textStream) yield content

			const sources = references.filter((x) => x.score >= 0.5).slice(0, 8)

			if (sources.length)
				yield '\n\nSources:\n' +
					sources
						.map(
							(source) =>
								`- [${source.file.slice(5, -3)} - ${source.title}](https://elysiajs.com/${source.link})`
						)
						.join('\n')
		},
		{
			AIRateLimit: true,
			turnstile: true,
			// pow: true,
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
