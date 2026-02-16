import { LRUCache } from 'lru-cache'

export abstract class BurstCache<K, V> {
	// Burst cache
	cache: LRUCache<
		number,
		// @ts-ignore
		V
	>

	constructor(
		private config: {
			cache?: Partial<LRUCache.Options<number, V, unknown>>
		} = {
			cache: {}
		}
	) {
		this.cache = new LRUCache<
			number,
			// @ts-ignore
			V
		>({
			max: 5000,
			ttl: 8 * 1000,
			...this.config.cache
		})
	}

	abstract hash(key: K): number

	get = (key: K) => this.cache.get(this.hash(key))
	has = (key: K) => this.cache.has(this.hash(key))
	set = (key: K, value: V) => this.cache.set(this.hash(key), value)
}
