import { t, type UnwrapSchema } from 'elysia'

export const Models = {
	history: t.Array(
		t.Object({
			role: t.UnionEnum(['user', 'assistant']),
			content: t.String({
				maxLength: 8192
			})
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
	reference: t.Object({
		title: t.String(),
		score: t.Number(),
		summary: t.String({
			description: 'Part of the content retrieved from the page'
		}),
		link: t.String({
			description:
				'The link of the page to read to read when content is missing or not enough',
			examples: ['essential/life-cycle']
		})
	}),
	get references() {
		return t.Union(
			[this.reference, t.Array(this.reference), t.Null()],
			{
				description: 'References retrieved from the page'
			}
		)
	}
}

export type Models = {
	[k in keyof typeof Models]: UnwrapSchema<(typeof Models)[k]>
}

export type History = Models['history']
export type Reference = Models['reference']
