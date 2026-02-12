import {
	embed,
	stepCountIs,
	streamText,
	type StreamTextOnFinishCallback
} from 'ai'

import { record, setAttributes } from '@elysiajs/opentelemetry'

import {
	createHistoryTool,
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
	history: History | undefined
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
	const historyTool = history?.length
		? createHistoryTool(() => compressHistory(history).slice(3).slice(-5))
		: undefined

	const initial = references.length
		? `${instruction}\n---\n# Page: ${references[0].title}\n${references
				.map((x) => `## ${x.title}\n${x.summary}`)
				.join('\n\n')}`
		: instruction

	const stream = await retry(
		() => {
			return record(
				'Gather Resources',
				async (span) =>
					await new Promise<AsyncGenerator<string, any, any>>(
						async (resolve, reject) => {
							const response = streamText({
								model,
								abortSignal,
								tools: Object.assign(
									{
										readPage: readPageTool,
										search: searchTool,
										tableOfContents: tableOfContentsTool
									},
									(history?.length ?? 0) > 3
										? { historyTool: historyTool! }
										: {}
								) as any,
								stopWhen: stepCountIs(think ? 9 : 5),
								seed,
								messages: [
									{
										role: 'system',
										content: initial
									},
									{
										role: 'user',
										content: history?.length
											? message
											: `Hi Elysia chan! ${message}. Would you kindly help me?`
									},
									...(history?.length
										? compressHistory(history).slice(0, 3)
										: [])
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
			)
		},
		3,
		(n) => Math.pow(2, n) * 1000
	)

	return stream
}

export async function readPage(link: string): Promise<Reference | Reference[]> {
	link = link.replace(/^docs\/|.md/g, '')

	if (link.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, summary, link FROM doc_chunks WHERE link = ${link} LIMIT 1`.then(
			(x) => (x[0] ? Object.assign(x[0], { score: 1 }) : [])
		)

	return sql<
		Reference[]
	>`SELECT title, summary, link FROM doc_chunks WHERE link LIKE ${link + '%'}`.then(
		(x) => x.map((r) => Object.assign(r, { score: 1 }))
	)
}

export async function search(value: string, abortSignal?: AbortSignal) {
	value = value
		.toLowerCase()
		.replace(/elysia|framework|saltyaom|"|'/g, '')
		.trim()

	if (!value) return []

	const references = await sql<Reference[]>`WITH raw AS (
	  SELECT
	    d.file,
	    d.link,
	    d.title,
	    d.sequence,
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
	    summary,
	    (0.775 * r_norm + 0.275 * weight) AS score
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
	  string_agg(c.summary, E'\n') AS summary,
	  c.score
	FROM
	  chunk c
	WHERE
	  c.score > 0.725
	GROUP BY
	  c.file,
	  c.title,
	  c.score,
	  c.link
	ORDER BY
	  c.score DESC
	LIMIT 3;`.then((x) => [...x])

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
		>(SQL.findReference, [`[${embedding.join(',')}]`, 6 - references.length])
		.then((x) => [...x])

	for (const ref of vectorResult) {
		if (!references.find((r) => r.link === ref.link)) references.push(ref)

		if (references.length >= 5) break
	}

	setAttributes({
		'ai.resources': references.map((x) => x.link)
	})

	return references
}

export const AI = {
	ask,
	readPage,
	search
} as const
