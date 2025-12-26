import { embed } from 'ai'

import { openai, retry, sql } from '@arona/libs'

import type { Models } from './models'
import { Reference, SQL } from './const'

export const compressHistory = (history: Models.ask['history']) =>
	history
		?.map((x) => {
			if (x.content.length < 2048) return x

			const sourceIndex = x.content.lastIndexOf('Sources:\n')
			const source =
				sourceIndex !== -1 ? '\n\n' + x.content.slice(sourceIndex) : ''

			return {
				...x,
				content: x.content.slice(0, 2048) + '...' + source
			}
		})
		.slice(-8) ?? []

/**
 * Normalize link in case something went wrong (for legacy reasons)
 * @param file
 * @returns
 */
export function normalizePage(file: string) {
	if (file.includes('://')) file = file.slice(file.indexOf('/') + 11)
	if (file.startsWith('/')) file = file.slice(1)

	return file
}

export async function readPage(link: string): Promise<Reference | Reference[]> {
	link = link.replace(/^docs\/|.md/g, '')

	if (link.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, content, link FROM doc_chunks WHERE link = ${link} LIMIT 1`.then(
			(x) => (x[0] ? Object.assign(x[0], { score: 1 }) : [])
		)

	return sql<
		Reference[]
	>`SELECT title, content, link FROM doc_chunks WHERE link LIKE ${link + '%'}`.then(
		(x) => x.map((r) => Object.assign(r, { score: 1 }))
	)
}

export async function search(value: string, abortSignal?: AbortSignal) {
	const { embedding } = await retry(() =>
		embed({
			model: openai.embeddingModel('text-embedding-3-small'),
			value,
			abortSignal
		})
	)

	return sql
		.unsafe<Reference[]>(SQL.findReference, [`[${embedding.join(',')}]`])
		.then((x) => x.filter((r) => r.score >= 0.42))
}

export const deduplicateReferences = (references: Reference[]) => {
	const links = new Set<string>()

	return references.filter((r) => {
		if (links.has(r.link)) return false
		links.add(r.link)
		return true
	})
}
