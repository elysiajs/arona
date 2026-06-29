import cluster from 'cluster'
import { availableParallelism } from 'os'

import { isProduction, structure } from './libs'
import { app } from './server'

if (false && cluster.isPrimary) {
	const parallel = availableParallelism() - 1
	for (let i = 0; i < parallel; i++) cluster.fork()

	Bun.cron('0 */12 * * *', structure)

	cluster.on('exit', (worker) => {
		console.log(`Worker ${worker.process.pid} died, restarting...`)
		cluster.fork()
	})
} else {
	const t0 = performance.now()

	app.fetch

	console.log(`🦊 Fetch ready in ${(performance.now() - t0).toFixed(6)}ms`)

	const t1 = performance.now()

	app.listen({ hostname: '0.0.0.0', port: process.env.PORT ?? 3000 })

	console.log(
		`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
	)

	console.log(
		`⏱️  Server ready time: ${(performance.now() - t1).toFixed(6)}ms`
	)
}

export type { app } from './server'
