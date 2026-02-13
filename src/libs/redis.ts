import { Redis } from 'ioredis'
import { log } from './log'

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) throw new Error('REDIS_URL is not defined')

export const redis = new Redis(REDIS_URL)

redis.once('connect', () => {
	redis
		.call(
			'FT.CREATE',
			'idx:cache',
			'ON',
			'HASH',
			'PREFIX',
			'1',
			'cache:',
			'SCHEMA',
			'embedding',
			'VECTOR',
			'HNSW',
			'6',
			'TYPE',
			'FLOAT32',
			'DIM',
			'1536',
			'DISTANCE_METRIC',
			'COSINE',
			'response',
			'TEXT'
		)
		.then(() => {
			log('Redis FT.CREATE index created')
		})
		.catch((error) => {
			if (error.message.includes('Index already exists')) return

			log('Redis FT.CREATE error occurred.', error)
		})
})

redis.connect().catch(() => {})
