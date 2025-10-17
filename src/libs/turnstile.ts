import { Elysia, t } from 'elysia'
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible'

if (!process.env.TURNSTILE_SECRET)
	throw new Error('TURNSTILE_SECRET is not set')

const ipLimiter = new RateLimiterMemory({
	points: 8,
	duration: 35
})

const aiLimiter = new RateLimiterMemory({
	points: 6,
	duration: 30
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
	.macro('ip', {
		resolve: async ({ headers, server, request }) => ({
			ip:
				headers['cf-connecting-ip'] ||
				(await server?.requestIP(request)?.address)
		})
	})
	.macro('AIRateLimit', {
		ip: true,
		async beforeHandle({ ip, status, set }) {
			if (process.env.NODE_ENV === 'development') return

			const limit = await aiLimiter
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
						message: `Rate	 limit exceeded. Please try again in ${set.headers['X-RateLimit-Reset']} seconds.`
					})
				})

			if (limit) return
		}
	})
	.macro('turnstile', {
		ip: true,
		beforeHandle: async function turnstile({ headers, status, set, ip }) {
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

			if (ip) formData.append('remoteip', ip)

			const error = await ipLimiter
				.consume(ip || 'unknown')
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
						message: `Rate	 limit exceeded. Please try again in ${set.headers['X-RateLimit-Reset']} seconds.`
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

			// @ts-ignore
			if (!data.success)
				return status(400, {
					message: 'Failed to verify. Please try reloading the page.'
				})
		}
	})
