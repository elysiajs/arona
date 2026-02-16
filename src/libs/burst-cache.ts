import { LRUCache } from 'lru-cache'

import { cyrb53 } from '@arona/modules/ai/libs'

export abstract class BurstCache<K, V> {
	config: {
		cache?: LRUCache.Options<number, V, unknown>
		pending?: LRUCache.Options<number, PromiseWithResolvers<V>, unknown>
	} = {}

	// Burst cache
	cache = new LRUCache<
		number,
		// @ts-ignore
		V
	>({
		max: 5000,
		ttl: 8 * 1000,
		...this.config.cache
	})

	private pendings = new LRUCache<number, PromiseWithResolvers<V>>({
		max: 5000,
		ttl: 30 * 1000,
		dispose(promise) {
			promise.reject()
		},
		...this.config.pending
	})

	abstract hash(key: K): number

	get = (key: K) => this.cache.get(this.hash(key))
	has = (key: K) => this.cache.has(this.hash(key))
	set = (key: K, value: V) => this.cache.set(this.hash(key), value)

	get pending() {
		return {
			get: (key: K) => this.pendings.get(this.hash(key))?.promise,
			has: (key: K) => this.pendings.has(this.hash(key)),
			block: (key: K) => {
				const resolvers = Promise.withResolvers<V>()

				this.pendings.set(this.hash(key), resolvers)

				return resolvers.promise
			},
			resolve: (key: K, value: V) => {
				const hash = this.hash(key)

				const promise = this.pendings.get(hash)
				if (!promise) return null

				promise.resolve(value)

				this.pendings.delete(this.hash(key))

				return
			},
			reject: (key: K) => {
				const hash = this.hash(key)

				const promise = this.pendings.get(hash)
				if (!promise) return null

				promise.resolve(undefined!)

				this.pendings.delete(this.hash(key))

				return
			}
		}
	}
}
