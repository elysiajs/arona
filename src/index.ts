import { Elysia, NotFoundError, t } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'

import {
	openai,
	sql,
	createInstruction,
	openingPrompt,
	turnstile
} from '@arona/libs'
import { structure } from './libs/structure'

const app = new Elysia()
	.use(
		openapi({
			enabled: process.env.NODE_ENV !== 'production',
			references: fromTypes()
		})
	)
	.use(turnstile)
	.get('/', 'Arona')
	.get('/heath', 'ok')
	.patch('/database/index', async ({ headers }) => {
		if (headers['x-api-key'] !== (process.env['api_key'] ?? 'Blue Archive'))
			throw new NotFoundError()

		await structure()

		return 'ok'
	})
	.post(
		'/search',
		async function* ({ body: { message, history } }) {
			const embeddings = await openai.embeddings.create({
				model: 'text-embedding-3-small',
				input: message
			})

			const references: {
				file: string
				content: string
				distance: number
			}[] = await sql.unsafe(
				`SELECT file, content, embedding <#> $1 AS distance
				     FROM doc_chunks
				     ORDER BY embedding <#> $1
				     LIMIT 5`,
				[`[${embeddings.data[0].embedding.join(',')}]`]
			)

			const response = openai.chat.completions.stream({
				model: 'gpt-4o',
				messages: [
					{
						role: 'system',
						content: createInstruction(references)
					},
					...(history ?? []),
					{
						role: 'user',
						content: history?.length
							? `${message}${openingPrompt}`
							: message
					}
				]
			})

			for await (const chunk of response) {
				const content = chunk.choices[0]?.delta?.content
				if (content) yield content
			}

			yield '\n\nReferences:\n' +
				references
					.map(
						(reference) =>
							`- https://elysiajs.com/${reference.file.slice(5, -3)}`
					)
					.join('\n')
		},
		{
			turnstile: true,
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
	.listen(process.env.PORT ?? 80)

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
