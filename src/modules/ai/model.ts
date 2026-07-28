import { t, type UnwrapSchema } from 'elysia'
import * as v from 'valibot'

export const Models = {
	history: v.array(
		v.object({
			role: v.picklist(['user', 'assistant']),
			content: v.pipe(v.string(), v.maxLength(8192))
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
	reference: v.object({
		title: v.string(),
		score: v.number(),
		summary: v.pipe(
			v.string(),
			v.metadata({
				description: 'Part of the content retrieved from the page'
			})
		),
		link: v.pipe(
			v.string(),
			v.metadata({
				description:
					'The link of the page to read to read when content is missing or not enough',
				examples: ['essential/life-cycle']
			})
		)
	}),
	get references() {
		return v.pipe(
			v.nullable(v.union([this.reference, v.array(this.reference)])),
			v.metadata({
				description: 'References retrieved from the page'
			})
		)
	}
}

export type Models = {
	[k in keyof typeof Models]: UnwrapSchema<(typeof Models)[k]>
}

export type History = Models['history']
export type Reference = Models['reference']
