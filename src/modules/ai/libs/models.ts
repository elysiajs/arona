import { t } from 'elysia'
import z from 'zod'

export namespace Models {
	export const ask = t.Object({
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
						maxLength: 16384
					})
				}),
				{
					maxItems: 16
				}
			)
		)
	})

	export type ask = (typeof ask)['static']

	export const reference = z.object({
		title: z.string().describe('The title of the page'),
		content: z.string().describe('The content excerpt of the page'),
		score: z.number().describe('The relevance score of the page'),
		link: z.string().meta({
			description:
				'The link of the page to read from Elysia documentation',
			examples: ['essential/life-cycle']
		})
	})

	export type Reference = z.infer<typeof reference>

	export const references = reference.or(z.array(reference)).nullable().meta({
		description: 'The reference(s) retrieved from the page.'
	})

	export type References = z.infer<typeof references>
}
