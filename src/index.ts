const t1 = performance.now()

import cluster from 'cluster'
import { availableParallelism } from 'os'

import { isProduction, structure } from './libs'
import { app } from './server'

if (isProduction && cluster.isPrimary) {
	const parallel = availableParallelism() - 1
	for (let i = 0; i < parallel; i++) cluster.fork()

	Bun.cron('0 */12 * * *', structure)

	cluster.on('exit', (worker) => {
		console.log(`Worker ${worker.process.pid} died, restarting...`)
		cluster.fork()
	})
} else {
	const t3 = performance.now()

	app.listen({ hostname: '0.0.0.0', port: process.env.PORT ?? 3000 })

	const t2 = performance.now()

	console.log(
		`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
	)

	console.log(`⏱️  Startup time: ${(t2 - t1).toFixed(6)}ms`)
	console.log(`⏱️  Server ready time: ${(t3 - t1).toFixed(6)}ms`)
}

export type { app } from './server'
