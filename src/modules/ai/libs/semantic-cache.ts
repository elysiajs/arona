import { record } from '@elysia/opentelemetry'
import { LRUCache } from 'lru-cache'

import {
	generateText,
	getEmbeddingBuffer,
	log,
	smallModel,
	redis,
	stripFillers,
	retry
} from '@arona/libs'
import { cyrb53 } from './utils'

const shouldNotCache = (prompt: string) =>
	prompt.length > 72 || !isNaN(+prompt) || prompt.includes('```')

const normalizePromptInstruction = `Reduce the user query to its canonical search intent. Output ONLY the normalized form. No explanation.
- Remove all filler words, pleasantries
- Reduce to core topic + action
- Use consistent terminology
- Use only meaningful words
- Do not remove word "Elysia"
- Keep it under 12 words`

export abstract class SemanticCache {
	// burst cache
	static normalizeCache = new LRUCache<string, string>({
		max: 3750,
		ttl: 3 * 60
	})

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
					'score',
					'response'
				)
				.catch(() => null)

			if (!response || response.length < 3) return null

			let [, , [, stringifiedScore, , cached]] = response

			let score = parseFloat(stringifiedScore)

			// score and cached are swapped somehow?
			if (isNaN(score)) {
				score = parseFloat(cached)
				cached = stringifiedScore
			}

			// Something went wrong, skip the thing
			if (isNaN(score)) return null

			const similarity = 1 - score

			if (similarity < 0.9) return null

			log(
				`Semantic Cache Hit with similarity: ${similarity.toFixed(4)} for: "${prompt}"`
			)

			return cached
		} catch (error) {
			log(error)

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

			await redis.expire(key, 14_400)

			log('Semantic Cache Set for:', prompt)

			return result
		} catch {
			return
		}
	}

	static async normalize(prompt: string, ip?: string) {
		if (
			prompt.length < 12 ||
			prompt.length > 192 ||
			!isNaN(+prompt) ||
			prompt.includes('```') ||
			!prompt.includes(' ')
		)
			return

		if (this.normalizeCache.has(prompt))
			return this.normalizeCache.get(prompt)!

		return record(`SemanticCache.normalize: ${prompt}`, async (span) => {
			try {
				let text = await retry(
					() =>
						generateText({
							model: smallModel,
							system: normalizePromptInstruction,
							prompt,
							temperature: 0,
							topP: 1,
							maxOutputTokens: 192,
							user: ip,
							reasoningEffort: 'minimal'
						}),
					3,
					500
				)

				this.normalizeCache.set(prompt, (text = text.trim()))
				span.setAttribute('normalized', text)

				return text
			} catch (error) {
				log(error)

				return
			}
		})
	}
}
