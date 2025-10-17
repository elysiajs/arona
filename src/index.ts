import { Elysia, NotFoundError, t } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import { cors } from '@elysiajs/cors'
import { cron } from '@elysiajs/cron'
import {
	getTracer,
	opentelemetry,
	record,
	startActiveSpan
} from '@elysiajs/opentelemetry'

import {
	openai,
	sql,
	createInstruction,
	openingPrompt,
	turnstile,
	Reference
} from '@arona/libs'
import { structure } from './libs/structure'

import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

const app = new Elysia()
	.use(
		openapi({
			enabled: process.env.NODE_ENV !== 'production',
			references: fromTypes()
		})
	)
	.use(
		opentelemetry({
			spanProcessors: [
				new BatchSpanProcessor(
					new OTLPTraceExporter({
						url: 'https://api.axiom.co/v1/traces',
						headers: {
							Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
							'X-Axiom-Dataset': process.env.AXIOM_DATASET!
						}
					})
				)
			]
		})
	)
	.use(
		cors({
			origin: ['https://elysiajs.com', 'http://localhost:5173']
		})
	)
	.use(
		cron({
			name: 'Reindex Database',
			pattern: '0 */6 * * *',
			run: structure
		})
	)
	.use(turnstile)
	.get('/', 'Arona')
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
			const embeddings = await record(
				'Create Embedding',
				async () =>
					await openai.embeddings.create({
						model: 'text-embedding-3-small',
						input:
							history
								?.map((x) =>
									x.content.length > 4096
										? x.content.slice(0, 4096)
										: x.content
								)
								.join('\n\n') + message
					})
			)

			console.log(embeddings.data[0].embedding.join(','))

			let references = await record(
				'Retrieve Embedding',
				async () =>
					await sql
						.unsafe<Reference[]>(
							`SELECT link, file, title, content, embedding <#> $1 AS distance
				     FROM doc_chunks
				     ORDER BY embedding <#> $1
				     LIMIT 16`,
							[`[${embeddings.data[0].embedding.join(',')}]`]
						)
						.then((x) =>
							x.filter((a) => Math.abs(a.distance) > 0.45)
						)
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
							? message
							: `${message}${openingPrompt}`
					}
				]
			})

			const tracer = getTracer()

			const span = tracer.startSpan('Stream Response')

			for await (const chunk of response) {
				const content = chunk.choices[0]?.delta?.content
				if (content) yield content
			}

			span.end()

			// if (references.length)
			// 	yield '\n\nSource:\n' +
			// 		references
			// 			.map(
			// 				(reference) =>
			// 					`- [${reference.file.slice(5, -3)} - ${reference.title}](https://elysiajs.com/${reference.link})`
			// 			)
			// 			.join('\n')
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
	.listen({
		port: process.env.PORT ?? 3000,
		host: '0.0.0.0'
	})

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
)
