import type { ModelMessage } from 'ai'

import { instruction, sql } from '@arona/libs'

import type { History, Reference } from '../model'

export const compressHistory = (history: History) =>
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

export const deduplicateReferences = (references: Reference[]) => {
	const links = new Set<string>()

	return references.filter((r) => {
		if (links.has(r.link)) return false
		links.add(r.link)
		return true
	})
}

export const createMessages = (
	message: string,
	references: Reference[],
	history: History
) =>
	[
		{
			role: 'system',
			content: references.length
				? `${instruction}\nPage Data:\n${references
						.map((x) => `# ${x.title}\n${x.summary || x.content}`)
						.join('\n')}`
				: instruction
		},
		...compressHistory(history),
		{
			role: 'user',
			content: history?.length
				? message
				: `Hi Elysia chan! ${message}. Would you kindly help me?`
		}
	] as ModelMessage[]
