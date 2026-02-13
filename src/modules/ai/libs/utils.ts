import type { History, Models, Reference } from '../model'

export const compressHistory = (history: History) =>
	history?.map((x) => {
		if (x.content.length < 1280) return x

		const sourceIndex = x.content.lastIndexOf('Sources:\n')
		const source =
			sourceIndex !== -1 ? '\n\n' + x.content.slice(sourceIndex) : ''

		return {
			...x,
			content: x.content.slice(0, 1280) + '...' + source
		}
	}) ?? []

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

export const deduplicateReferences = (references: Reference[]) => {
	const links = new Set<string>()

	return references.filter((r) => {
		if (links.has(r.link)) return false
		links.add(r.link)
		return true
	})
}

export const cyrb53 = (s: string) => {
	let h = 9

	for (let i = 0; i < s.length; ) h = Math.imul(h ^ s.charCodeAt(i++), 9 ** 9)

	return (h = h ^ (h >>> 9))
}

export const createCacheKey = ({
	seed,
	page,
	message,
	think,
	history
}: {
	message: string
	seed: number | undefined
	page: string | undefined
	think: boolean | undefined
	history: Models['ask']['history']
}) => {
	// seed is highly random, don't cache those
	if (seed || history?.length) return

	return `q:${cyrb53(`message:${page ? `:${page}` : ''}${think ? '@' : ''}`)}`
}
