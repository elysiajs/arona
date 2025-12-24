import { record } from '@elysiajs/opentelemetry'

import {
	type ModelMessage,
	stepCountIs,
	streamText,
	type StreamTextOnFinishCallback,
	tool
} from 'ai'
import * as z from 'zod'

import { retry, redis, log, cache, model, instruction } from '@arona/libs'

import { Models } from './models'
import { compressHistory, normalizePage, search, readPage } from './utils'
import type { Reference } from './const'

export const createSearchTool = (references: Reference[]) =>
	tool({
		name: 'search',
		description:
			'Find relevant information from Elysia documentation. This tool is pure (deterministic), do not call them twice with the same parameters.',
		inputSchema: z.object({
			sentence: z.string().meta({
				description:
					'The keyword/sentence to search in the documentation',
				examples: ['handler', 'OpenAPI type gen', 'Eden Treaty']
			})
		}),
		outputSchema: Models.references,
		async execute({ sentence }) {
			log('Search:', sentence)

			let documents = await retry(
				() => cache(`search:${sentence}`, () => search(sentence)),
				5
			)
			if (!documents) return null

			// Intentionally no await
			redis.set(
				`search:${sentence}`,
				JSON.stringify(documents),
				'EX',
				3600
			)

			references.push(...documents)

			return documents
		}
	})

export const createPageTool = (references: Reference[]) =>
	tool({
		name: 'read_page',
		description:
			'Read a specific page with in-depth detail. This tool is pure (deterministic), do not call them twice with the same parameters.',
		inputSchema: z.object({
			link: z.string().meta({
				description:
					'The link of the page to read from Elysia documentation. Must not end with ".md"',
				examples: [
					'essential/handler',
					'essential/life-cycle#transform'
				]
			})
		}),
		outputSchema: Models.references,
		async execute({ link }) {
			link = normalizePage(link)

			log('Read:', link)

			const documents = await retry(
				() => cache(`page:${link}`, () => readPage(link)),
				5
			)
			if (!documents) return null

			if (Array.isArray(documents)) references.push(...documents)
			else references.push(documents)

			return documents
		}
	})

interface AskParams {
	abortSignal: AbortSignal
	seed?: number
	message: string
	history: Models.ask['history']
	references: Reference[]
	ip: string
	onFinish?: StreamTextOnFinishCallback<{}>
	think?: boolean
}

export async function ask({
	abortSignal,
	seed,
	message,
	history,
	references,
	ip,
	onFinish,
	think
}: AskParams) {
	const searchTool = createSearchTool(references)
	const readPageTool = createPageTool(references)

	const stream = await retry(
		() =>
			record(
				'Gather Resources',
				() =>
					new Promise<AsyncGenerator<string, any, any>>(
						async (resolve, reject) => {
							const response = streamText({
								model,
								abortSignal,
								tools: {
									readPage: readPageTool,
									search: searchTool
								},
								stopWhen: stepCountIs(8),
								seed,
								messages: [
									{
										role: 'system',
										content: references.length
											? `${instruction}\nPage Data:\n${references
													.map(
														(x) =>
															`# ${x.title}\n${x.content}`
													)
													.join('\n')}`
											: instruction
									},
									...compressHistory(history),
									{
										role: 'user',
										content: history?.length
											? message
											: `Hi Elysia chan! ${message}. Would you kindly help me?`
									}
								],
								providerOptions: {
									groq: {
										reasoningFormat: 'hidden',
										reasoningEffort: think
											? 'medium'
											: 'low',
										user: ip,
										serviceTier: 'auto'
									},
									cerebras: {
										reasoning_effort: think
											? 'high'
											: 'medium'
									}
								},
								onFinish(metadata) {
									onFinish?.(metadata as any)

									log(`question: ${message}`)
									log(`sources: ${references.length}`)
									log(
										`input tokens: ${metadata.usage.inputTokens}`
									)
									log(
										`cached input tokens: ${metadata.usage.inputTokenDetails.cacheReadTokens}`
									)
									log(
										`output tokens: ${metadata.usage.outputTokens}`
									)
									log(
										`reasoning tokens: ${metadata.usage.outputTokenDetails.reasoningTokens ?? 0}`
									)
									log(
										`total tokens: ${metadata.usage.totalTokens}`
									)
								}
							})

							for await (const content of response.textStream)
								if (content.trim())
									resolve(response.textStream as any)

							reject('Retry')
						}
					)
			),
		3,
		0
	)

	return stream
}

export const createMessages = (
	message: string,
	references: Reference[],
	history: Models.ask['history']
) =>
	[
		{
			role: 'system',
			content: references.length
				? `${instruction}\nPage Data:\n${references
						.map((x) => `# ${x.title}\n${x.content}`)
						.join('\n')}`
				: instruction
		},
		...compressHistory(history),
		{
			role: 'user',
			content: history?.length
				? message
				: `Hi Elysia chan! ${message}. Would you kindly help me?`
		}
	] as ModelMessage[]
