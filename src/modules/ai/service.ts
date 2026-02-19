import { timingSafeEqual } from 'crypto'

import {
	ModelMessage,
	stepCountIs,
	streamText,
	type StreamTextOnFinishCallback
} from 'ai'
import { LRUCache } from 'lru-cache'

import { record, setAttributes } from '@elysiajs/opentelemetry'

import {
	BurstCache,
	getEmbedding,
	instruction,
	log,
	model,
	raceFirstTruthy,
	redis,
	retry,
	sql
} from '@arona/libs'
import {
	createHistoryTool,
	createPageTool,
	createSearchTool,
	tableOfContentsTool
} from './libs/tool'

import { compressHistory, createCacheKey, cyrb53, SemanticCache } from './libs'
import { SQL } from './const'
import type { History, Models, Reference } from './model'

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

export function ask({
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
	const readHistoryTool = history?.length
		? createHistoryTool(() => compressHistory(history).slice(3).slice(-5))
		: undefined

	const initialReference = references.length
		? ({
				role: 'user',
				content: `Page: ${references[0].link}\n# ${references[0].title}\n${references
					.map((x) => `## ${x.title}\n${x.summary}`)
					.join('\n\n')}`
			} satisfies ModelMessage)
		: undefined

	return record('Gather Resources', () =>
		streamText({
			model,
			abortSignal,
			tools: Object.assign(
				{
					readPage: readPageTool,
					search: searchTool,
					tableOfContents: tableOfContentsTool
				},
				(history?.length ?? 0) > 3
					? { readHistory: readHistoryTool! }
					: {}
			) as any,
			stopWhen: stepCountIs(think ? 9 : 5),
			seed,
			topP: 0.7,
			presencePenalty: 0.4,
			maxOutputTokens: 1408,
			maxRetries: 3,
			messages: [
				{
					role: 'system',
					content: instruction
				},
				{
					role: 'user',
					content: history?.length
						? message
						: `Hi Elysia chan! Would you kindly help me? ${message}`
				},
				...(initialReference ? [initialReference] : []),
				...(history?.length ? compressHistory(history).slice(0, 3) : [])
			],
			providerOptions: {
				openrouter: {
					user: ip,
					reasoning: {
						effort: think ? 'medium' : 'low'
					}
				}
				// groq: {
				// 	reasoningFormat: 'hidden',
				// 	reasoningEffort: think
				// 		? 'medium'
				// 		: 'low',
				// 	user: ip,
				// 	serviceTier: 'auto'
				// }
				// cerebras: {
				// 	reasoning_effort: think
				// 		? 'medium'
				// 		: 'low',
				// 	reasoningEffort: think
				// 		? 'medium'
				// 		: 'low'
				// }
			},
			onFinish(metadata) {
				onFinish?.(metadata as any)
			}
		})
	).textStream
}

export async function readPage(link: string): Promise<Reference | Reference[]> {
	link = link.replace(/^docs\/|.md/g, '')

	if (link.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, summary, link FROM documents WHERE link = ${link} LIMIT 1`.then(
			(x) => (x[0] ? Object.assign(x[0], { score: 1 }) : [])
		)

	return sql<
		Reference[]
	>`SELECT title, summary, link FROM documents WHERE link LIKE ${link + '%'}`.then(
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
	  file,
	  link,
	  title,
	  sequence,
	  summary,
	  weight,
	  paradedb.score(link) AS r
	FROM
   	  documents d
	WHERE
	  link @@@ ${'summary:' + value}
	),
	normalized AS (
      SELECT
      	*,
        r / NULLIF(MAX(r) OVER (), 0) AS r_norm
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
      WHERE
		(0.775 * r_norm + 0.275 * weight) >= 0.6
      ORDER BY
    	file,
        score DESC
      LIMIT 10
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
	    JOIN documents dc ON dc.file = f.file
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
	GROUP BY
	  c.file,
	  c.title,
	  c.score,
	  c.link
	ORDER BY
	  c.score DESC
	LIMIT 3;`.then((x) => [...x])

	const vectorResult = await sql
		.unsafe<
			Reference[]
		>(SQL.findReference, [`[${await getEmbedding(value).then((x) => x.join(','))}]`, 3])
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

const aiChecksumSecret = process.env.AI_CHECKSUM_SECRET
if (!aiChecksumSecret) throw new Error('AI_CHECKSUM_SECRET is not set')

export abstract class Checksum {
	static cache = {
		fromContent: new LRUCache<string, string>({
			max: 250,
			ttl: 9 * 60 * 60 * 1000 // 9 hour
		}),
		// Hot cache for recently compared checksums to avoid DDOS
		// Max content length is 1,280
		// 1,280 * 5,000 = 6.4MB in worst case which is acceptable for memory
		// which is clear in 4 minutes
		fromChecksum: new LRUCache<string, boolean>({
			max: 5000,
			ttl: 30 * 1000 // 30 seconds
		})
	} as const

	static generate(content: string) {
		if (this.cache.fromContent.has(content))
			return this.cache.fromContent.get(content)!

		const hash = new Bun.CryptoHasher('sha256', aiChecksumSecret)
			.update(content)
			.digest('hex')

		this.cache.fromContent.set(content, hash)

		return hash
	}

	static verify(content: string, checksum: string) {
		try {
			if (this.cache.fromChecksum.has(checksum))
				return this.cache.fromChecksum.get(checksum)!

			const isEqual = timingSafeEqual(
				Buffer.from(this.generate(content)),
				Buffer.from(checksum)
			)

			this.cache.fromChecksum.set(checksum, isEqual)

			return isEqual
		} catch {
			return false
		}
	}
}

export function withMetadata(content: string) {
	return `${content}\n---Elysia-Metadata---\nchecksum:${AI.Checksum.generate(content)}`
}

export class VolatileHistoryCache extends BurstCache<Models['ask'], string> {
	// check regardless of seed because ttl is very short
	hash = ({ history, message, think }: Models['ask']) =>
		cyrb53(
			`${history?.map((x) => x.content).join('|')}|${message}|${think ? '1' : '0'}`
		)
}

interface NoHistoryWithSeed {
	message: string
	seed: number
}

class NoHistoryWithSeedCache extends BurstCache<NoHistoryWithSeed, string> {
	hash = ({ message, seed }: NoHistoryWithSeed) =>
		cyrb53(`${message}|${seed}`)
}

class FallbackCache extends BurstCache<Models['ask'], string> {
	// no seed
	hash = ({ message, history, reference, think }: Models['ask']) =>
		cyrb53(
			`${message}:${
				history
					?.filter((x) => x.content)
					?.map((x) => x.content)
					.join('|') ?? ''
			}:${reference ?? ''}:${think ? '1' : '0'}`
		)
}

export async function getCache(body: Models['ask'], ip?: string) {
	const { seed, message, history, think, reference } = body

	if (!seed) {
		const key = createCacheKey({
			message,
			seed,
			history,
			think,
			page: reference
		})

		if (key) {
			const cache = await redis.get(key).catch(() => {})

			if (cache) {
				log(`AI Cache hit for '${key}'`)

				return cache
			}
		}

		if (!reference) {
			let done = false

			const cache = await raceFirstTruthy(
				SemanticCache.get(message),
				async () => {
					const key = await SemanticCache.normalize(message, ip)
					if (!key || done) return

					return SemanticCache.get(key)
				}
			)

			done = true

			if (cache) return cache
		}
	}

	if (history?.length) {
		if (AI.VolatileHistoryCache.has(body))
			return AI.VolatileHistoryCache.get(body)!
	} else if (seed && !reference) {
		if (AI.NoHistoryWithSeedCache.has({ message, seed }))
			return AI.NoHistoryWithSeedCache.get({ message, seed })!
	}

	if (AI.FallbackCache.has(body)) return AI.FallbackCache.get(body)!
}

export const AI = {
	ask,
	Checksum,
	getCache,
	FallbackCache: new FallbackCache({
		cache: {
			max: 1500,
			ttl: 5 * 1000
		}
	}),
	NoHistoryWithSeedCache: new NoHistoryWithSeedCache({
		cache: {
			ttl: 4 * 60 * 60 * 1000, // 4 hour
			max: 750
		}
	}),
	readPage,
	search,
	VolatileHistoryCache: new VolatileHistoryCache({
		cache: {
			ttl: 30 * 1000,
			max: 250
		}
	}),
	withMetadata
} as const
