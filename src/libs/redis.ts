import { Redis } from 'ioredis'

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) throw new Error('REDIS_URL is not defined')

export const redis = new Redis(REDIS_URL)

redis
	.connect()
	.then((x) => {
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
			.catch(() => {})
	})
	.catch(() => {})
