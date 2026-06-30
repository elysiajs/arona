import { record } from '@elysia/opentelemetry'

import { redis } from './redis'
import { log } from './log'

export const cache = async <T extends (...args: any) => any>(
	name: string,
	fn: T
): Promise<Awaited<ReturnType<T>>> =>
	record(name, async () => {
		try {
			const cache = await redis.get(name)

			if (cache) {
				log(`Cache hit for '${name}'`)

				return JSON.parse(cache)
			}

			const result = await fn()
			redis.set(name, JSON.stringify(result), 'EX', 10_800)

			return result
		} catch (error) {
			console.log(error)

			return fn()
		}
	})
