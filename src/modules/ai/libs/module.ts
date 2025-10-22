import { Elysia } from 'elysia'

import { ip, isDev, redis, rateLimit as rateLimitFn } from '@arona/libs'

export const rateLimit = new Elysia().use(ip).macro('AIRateLimit', {
	ip: true,
	async beforeHandle({ ip, status, set }) {
		if (isDev) return

		const limit = await rateLimitFn('ai', 6, 30)
		if (limit.allowed) return

		set.headers['Retry-After'] = limit.retryAfter / 1000
		set.headers['X-RateLimit-Limit'] = 6
		set.headers['X-RateLimit-Remaining'] = 0
		set.headers['X-RateLimit-Reset'] = Math.ceil(
			(Date.now() + limit.retryAfter) / 1000
		)

		return status(429, {
			message: `Ratelimit exceeded. Please try again in ${set.headers['Retry-After']} seconds.`
		})
	}
})
