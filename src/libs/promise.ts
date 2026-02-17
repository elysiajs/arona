type MaybeFunction<T> = T | ((...a: any[]) => T)

export function raceFirstTruthy<T>(
	...promises: MaybeFunction<Promise<T>>[]
): Promise<Exclude<T, undefined> | null> {
	let resolved = false

	let pending = promises.length

	return new Promise((resolve) => {
		promises.forEach((promise) => {
			;(typeof promise === 'function' ? promise() : promise)
				.then((value) => {
					pending--

					if (!resolved && value != undefined && value !== null) {
						resolved = true

						resolve(value as any)
					}

					if (!pending) resolve(null)
				})
				.catch(() => {
					resolve(null)
				})
		})
	})
}
