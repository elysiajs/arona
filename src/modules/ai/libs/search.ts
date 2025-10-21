import { embed } from 'ai'

import { sql, retry, openai } from '@arona/libs'
import { findReference, type Reference } from './sql'

export async function readPage(file: string): Promise<Reference | Reference[]> {
	if (file.includes('://')) file = file.slice(file.indexOf('/') + 11)

	if (file.includes('#'))
		return sql<
			Reference[]
		>`SELECT title, content, file, link FROM doc_chunks WHERE link = ${file} LIMIT = 1`.then(
			(x) => Object.assign(x[0], { score: 1 })
		)

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
		.then((x) => x.filter((r) => r.score >= 0.35))
}

export const deduplicateReferences = (references: Reference[]) => {
	const links = new Set<string>()

	return references.filter((r) => {
		if (links.has(r.link)) return false
		links.add(r.link)
		return true
	})
}

function joinReferencesContent(references: Reference[]) {
	const content = `References:\n${references.map((reference) => `## ${reference.title}\n${reference.content}`).join('\n')}`

	if (content.length >= 131072) return content.slice(0, 131072)

	return content
}

export async function instruct(references: Reference[]) {
	if (!references.length)
		return 'References: There is no references available. Might say you are not able to find any information regarding this topic.'

	references = deduplicateReferences(references)
	if (references.length > 12) {
		let i = 0

		for (const reference of references) {
			if (reference.score === 1) continue

			references.splice(references.indexOf(reference), 1)
			i++

			if (i >= 8) break
		}
	}

	if (Math.abs(references[0]?.score) < 0.5)
		return joinReferencesContent(references)

	let chapters = await retry(
		() => sql<Reference[]>`SELECT
		title, content, file, link
	   	FROM doc_chunks
	   	WHERE file = ${references[0].file}`
	)

	if (!chapters.length) return joinReferencesContent(references)

	references.unshift(...chapters)
	references = deduplicateReferences(references)

	return joinReferencesContent(references)
}
