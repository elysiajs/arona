// import Elysia, { t } from 'elysia'
// import { RateLimiterMemory } from 'rate-limiter-flexible'

// import crypto from 'crypto'
// import {
// 	verifyRegistrationResponse,
// 	VerifiedRegistrationResponse
// } from '@simplewebauthn/server'

// import { ip } from './ip'

// const CONFIG = {
// 	POW_DIFFICULTY: 22,
// 	CHALLENGE_EXPIRY_MS: 1.5 * 60_000,
// 	TOKEN_EXPIRY_MS: 5 * 60_000,
// 	RP_ID: process.env.RP_ID || 'localhost',
// 	RP_NAME: 'Elysia Arona Proof of Work',
// 	ORIGIN: process.env.ORIGIN || 'http://localhost:5173'
// } as const

// const secret = process.env.CHALLENGE_SECRET
// if (!secret)
// 	throw new Error('CHALLENGE_SECRET is not set in environment variables')

// const isProduction = process.env.NODE_ENV === 'production'

// const models = {
// 	challengeRecord: t.Object({
// 		nonce: t.String(),
// 		webauthnChallenge: t.String(),
// 		ip: t.String(),
// 		issued: t.Number()
// 	}),
// 	tokenRecord: t.Object({
// 		credentialId: t.String(),
// 		issued: t.Number()
// 	}),
// 	challengeVerifyBody: t.Object({
// 		pow: t.Object({
// 			suffix: t.String(),
// 			bits: t.Number()
// 		}),
// 		webauthn: t.Object({
// 			challenge: t.String(),
// 			credentialId: t.String(),
// 			clientDataJSON: t.String(),
// 			attestationObject: t.String()
// 		})
// 	})
// } as const

// type models = typeof models

// export const powAuthn = new Elysia({
// 	prefix: 'powAuthn',
// 	name: 'libs/powAuthn'
// })
// 	.use(ip)
// 	.model({
// 		...models,
// 		challengeRecordCookie: t.Object({
// 			challenge: models.challengeRecord
// 		}),
// 		tokenRecordCookie: t.Object({
// 			token: models.tokenRecord
// 		})
// 	})
// 	.prefix('model', 'pow.')
// 	.get(
// 		'/request',
// 		({ ip, cookie: { challenge } }) => {
// 			const nonce = crypto.randomBytes(32).toString('hex')
// 			const webauthnChallenge = crypto
// 				.randomBytes(32)
// 				.toString('base64url')

// 			const issued = Date.now()

// 			challenge.set({
// 				maxAge: CONFIG.CHALLENGE_EXPIRY_MS,
// 				value: {
// 					nonce,
// 					webauthnChallenge,
// 					ip,
// 					issued
// 				} satisfies models['challengeRecord']['static']
// 			})

// 			return {
// 				pow: {
// 					nonce,
// 					bits: CONFIG.POW_DIFFICULTY
// 				},
// 				webauthn: {
// 					challenge: webauthnChallenge,
// 					rpId: CONFIG.RP_ID
// 				},
// 				expires: issued + CONFIG.CHALLENGE_EXPIRY_MS
// 			} as const
// 		},
// 		{
// 			ip: true
// 		}
// 	)
// 	.post(
// 		'/verify',
// 		async ({
// 			ip,
// 			body: { pow, webauthn },
// 			cookie: { challenge, token },
// 			status
// 		}) => {
// 			if (challenge.value.webauthnChallenge !== webauthn.challenge)
// 				return status(403, 'Challenge mismatch')

// 			if (challenge.value.ip !== ip)
// 				return status(403, 'IP address mismatch')

// 			if (
// 				challenge.value.issued + CONFIG.CHALLENGE_EXPIRY_MS <
// 				Date.now()
// 			)
// 				return status(403, 'Challenge expired')

// 			const powInput = `${webauthn.challenge}:${challenge.value.nonce}:${pow.suffix}`
// 			const hash = crypto
// 				.createHash('sha256')
// 				.update(powInput)
// 				.digest('hex')

// 			const requiredPrefix = '0'.repeat(pow.bits / 4)

// 			if (!hash.startsWith(requiredPrefix))
// 				return status(403, 'Invalid proof of work')

// 			let verification: VerifiedRegistrationResponse
// 			try {
// 				verification = await verifyRegistrationResponse({
// 					response: {
// 						type: 'public-key',
// 						id: webauthn.credentialId,
// 						rawId: webauthn.credentialId,
// 						response: {
// 							attestationObject: webauthn.attestationObject,
// 							clientDataJSON: webauthn.clientDataJSON
// 						},
// 						clientExtensionResults: {}
// 					},
// 					expectedChallenge: webauthn.challenge,
// 					expectedOrigin: CONFIG.ORIGIN,
// 					expectedRPID: CONFIG.RP_ID,
// 					requireUserVerification: false
// 				})
// 			} catch (error) {
// 				return status(403, 'WebAuthn verification failed')
// 			}

// 			if (!verification.verified)
// 				return status(403, 'WebAuthn attestation invalid')

// 			const credential = verification.registrationInfo.credential
// 			const uid = Buffer.from(credential.id).toString('base64')

// 			challenge.remove()

// 			token.set({
// 				maxAge: CONFIG.TOKEN_EXPIRY_MS,
// 				value: {
// 					credentialId: uid,
// 					issued: Date.now()
// 				} satisfies models['tokenRecord']['static']
// 			})

// 			return ''
// 		},
// 		{
// 			ip: true,
// 			body: 'pow.ChallengeVerifyBody',
// 			cookie: 'pow.ChallengeRecordCookie'
// 		}
// 	)
// 	.macro('pow', {
// 		cookie: 'pow.TokenRecordCookie',
// 		resolve({ cookie: { token }, status }) {
// 			if (token.value.issued + CONFIG.TOKEN_EXPIRY_MS < Date.now())
// 				return status(403, 'Protection token expired')

// 			token.remove()

// 			return {
// 				pow: token.value.credentialId
// 			}
// 		}
// 	})
