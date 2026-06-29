import { Elysia, prefix, t } from 'elysia'

import crypto from 'crypto'

import { ipMacro, rateLimitMacro } from '@arona/libs'
import { CONFIG, secret } from './const'
import { Models } from './model'

export const pow = new Elysia({
	prefix: 'pow',
	name: 'pow'
})
	.use(ipMacro)
	.use(rateLimitMacro)
	.get(
		'/request',
		{
			rateLimit: true,
			ip: true,
			cookie: t.Cookie({
				challenge: t.Optional(Models.challengeRecord)
			})
		},
		({ ip, cookie: { challenge } }) => {
			const nonce = crypto.randomBytes(32).toString('hex')
			const issued = Date.now()

			challenge.set({
				maxAge: CONFIG.CHALLENGE_EXPIRY_MS / 1000,
				secrets: secret,
				value: {
					nonce,
					ip,
					issued,
					bits: CONFIG.POW_DIFFICULTY
				} satisfies Models['challengeRecord']
			})

			return {
				nonce,
				bits: CONFIG.POW_DIFFICULTY,
				expires: issued + CONFIG.CHALLENGE_EXPIRY_MS
			} as const
		}
	)

export const powMacro = new Elysia({
	name: 'pow.macro'
})
	.use(ipMacro)
	.model(prefix.capitalize('Pow', Models))
	.macro({
		pow: {
			ip: true,
			body: 'Pow.ChallengeVerifyBody',
			cookie: t.Cookie({
				challenge: Models.challengeRecord
			}),
			beforeHandle: function pow({
				// @ts-expect-error
				ip,
				status,
				body: {
					pow: { suffix }
				},
				cookie: { challenge }
			}) {
				if (challenge.value.ip !== ip) {
					challenge.remove()

					return status(401, 'IP address mismatch')
				}

				if (
					challenge.value.issued + CONFIG.CHALLENGE_EXPIRY_MS <
					Date.now()
				) {
					challenge.remove()

					return status(403, 'Challenge expired')
				}

				const credentialId = `${challenge.value.nonce}:${suffix}`
				const hash = crypto
					.createHash('sha256')
					.update(credentialId)
					.digest('hex')

				const requiredPrefix = '0'.repeat(challenge.value.bits / 4)

				if (!hash.startsWith(requiredPrefix))
					return status(403, 'Invalid proof of work')

				challenge.remove()
			}
		}
	})
