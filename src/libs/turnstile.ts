import { Elysia, t } from 'elysia'
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'

if (!process.env.TURNSTILE_SECRET)
	throw new Error('TURNSTILE_SECRET is not set')

const ipLimiter = new RateLimiterMemory({
	points: 8,
	duration: 35
})

export const turnstile = new Elysia()
	.model({
		turnstile: t.Object(
			{
				'x-turnstile-token': t.String(),
				'cf-connecting-ip': t.Optional(t.String())
			},
			{
				additionalProperties: true
			}
		)
	})
	.macro('turnstile', {
		beforeHandle: async function turnstile({
			headers,
			status,
			request,
			server,
			set
		}) {
			if (
				process.env.NODE_ENV === 'development' ||
				headers['x-api-key'] ===
					(process.env['api_key'] ?? 'Blue Archive')
			)
				return

			if (!headers['x-turnstile-token'])
				return status(400, {
					message:
						'Missing verification token. Please try reloading the page.'
				})

			const formData = new FormData()
			formData.append('secret', process.env.TURNSTILE_SECRET!)
			formData.append('response', headers['x-turnstile-token'])

			const ip =
				headers['cf-connecting-ip'] ||
				(await server?.requestIP(request)?.address)

			if (ip) formData.append('remoteip', ip)

			const error = await ipLimiter
				.consume(ip)
				.then(() => null)
				.catch((error) => {
					const limit = error as RateLimiterRes

					set.headers['Retry-After'] = limit.msBeforeNext / 1000
					set.headers['X-RateLimit-Limit'] = limit.consumedPoints
					set.headers['X-RateLimit-Remaining'] = limit.remainingPoints
					set.headers['X-RateLimit-Reset'] = Math.ceil(
						(Date.now() + limit.msBeforeNext) / 1000
					)

					return status(429, {
						message: `Please slow down`
					})
				})

			if (error) return error

			const data = await fetch(
				'https://challenges.cloudflare.com/turnstile/v0/siteverify',
				{
					method: 'POST',
					body: formData
				}
			).then((response) => response.json())

			if (!data.success)
				return status(400, {
					message: 'Failed to verify. Please try reloading the page.'
				})
		}
	})
