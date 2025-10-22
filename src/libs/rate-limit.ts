import { redis } from './redis'

export async function rateLimit(key: string, limit: number, seconds: number) {
	const now = Date.now()
	const windowStart = now - seconds * 1000
	const member = `${now}-${Math.random()}`
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

	const oldest = await redis.zrange(zsetKey, 0, 0, 'WITHSCORES')

	return {
		allowed: false,
		retryAfter: Math.max(0, oldest[0][1] + seconds * 1000 - now)
	} as const
}
