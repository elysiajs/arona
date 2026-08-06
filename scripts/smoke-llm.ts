// ponytail: one-shot smoke check for the fetch-based LLM client, delete freely
import {
	getEmbeddings,
	generateText,
	streamText,
	smallModel
} from '../src/libs/ai'

const [embedding] = await getEmbeddings(['hello world'])
console.log('embeddings ok:', embedding.length === 1536)

const text = await generateText({
	model: smallModel,
	prompt: 'Reply with exactly the word: pong',
	maxOutputTokens: 512,
	reasoningEffort: 'minimal'
})
console.log('generateText ok:', JSON.stringify(text))

let toolCalled = false
let finish: unknown
let streamed = ''

const stream = streamText({
	model: smallModel,
	system: 'You are a test bot. Use the getSecret tool, then tell the user the secret word.',
	messages: [{ role: 'user', content: 'What is the secret word?' }],
	tools: {
		getSecret: {
			description: 'Get the secret word',
			parameters: { type: 'object', properties: {} },
			execute() {
				toolCalled = true
				return { secret: 'papaya' }
			}
		}
	},
	maxSteps: 3,
	maxOutputTokens: 512,
	onFinish(result) {
		finish = result
	}
})

for await (const delta of stream) streamed += delta

console.log('tool called:', toolCalled)
console.log('streamed:', JSON.stringify(streamed.slice(0, 200)))
console.log("usage:", JSON.stringify((finish as any)?.usage))

if (!toolCalled || !streamed.toLowerCase().includes('papaya'))
	throw new Error('smoke test failed')

console.log('smoke ok')
