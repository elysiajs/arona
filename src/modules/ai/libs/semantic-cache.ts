import { embed } from 'ai'
import { log, openai, redis, retry } from '@arona/libs'
import { cyrb53 } from './utils'

const fillerPattern =
	/^(?:can you tell me|i would like to|would you kindly|i was wondering|just wondering|quick question|do you know|help me with|i want to|i need to|could you|would you|can you|tell me|show me|help me|please|hello|hey|hi|pls|plz)\s+/gi

const stripFillers = (q: string) => {
	while (fillerPattern.test(q)) q = q.replace(fillerPattern, '')

	return q.replace(/[()\[\]{}@#$%^&*!?]/g, '').trim()
}

const shouldNotCache = (prompt: string) =>
	prompt.length > 160 || !isNaN(+prompt) || prompt.includes('```')

export abstract class SemanticCache {
	static async get(prompt: string) {
		if (shouldNotCache(prompt)) return null

		prompt = stripFillers(prompt)

		try {
			const { embedding } = await embed({
				model: openai.embedding('text-embedding-3-small'),
				value: prompt
			})

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
					Buffer.from(new Float32Array(embedding).buffer),
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

			log('Semantic Cache Hit with similarity:', similarity.toFixed(4))

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
			const { embedding } = await retry(() =>
				embed({
					model: openai.embeddingModel('text-embedding-3-small'),
					value: prompt
				})
			)

			const result = await redis.hset(key, {
				prompt,
				response,
				embedding: Buffer.from(new Float32Array(embedding).buffer)
			})

			await redis.expire(key, 10_800)

			log('Semantic Cache Set for:', prompt)

			return result
		} catch {
			return
		}
	}
}
