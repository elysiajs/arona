import { tool } from 'ai'
import * as z from 'zod'

import { retry, log, cache, model, tableOfContents } from '@arona/libs'

import { History, Models, type Reference } from '../model'
import { normalizePage } from './utils'
import { search, readPage } from '../service'

export const createSearchTool = (references: Reference[]) =>
	tool({
		description:
			"Search relevant information from Elysia documentation. No need to specify 'Elysia' as keyword. This tool is deterministic, don't call with the same parameters twice",
		inputSchema: z.object({
			sentence: z.string().meta({
				description: 'The keyword/sentence to search',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			})
		}),
		outputSchema: Models.references,
		async execute({ sentence }) {
			log('Search:', sentence)

			let documents = await retry(
				() => cache(`search: ${sentence}`, () => search(sentence)),
				3
			)

			if (!documents) return null

			const refs = references.map((ref) => ref.link)
			const newDocuments = documents.filter(
				(document) => !refs.includes(document.link)
			)
			if (!newDocuments.length) return null

			references.push(...newDocuments)

			return newDocuments
		}
	})

export const createPageTool = (references: Reference[]) =>
	tool({
		description: `Read a specific page from Elysia documentation with in detail. This tool is deterministic, don't call with the same parameters twice`,
		inputSchema: z.object({
			link: z.string().meta({
				description: 'The link of the page to read',
				examples: ['patterns/openapi', 'essential/life-cycle#transform']
			})
		}),
		outputSchema: Models.references,
		async execute({ link }) {
			link = normalizePage(link)

			log('Read:', link)

			const documents = await retry(
				() => cache(`page:${link}`, () => readPage(link)),
				3
			)
			if (!documents) return null

			if (Array.isArray(documents)) references.push(...documents)
			else references.push(documents)

			return documents
		}
	})

export const tableOfContentsTool = tool({
	description:
		'List all available Elysia documents. Call "read_page" tool with link to read the page',
	inputSchema: z.object({}),
	outputSchema: z.string(),
	execute: () => tableOfContents
})

export const createHistoryTool = (execute: () => History) =>
	tool({
		description:
			'Read conversation history. Call this tool when you think you are missing user context',
		inputSchema: z.object({}),
		outputSchema: Models.history,
		execute
	})
