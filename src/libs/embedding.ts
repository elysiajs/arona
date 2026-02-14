import { embed, pruneMessages } from 'ai'
import { LRUCache } from 'lru-cache'

import { openai } from './ai'
import { retry } from './retry'

const fillerPattern =
	/^(?:can you tell me|i would like to|would you kindly|i was wondering|just wondering|quick question|do you know|help me with|i want to|i need to|could you|would you|can you|tell me|show me|help me|please|hello|hey|hi|pls|plz|and|to my codebase|for my codebase)\s+/gi

export const stripFillers = (q: string) => {
	q = q.toLowerCase()

	while (fillerPattern.test(q)) q = q.replace(fillerPattern, '')

	return q.replace(/[()\[\]{}@#$%^&*!?.,:;&]/g, '').trim()
}

// Embedding is cheap and fast and maybe use multiple time in a single request,
// use volatile cache instead of Redis to avoid duplicate requests
//
// Use to store embedding cache only
// each embedding is 6144 bytes (1536 float32)
// 750 * 6144 / 1024 / 1024 = 4.394MB
//
// Storing more than 500 embeddings doesn't make sense in most cases
// tbf 500 is already quite large and doesn't make a lot of sense either
// but I'm doing a greedy choice here in case of ddos or something
const cache = new LRUCache<string, number[]>({
	max: 750,
	ttl: 9 * 60 * 60 * 1000 // 9 hour
})

const shouldNotCache = (prompt: string) =>
	prompt.length > 160 || prompt.includes('```')

interface GetEmbeddingOptions {
	ttl?: number // seconds
	skipFiller?: boolean
}

type EmbeddingModelV3Embedding = Awaited<ReturnType<typeof embed>>['embedding']
const pendingCache = new Map<string, Promise<EmbeddingModelV3Embedding>>()

export const getEmbedding = async (
	prompt: string,
	{ ttl = 32_400, skipFiller = false }: GetEmbeddingOptions = {}
) => {
	const shouldSkip = shouldNotCache(prompt)

	if (!skipFiller) prompt = stripFillers(prompt)

	if (!shouldSkip && cache.has(prompt)) return cache.get(prompt)!
	if (pendingCache.has(prompt)) return pendingCache.get(prompt)!

	const pending = retry(() =>
		embed({
			model: openai.embeddingModel('text-embedding-3-small'),
			value: prompt
		})
	).then((v) => v.embedding)

	pendingCache.set(prompt, pending)

	const embedding = await pending

	if (!shouldSkip)
		cache.set(prompt, embedding, {
			ttl: ttl * 1000
		})

	return embedding
}

export const getEmbeddingBuffer = async (
	prompt: string,
	options?: GetEmbeddingOptions
) =>
	getEmbedding(prompt, options).then((embedding) =>
		Buffer.from(new Float32Array(embedding).buffer)
	)
