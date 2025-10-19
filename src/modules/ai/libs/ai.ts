import { tool } from 'ai'
import z from 'zod'

import { search, readPage } from './search'

export const searchTool = tool({
	name: 'search',
	description: 'Find relevant information from Elysia documentation.',
	inputSchema: z.object({
		sentence: z.string().meta({
			description: 'The keyword/sentence to search in the documentation',
			examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
		})
	}),
	execute: ({ sentence }) => search(sentence)
})

export const readPageTool = tool({
	name: 'read_page',
	description: 'Read a specific page from Elysia documentation.',
	inputSchema: z.object({
		link: z.string().meta({
			description:
				'The link of the page to read from Elysia documentation',
			examples: ['/essential/handler', '/essential/life-cycle#transform']
		})
	}),
	execute: ({ link }) => readPage(link)
})
