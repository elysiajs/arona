import {
	embed,
	stepCountIs,
	streamText,
	type StreamTextOnFinishCallback
} from 'ai'

import { record } from '@elysiajs/opentelemetry'

import {
	createPageTool,
	createSearchTool,
	tableOfContentsTool
} from './libs/tool'
import { instruction, model, openai, retry, sql } from '@arona/libs'

import { compressHistory } from './libs'
import type { History, Reference } from './model'
import { SQL } from './const'

interface AskParams {
	abortSignal: AbortSignal
	seed?: number
	message: string
	history: History
	references: Reference[]
	ip: string
	onFinish?: StreamTextOnFinishCallback<{}>
	think?: boolean
}

export async function ask({
	abortSignal,
	seed,
	message,
	history,
	references,
	ip,
	onFinish,
	think
}: AskParams) {
	const searchTool = createSearchTool(references)
	const readPageTool = createPageTool(references)

	const stream = await retry(
		() =>
			record(
				'Gather Resources',
				async (span) =>
					await new Promise<AsyncGenerator<string, any, any>>(
						async (resolve, reject) => {
							const response = streamText({
								model,
								abortSignal,
								tools: {
									readPage: readPageTool,
									search: searchTool,
									table_of_contents: tableOfContentsTool
								},
								// prepareStep({ stepNumber }) {
								// 	if (stepNumber === 0)
								// 		return {
								// 			activeTools: ['table_of_contents']
								// 		}
								// },
								stopWhen: stepCountIs(think ? 10 : 7),
								seed,
								activeTools: ['readPage', 'search'],
								messages: [
									{
										role: 'system',
										content: references.length
											? `${instruction}\n---\n# Page: ${references[0].title}\n${references
													.map(
														(x) =>
															`## ${x.title}\n${x.summary}${x.content}`
													)
													.join('\n\n')}`
											: instruction
									},
									...compressHistory(history),
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
										reasoningEffort: think
											? 'medium'
											: 'low',
										user: ip,
										serviceTier: 'auto'
									},
									cerebras: {
										reasoning_effort: think
											? 'medium'
											: 'low',
										reasoningEffort: think
											? 'medium'
											: 'low'
									}
								},
								onFinish(metadata) {
									onFinish?.(metadata as any)
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

	return stream
}

export async function readPage(link: string): Promise<Reference | Reference[]> {
	link = link.replace(/^docs\/|.md/g, '')

	if (link.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, content, summary, link FROM doc_chunks WHERE link = ${link} LIMIT 1`.then(
			(x) => (x[0] ? Object.assign(x[0], { score: 1 }) : [])
		)

	return sql<
		Reference[]
	>`SELECT title, content, summary, link FROM doc_chunks WHERE link LIKE ${link + '%'}`.then(
		(x) => x.map((r) => Object.assign(r, { score: 1 }))
	)
}

export async function search(value: string, abortSignal?: AbortSignal) {
	const { embedding } = await retry(() =>
		embed({
			model: openai.embeddingModel('text-embedding-3-small'),
			value,
			abortSignal
		})
	)

	return sql.unsafe<Reference[]>(SQL.findReference, [
		`[${embedding.join(',')}]`
	])
}

export const AI = {
	ask,
	readPage,
	search
} as const
