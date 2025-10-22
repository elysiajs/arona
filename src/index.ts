import cluster from 'cluster'
import { availableParallelism } from 'os'

import { Elysia, NotFoundError, t } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import { cors } from '@elysiajs/cors'
import { cron } from '@elysiajs/cron'

import { ai } from './modules'
import { isDev, pow, structure } from './libs'

export const app = new Elysia({
	cookie: {
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		secrets: process.env.CHALLENGE_SECRET
	}
})
	.use(
		openapi({
			enabled: process.env.NODE_ENV !== 'production',
			references: fromTypes()
		})
	)
	.use(
		cors({
			origin: ['http://localhost:5173', 'https://elysiajs.com']
		})
	)
	.use(pow)
	.get('/', 'arona')
	.get('/heath', 'ok')
	.use(ai)

if (!isDev && cluster.isPrimary) {
	const parallel = availableParallelism() / 2
	for (let i = 0; i < parallel; i++) cluster.fork()

	cluster.on('exit', (worker) => {
		console.log(`Worker ${worker.process.pid} died, restarting...`)
		cluster.fork()
	})

	new Elysia().use(
		cron({
			name: 'Reindex Database',
			pattern: '0 */12 * * *',
			run: structure
		})
	)
} else {
	app.listen({
		port: process.env.PORT ?? 3000,
		host: '0.0.0.0'
	})

	console.log(
		`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
	)
}
