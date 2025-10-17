import { Elysia, NotFoundError, t } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import { cors } from '@elysiajs/cors'
import { cron } from '@elysiajs/cron'

import {
	openai,
	sql,
	createInstruction,
	turnstile,
	Reference
} from '@arona/libs'
import { structure } from './libs/structure'

import { findEmbedding } from './libs/sql'

const app = new Elysia()
	.use(
		openapi({
			enabled: process.env.NODE_ENV !== 'production',
			references: fromTypes()
		})
	)
	.use(
		cors({
			origin: 'https://elysiajs.com'
		})
	)
	.use(
		cron({
			name: 'Reindex Database',
			pattern: '0 */6 * * *',
			run: structure
		})
	)
	// .headers({
	// 	'x-powered-by': 'Elysia'
	// })
	.use(turnstile)
	.get('/', 'arona')
	.get('/heath', 'ok')
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
		async function* ({ body: { message, history } }) {
			const embeddings = await openai.embeddings.create({
				model: 'text-embedding-3-small',
				input:
					message +
					'\n\n' +
					history
						?.map((x) =>
							x.content.length > 4096
								? x.content.slice(0, 4096)
								: x.content
						)
						.join('\n\n')
			})

			let references = await sql
				.unsafe<
					Reference[]
				>(findEmbedding, [`[${embeddings.data[0].embedding.join(',')}]`])
				.then((x) => x.filter((r) => r.score >= 0.35))

			let additionalContext = ''

			if (Math.abs(references[0].score) >= 0.5) {
				const chapters = await sql<
					Pick<Reference, 'content' | 'title'>[]
				>`SELECT content, title
			     	FROM doc_chunks
			     	WHERE file = ${references[0].file}`

				if (chapters.length)
					additionalContext =
						`\n\n# ${references[0].file.slice(5, -3)}\n\n` +
						chapters
							.map((c) => `## ${c.title}\n${c.content}`)
							.join('\n\n')
			}

			const response = openai.chat.completions.stream({
				model: 'gpt-5-nano',
				reasoning_effort: 'low',
				messages: [
					{
						role: 'system',
						content:
							createInstruction(references) + additionalContext
					},
					...(history ?? []),
					{
						role: 'user',
						content: history?.length
							? message
							: `Hi Elysia chan! I would to learn about Elysia, would you kindly help me? ${message}`
					}
				]
			})

			for await (const chunk of response) {
				const content = chunk.choices[0]?.delta?.content
				if (content) yield content
			}

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
								maxLength: 4096
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
	.listen({
		port: process.env.PORT ?? 3000,
		host: '0.0.0.0'
	})

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
