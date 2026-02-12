import type { History, Reference } from '../model'

export const compressHistory = (history: History) =>
	history
		?.map((x) => {
			if (x.content.length < 1280) return x

			const sourceIndex = x.content.lastIndexOf('Sources:\n')
			const source =
				sourceIndex !== -1 ? '\n\n' + x.content.slice(sourceIndex) : ''

			return {
				...x,
				content: x.content.slice(0, 1280) + '...' + source
			}
		})
		.slice(-5) ?? []

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
