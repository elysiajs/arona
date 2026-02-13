import { getEmbeddingBuffer, log, redis, stripFillers } from '@arona/libs'
import { cyrb53 } from './utils'

const shouldNotCache = (prompt: string) =>
	prompt.length > 160 || !isNaN(+prompt) || prompt.includes('```')

export abstract class SemanticCache {
	static async get(prompt: string) {
		if (shouldNotCache(prompt)) return null

		prompt = stripFillers(prompt)

		try {
			// @ts-ignore
			const response: [
				count: number,
				key: string,
				[
					scoreTitle: string,
					stringifiedScore: string,
					responseTitle: string,
					response: string
				]
			] = await redis
				.call(
					'FT.SEARCH',
					'idx:cache',
					'*=>[KNN 1 @embedding $vec AS score]',
					'PARAMS',
					'2',
					'vec',
					await getEmbeddingBuffer(prompt, {
						ttl: 180,
						skipFiller: true
					}),
					'DIALECT',
					'2',
					'RETURN',
					'3',
					'response',
					'score'
				)
				.catch(() => null)

			if (!response || response.length < 3) return null

			const [, , [, stringifiedScore, , cached]] = response

			const score = parseFloat(stringifiedScore)
			const similarity = 1 - score

			if (similarity < 0.92) return null

			log(
				`Semantic Cache Hit with similarity: ${similarity.toFixed(4)} for: "${prompt}"`
			)

			return cached
		} catch {
			return
		}
	}

	static async set(prompt: string, response: string) {
		if (shouldNotCache(prompt)) return null

		prompt = stripFillers(prompt)

		const key = `cache:${cyrb53(prompt)}`

		try {
			const result = await redis.hset(key, {
				prompt,
				response,
				embedding: await getEmbeddingBuffer(prompt, {
					ttl: 180,
					skipFiller: true
				})
			})

			await redis.expire(key, 10_800)

			log('Semantic Cache Set for:', prompt)

			return result
		} catch {
			return
		}
	}
}
