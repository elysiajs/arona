import { t, type UnwrapSchema } from 'elysia'
import z from 'zod'

export const Models = {
	history: z.array(
		z.object({
			role: z.literal('user').or(z.literal('assistant')),
			content: z.string().max(8192)
		})
	),
	ask: t.Object({
		seed: t.Optional(t.Number()),
		reference: t.Optional(t.String()),
		message: t.String({
			maxLength: 4096
		}),
		think: t.Optional(t.Boolean()),
		history: t.Optional(
			t.Array(
				t.Object({
					role: t.UnionEnum(['user', 'assistant']),
					content: t.String({
						maxLength: 8192
					}),
					checksum: t.String()
				}),
				{
					maxItems: 8
				}
			)
		)
	}),
	reference: z.object({
		title: z.string(),
		score: z.number(),
		summary: z.string(),
		link: z.string().meta({
			description: 'The link of the page to read',
			examples: ['essential/life-cycle']
		})
	}),
	get references() {
		return this.reference.or(z.array(this.reference)).nullable().meta({
			description: 'References retrieved from the page'
		})
	}
}

export type Models = {
	[k in keyof typeof Models]: UnwrapSchema<(typeof Models)[k]>
}

export type History = Models['history']
export type Reference = Models['reference']
