import { embed } from 'ai'

import { sql, retry, openai } from '@arona/libs'
import { findReference, type Reference } from './sql'

export function normalizePage(file: string) {
	if (file.includes('://')) file = file.slice(file.indexOf('/') + 11)
	if (file.startsWith('/')) file = file.slice(1)

	return file
}

export async function readPage(file: string): Promise<Reference | Reference[]> {
	if (file.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, content, file, link FROM doc_chunks WHERE link = ${file.replace(/^docs\/|.md/g, '')} LIMIT = 1`.then(
			(x) => Object.assign(x[0], { score: 1 })
		)

	if (!file.endsWith('.md')) file += '.md'

	return sql<
		Reference[]
	>`SELECT title, content, file, link FROM doc_chunks WHERE file = ${file}`.then(
		(x) => x.map((r) => Object.assign(r, { score: 1 }))
	)
}

export async function search(value: string, abortSignal?: AbortSignal) {
	const { embedding } = await retry(() =>
		embed({
			model: openai.textEmbeddingModel('text-embedding-3-small'),
			value,
			abortSignal
		})
	)

	return sql
		.unsafe<Reference[]>(findReference, [`[${embedding.join(',')}]`])
		.then((x) => x.filter((r) => r.score >= 0.44))
}

export const deduplicateReferences = (references: Reference[]) => {
	const links = new Set<string>()

	return references.filter((r) => {
		if (links.has(r.link)) return false
		links.add(r.link)
		return true
	})
}
