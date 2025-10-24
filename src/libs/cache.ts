import { record } from '@elysiajs/opentelemetry'

import { redis } from './redis'
import { log } from './log'

export const cache = async <T extends (...args: any) => any>(
	name: string,
	fn: T
): Promise<Awaited<ReturnType<T>>> =>
	record(name, async () => {
		const cache = await redis.get(name)

		if (cache) {
			log(`Cache hit for '${name}'`)

			return JSON.parse(cache)
		}

		const result = await fn()
		redis.set(name, JSON.stringify(result), 'EX', 3600)

		return result
	})
