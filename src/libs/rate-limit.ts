import { Elysia } from 'elysia'

import { isDev } from './flags'
import { ipMacro } from './ip'
import { redis } from './redis'

export async function rateLimit(key: string, limit: number, seconds: number) {
	const now = Date.now()
	const windowStart = now - seconds * 1000
	const member = `${now}_${Math.random()}`
	const zsetKey = `rate:${key}`

	await redis.zremrangebyscore(zsetKey, 0, windowStart)
	const count = await redis.zcount(zsetKey, windowStart, now)

	if (count + 1 <= limit) {
		await Promise.all([
			redis.zadd(zsetKey, now, member),
			redis.expire(zsetKey, Math.ceil(seconds) * 2)
		])

		return { allowed: true } as const
	}

	const [, time] = await redis.zrange(zsetKey, 0, 0, 'WITHSCORES')

	return {
		allowed: false,
		retryAfter: Math.max(0, +time + seconds * 1000 - now)
	} as const
}

export const rateLimitMacro = new Elysia().use(ipMacro).macro({
	rateLimit: {
		ip: true,
		async beforeHandle({ ip, status, set }) {
			if (isDev) return

			const limit = await rateLimit(`ip:${ip}`, 10, 35)
			if (limit.allowed) return

			set.headers['Retry-After'] = limit.retryAfter / 1000
			set.headers['X-RateLimit-Limit'] = 11
			set.headers['X-RateLimit-Remaining'] = 0
			set.headers['X-RateLimit-Reset'] = Math.ceil(
				(Date.now() + limit.retryAfter) / 1000
			)

			return status(
				429,
				`Ratelimit exceeded. Please try again in ${set.headers['Retry-After']} seconds.`
			)
		}
	}
})
