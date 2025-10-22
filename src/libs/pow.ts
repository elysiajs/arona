import { Elysia, t } from 'elysia'

import crypto from 'crypto'

import { ip } from './ip'

const CONFIG = {
	POW_DIFFICULTY: 19,
	CHALLENGE_EXPIRY_MS: 1.5 * 60_000,
	TOKEN_EXPIRY_MS: 5 * 60_000,
	RP_ID: process.env.RP_ID || 'localhost',
	RP_NAME: 'Elysia Arona Proof of Work',
	ORIGIN: process.env.ORIGIN || 'http://localhost:5173'
} as const

const secret = process.env.CHALLENGE_SECRET
if (!secret)
	throw new Error('CHALLENGE_SECRET is not set in environment variables')

const models = {
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

type models = typeof models

export const pow = new Elysia({
	prefix: 'pow',
	name: 'libs/pow'
})
	.use(ip)
	.model({
		...models,
		challengeRecordCookie: t.Object({
			challenge: models.challengeRecord
		})
	})
	.prefix('model', 'pow.')
	.get(
		'/request',
		({ ip, cookie: { challenge } }) => {
			const nonce = crypto.randomBytes(32).toString('hex')
			const issued = Date.now()

			challenge.set({
				maxAge: CONFIG.CHALLENGE_EXPIRY_MS,
				value: {
					nonce,
					ip,
					issued,
					bits: CONFIG.POW_DIFFICULTY
				} satisfies models['challengeRecord']['static']
			})

			return {
				nonce,
				bits: CONFIG.POW_DIFFICULTY,
				expires: issued + CONFIG.CHALLENGE_EXPIRY_MS
			} as const
		},
		{
			ip: true
		}
	)
	.macro('pow', {
		ip: true,
		body: 'pow.ChallengeVerifyBody',
		cookie: 'pow.ChallengeRecordCookie',
		resolve({
			status,
			ip,
			body: {
				pow: { suffix }
			},
			cookie: { challenge }
		}) {
			if (challenge.value.ip !== ip)
				return status(403, 'IP address mismatch')

			if (
				challenge.value.issued + CONFIG.CHALLENGE_EXPIRY_MS <
				Date.now()
			)
				return status(403, 'Challenge expired')

			const credentialId = `${challenge.value.nonce}:${suffix}`
			const hash = crypto
				.createHash('sha256')
				.update(credentialId)
				.digest('hex')

			const requiredPrefix = '0'.repeat(challenge.value.bits / 4)

			if (!hash.startsWith(requiredPrefix))
				return status(403, 'Invalid proof of work')

			challenge.remove()

			// token.set({
			// 	maxAge: CONFIG.TOKEN_EXPIRY_MS,
			// 	value: {
			// 		credentialId: hash,
			// 		issued: Date.now()
			// 	} satisfies models['tokenRecord']['static']
			// })
		}
	})
