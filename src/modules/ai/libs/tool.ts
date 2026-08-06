import {
	retry,
	log,
	cache,
	tableOfContents,
	type Tool
} from '@arona/libs'

import { History, type Reference } from '../model'
import { normalizePage } from './utils'
import { search, readPage } from '../service'

export const createSearchTool = (references: Reference[]): Tool => ({
	description:
		"Search relevant information from Elysia documentation. No need to specify 'Elysia' as keyword. Content is only some part of a page, use 'read_page' tool with 'link' to read full content. This tool is deterministic, don't call with the same parameters twice",
	parameters: {
		type: 'object',
		properties: {
			sentence: {
				type: 'string',
				description: 'The keyword/sentence to search',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			}
		},
		required: ['sentence']
	},
	async execute({ sentence }: { sentence: string }) {
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

export const createPageTool = (references: Reference[]): Tool => ({
	description: `Read a specific page from Elysia documentation with in detail. This tool is deterministic, don't call with the same parameters twice`,
	parameters: {
		type: 'object',
		properties: {
			link: {
				type: 'string',
				description: 'The link of the page to read',
				examples: ['patterns/openapi', 'essential/life-cycle#transform']
			}
		},
		required: ['link']
	},
	async execute({ link }: { link: string }) {
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

export const tableOfContentsTool: Tool = {
	description:
		'List all available Elysia documents. Call "read_page" tool with link to read the page',
	parameters: { type: 'object', properties: {} },
	execute: () => tableOfContents
}

export const createHistoryTool = (execute: () => History): Tool => ({
	description:
		'Read conversation history. Call this tool when you think you are missing user context',
	parameters: { type: 'object', properties: {} },
	execute
})
