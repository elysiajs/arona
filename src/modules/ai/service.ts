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
	const references = await sql<Reference[]>`WITH raw AS (
	  SELECT
	    d.file,
	    d.link,
	    d.title,
	    d.sequence,
	    d.content,
	    d.summary,
	    d.weight,
	    ts_rank(d.tsv, query) AS r
	  FROM
	    doc_chunks d,
	    plainto_tsquery('english', ${value}) query
	  WHERE
	    d.tsv @@ query
	),
	normalized AS (
	  SELECT
	    *,
	    r / NULLIF(
	      MAX(r) OVER (),
	      0
	    ) AS r_norm
	  FROM
	    raw
	),
	filtered AS (
	  SELECT
	    DISTINCT ON (file) file,
	    link,
	    title,
	    sequence,
	    content,
	    summary,
	    (0.75 * r_norm + 0.25 * weight) AS score
	  FROM
	    normalized
	  ORDER BY
	    file,
	    score DESC
	),
	chunk AS (
	  SELECT
	    f.file,
	    f.link,
	    f.title,
	    dc.content,
	    dc.summary,
	    dc.sequence,
	    f.score as score
	  FROM
	    filtered f
	    JOIN doc_chunks dc ON dc.file = f.file
	    AND dc.sequence BETWEEN f.sequence
	    AND f.sequence + 1
	  ORDER BY
	    score,
	    sequence
	)
	SELECT
	  c.link,
	  c.title,
	  string_agg(c.content, E'\n') AS content,
	  string_agg(c.summary, E'\n') AS summary,
	  c.score
	FROM
	  chunk c
	WHERE
	  c.score > 0.75
	GROUP BY
	  c.file,
	  c.title,
	  c.score,
	  c.link
	ORDER BY
	  c.score DESC
	LIMIT 5;`.then((x) => [...x])

	if (references.length < 5) {
		const { embedding } = await retry(() =>
			embed({
				model: openai.embeddingModel('text-embedding-3-small'),
				value,
				abortSignal
			})
		)

		const vectorResult = await sql
			.unsafe<
				Reference[]
			>(SQL.findReference, [`[${embedding.join(',')}]`, 5 - references.length])
			.then((x) => [...x])

		references.push(...vectorResult)
	}

	return references
}

export const AI = {
	ask,
	readPage,
	search
} as const
