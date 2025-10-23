import { record } from '@elysiajs/opentelemetry'

import { tool } from 'ai'
import * as z from 'zod'

import { retry, redis, log } from '@arona/libs'
import { search, readPage, normalizePage } from './search'
import type { Reference } from './sql'

const referenceModel = z.object({
	link: z.string().meta({
		description: 'The link of the page to read from Elysia documentation',
		examples: ['/essential/life-cycle', '/essential/life-cycle#transform']
	}),
	title: z.string().meta({
		description: 'The title of the page'
	}),
	content: z.string().meta({
		description: 'The content excerpt of the page'
	}),
	score: z.number().meta({
		description: 'Tthe relevance score of the page'
	})
})

const referencesModel = referenceModel
	.or(z.array(referenceModel))
	.nullable()
	.meta({
		description: 'The reference(s) retrieved from the page.'
	})

export async function cache<T extends (...args: any) => any>(
	name: string,
	fn: T
): Promise<Awaited<ReturnType<T>>> {
	return record(name, async () => {
		const cache = await redis.get(name)

		if (cache) {
			log(`Cache hit for '${name}'`)

			return JSON.parse(cache)
		}

		const result = await fn()
		redis.set(name, JSON.stringify(result), 'EX', 3600)

		return result
	})
}

export const createSearchTool = (references: Reference[]) =>
	tool({
		name: 'search',
		description:
			'Find relevant information from Elysia documentation. Read only, no side effects.',
		inputSchema: z.object({
			sentence: z.string().meta({
				description:
					'The keyword/sentence to search in the documentation',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			})
		}),
		outputSchema: referencesModel,
		async execute({ sentence }) {
			log('Search:', sentence)

			let documents = await retry(
				() => cache(`search:${sentence}`, () => search(sentence)),
				5
			)
			if (!documents) return null

			// Intentionally no await
			redis.set(
				`search:${sentence}`,
				JSON.stringify(documents),
				'EX',
				3600
			)

			references.push(...documents)

			return documents
		}
	})

export const createPageTool = (references: Reference[]) =>
	tool({
		name: 'read_page',
		description:
			'Read a specific page with in-depth detail. Read only, no side effects.',
		inputSchema: z.object({
			link: z.string().meta({
				description:
					'The link of the page to read from Elysia documentation. Must not end with ".md"',
				examples: [
					'essential/handler',
					'essential/life-cycle#transform'
				]
			})
		}),
		outputSchema: referencesModel,
		async execute({ link }) {
			link = normalizePage(link)

			log('Read:', link)

			const documents = await retry(
				() => cache(`page:${link}`, () => readPage(link)),
				5
			)
			if (!documents) return null

			if (Array.isArray(documents)) references.push(...documents)
			else references.push(documents)

			return documents
		}
	})
