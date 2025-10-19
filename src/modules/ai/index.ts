import { Elysia, NotFoundError, t } from 'elysia'

import { streamText, stepCountIs } from 'ai'

import { model, structure, turnstile } from '@arona/libs'
import { instruct, readPageTool, search, searchTool } from './libs'

export const ai = new Elysia()
	.use(turnstile)
	.patch('/database/index', async ({ headers }) => {
		if (
			process.env.NODE_ENV === 'development' ||
			headers['x-api-key'] !== (process.env['api_key'] ?? 'Blue Archive')
		)
			throw new NotFoundError()

		await structure()

		return 'ok'
	})
	.post(
		'/ask',
		async function* ({ body: { message, history }, request }) {
			const references = await search(message, request.signal)

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
						content: await instruct(references)
					},
					...(history ?? []),
					{
						role: 'user',
						content: history?.length
							? message
							: `Hi Elysia chan! I would to learn about Elysia, would you kindly help me? ${message}`
					}
				],
				providerOptions: {
					openai: {
						reasoningEffort: 'low'
					}
				}
			})

			for await (const content of response.textStream) yield content

			const sources = references.filter((x) => x.score >= 0.5).slice(0, 5)

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
			turnstile: true,
			AIRateLimit: true,
			headers: 'turnstile',
			body: t.Object({
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
