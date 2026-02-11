import { Elysia, file } from 'elysia'
import { openapi, fromTypes } from '@elysiajs/openapi'
import { cors } from '@elysiajs/cors'

import { opentelemetry } from '@elysiajs/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'

import { ai, pow } from './modules'
import { isDev, isProduction } from './libs'

export const app = new Elysia({
	cookie: {
		httpOnly: true,
		sameSite: 'strict',
		secure: isProduction,
		secrets: process.env.CHALLENGE_SECRET,
		sign: isProduction ? 'challenge' : undefined
	}
})
	.use(
		openapi({
			enabled: isDev,
			references: fromTypes('src/server.ts')
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
	.get('/', file('public/arona.webp'))
	.get('/heath', 'ok')
	.use(ai)
	.use(pow)
