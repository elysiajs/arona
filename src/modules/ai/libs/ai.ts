import { tool } from 'ai'
import z from 'zod'

import { search } from './search'

export const searchTool = tool({
	name: 'search',
	description:
		'Find relevant information from Elysia documentation to answer user questions. Use this tool when you need to look up specific details, code examples, or explanations about Elysia framework features and functionalities.',
	inputSchema: z.object({
		keyword: z
			.string()
			.describe('The keyword to search for in the Elysia documentation')
	}),
	execute: ({ keyword }) => {
		console.log('search', keyword)

		return search(keyword)
	}
})
