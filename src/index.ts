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
	app.listen({
		hostname: '0.0.0.0',
		port: process.env.PORT ?? 3000,
		idleTimeout: 255
	})

	console.log(
		`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
	)
}

export type { app } from './server'
