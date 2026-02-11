import { t, type UnwrapSchema } from 'elysia'

export const Models = {
	challengeRecord: t.Object({
		nonce: t.String(),
		ip: t.String(),
		issued: t.Number(),
		bits: t.Number()
	}),
	tokenRecord: t.Object({
		credentialId: t.String(),
		issued: t.Number()
	}),
	challengeVerifyBody: t.Object({
		pow: t.Object({
			suffix: t.String()
		})
	})
} as const

export type Models = {
	[k in keyof typeof Models]: UnwrapSchema<(typeof Models)[k]>
}
