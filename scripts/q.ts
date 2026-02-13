import { SemanticCache } from '@arona/modules/ai/libs'

await SemanticCache.set('Hono compare to Elysia', 'backend api for thing?').then(
	console.log
)
await SemanticCache.get('How\'s Elysia compare Hono').then(console.log)
