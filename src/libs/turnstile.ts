import { Elysia, t } from 'elysia'

import { API_KEY, isDev } from './flags'
import { ipMacro } from './ip'
import { rateLimit } from './rate-limit'
import { retry } from './retry'

if (!process.env.TURNSTILE_SECRET)
	throw new Error('TURNSTILE_SECRET is not set')

export const turnstileMacro = new Elysia()
	.use(ipMacro)
	.model({
		turnstile: t.Object(
			{
				'x-turnstile-token': t.String(),
				'x-api-key': t.Optional(t.String())
			},
			{
				additionalProperties: true
			}
		)
	})
	.macro({
		turnstile: {
			ip: true,
			headers: (isDev ? undefined : 'turnstile') as 'turnstile',
			beforeHandle: async function turnstile({
				headers,
				status,
				set,
				// @ts-ignore
				ip
			}) {
				if (isDev || headers['x-api-key'] === API_KEY) return

				if (!headers['x-turnstile-token'])
					return status(
						403,
						'Missing verification token. Please try reloading the page.'
					)

				const limit = await rateLimit(`ip:${ip}`, 8, 35)
				if (!limit.allowed) {
					set.headers['Retry-After'] = limit.retryAfter / 1000
					set.headers['X-RateLimit-Limit'] = 6
					set.headers['X-RateLimit-Remaining'] = 0
					set.headers['X-RateLimit-Reset'] = Math.ceil(
						(Date.now() + limit.retryAfter) / 1000
					)

					return status(
						429,
						`Ratelimit exceeded. Please try again in ${set.headers['Retry-After']} seconds.`
					)
				}

				const formData = new FormData()
				formData.append('secret', process.env.TURNSTILE_SECRET!)
				formData.append('response', headers['x-turnstile-token'])
				formData.append('idempotency_key', Bun.randomUUIDv7())

				if (ip) formData.append('remoteip', ip)

				const data = await retry(() =>
					fetch(
						'https://challenges.cloudflare.com/turnstile/v0/siteverify',
						{
							method: 'POST',
							body: formData
						}
					).then(
						(response) =>
							response.json() as Promise<{
								success: boolean
							}>
					)
				)

				if (!data.success)
					return status(
						403,
						'Verification failed. Please try reloading the page.'
					)
			}
		}
	})
