import { tool } from 'ai'
import * as z from 'zod'

import { retry } from '@arona/libs'
import { search, readPage } from './search'
import type { Reference } from './sql'

export const createSearchTool = (references: Reference[]) =>
	tool({
		name: 'search',
		description: 'Find relevant information from Elysia documentation.',
		inputSchema: z.object({
			sentence: z.string().meta({
				description:
					'The keyword/sentence to search in the documentation',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			})
		}),
		execute({ sentence }) {
			console.log('Searching for:', sentence)

			const links = new Set(references.map((r) => r.link))

			return retry(() => search(sentence), 5).then((x) => {
				if (!x) return null

				x = x.filter((r) => !links.has(r.link))
				references.push(...x)

				return x
			})
		}
	})

export const createPageTool = (references: Reference[]) =>
	tool({
		name: 'read_page',
		description: 'Read a specific page from Elysia documentation.',
		inputSchema: z.object({
			link: z.string().meta({
				description:
					'The link of the page to read from Elysia documentation',
				examples: [
					'/essential/handler',
					'/essential/life-cycle#transform'
				]
			})
		}),
		execute({ link }) {
			console.log('Reading page:', link)

			const links = new Set(references.map((r) => r.link))

			return retry(() => readPage(link), 5).then((x) => {
				if (!x) return null

				if (Array.isArray(x)) {
					x = x.filter((r) => !links.has(r.link))
					references.push(...x)
				} else {
					if (links.has(x.link)) return null

					references.push(x)
				}

				return x
			})
		}
	})
