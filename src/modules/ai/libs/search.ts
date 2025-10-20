import { embed } from 'ai'

import { sql, retry, openai } from '@arona/libs'
import { findReference, type Reference } from './sql'

export async function readPage(file: string) {
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

export async function instruct(references: Reference[]) {
	let content = `References:\n${references.map((reference) => `## ${reference.title}\n${reference.content}`).join('\n\n')}`
	if (content.length >= 131072) content = content.slice(0, 131072)

	if (Math.abs(references[0]?.score) < 0.5) return content

	const chapters = await retry(
		() => sql<Pick<Reference, 'content' | 'title'>[]>`SELECT
	title, content, file, link
   	FROM doc_chunks
   	WHERE file = ${references[0].file}`
	)

	if (!chapters.length) return content

	return (
		content +
		`\n\n# ${references[0].file.slice(5, -3)}\n\n` +
		chapters.map((c) => `## ${c.title}\n${c.content}`).join('\n\n')
	)
}
