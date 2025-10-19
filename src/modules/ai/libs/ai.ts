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
	execute({ sentence }) {
		console.log('Searching for:', sentence)

		return search(sentence)
	}
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
	execute({ link }) {
		console.log('Reading page:', link)

		return readPage(link)
	}
})
