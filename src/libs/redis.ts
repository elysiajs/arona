import { RedisClient } from 'bun'

const REDIS_URL = process.env.REDIS_URL
if (!REDIS_URL) throw new Error('REDIS_URL is not defined')

export const redis = new RedisClient(REDIS_URL)
