import cluster from 'cluster'
import { availableParallelism } from 'os'

import { Elysia, t, file } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import { cors } from '@elysiajs/cors'
import { cron } from '@elysiajs/cron'

import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

import { ai } from './modules'
import { isDev, pow, structure } from './libs'

export const app = new Elysia({
	cookie: {
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		secrets: process.env.CHALLENGE_SECRET,
		// sign: ['challenge']
	}
})
	.use(
		openapi({
			enabled: process.env.NODE_ENV !== 'production',
			references: fromTypes()
		})
	)
	.use(
		opentelemetry({
			spanProcessors: [
				new BatchSpanProcessor(
					new OTLPTraceExporter({
						url: 'https://api.axiom.co/v1/traces',
						headers: {
							Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
							'X-Axiom-Dataset': process.env.AXIOM_DATASET!
						}
					})
				)
			]
		})
	)
	.use(
		cors({
			origin: ['http://localhost:5173', 'https://elysiajs.com']
		})
	)
	.use(pow)
	.get('/', file('public/arona.webp'))
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
	app.listen(process.env.PORT ?? 3000)

	console.log(
		`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
	)
}
