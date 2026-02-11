import { record } from '@elysiajs/opentelemetry'

import { type ModelMessage, tool } from 'ai'
import * as z from 'zod'

import {
	retry,
	log,
	cache,
	model,
	instruction,
	tableOfContents
} from '@arona/libs'

import { Models, type Reference } from '../model'
import { normalizePage } from './utils'
import { search, readPage } from '../service'

export const createSearchTool = (references: Reference[]) =>
	tool({
		description:
			'Find relevant information from Elysia documentation. This tool is pure (deterministic), do not call them twice with the same parameters. As result is sub sction, you may need to use "read_page" tool to get more indepth detail.',
		inputSchema: z.object({
			sentence: z.string().meta({
				description:
					'The keyword/sentence to search in the documentation',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			})
		}),
		outputSchema: Models.references,
		async execute({ sentence }) {
			log('Search:', sentence)

			let documents = await retry(
				() => cache(`search:${sentence}`, () => search(sentence)),
				3
			)

			if (!documents) return null

			references.push(...documents)

			return documents
		}
	})

export const createPageTool = (references: Reference[]) =>
	tool({
		description:
			'Read a specific page with in-depth detail. This tool is pure (deterministic), do not call them twice with the same parameters.',
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
		'Gather information about Elysia by listing all available documents pair by title and link. Use link with "read_page" tool to read the page.',
	inputSchema: z.object({}),
	outputSchema: z.string(),
	execute: () => tableOfContents
})
