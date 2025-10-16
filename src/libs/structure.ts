import { SQL } from 'bun'
import { rmdir } from 'fs/promises'

import { OpenAI } from 'openai'
import Queue from 'p-queue'

import { sql } from './database'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const dbRoot = url.slice(0, url.indexOf('/', 12))
const dbName = url.slice(url.indexOf('/', 12) + 1)

export const structure = async () => {
	const rootSQL = new SQL(dbRoot)
	await sql`CREATE DATABASE ${sql(dbName)};`.catch(() => {})
	console.log(`Created Database "${dbName}"`)
	await rootSQL.close()

	await sql`CREATE EXTENSION IF NOT EXISTS vector;`
	// await sql`DROP TABLE IF EXISTS doc_chunks;`
	await sql`CREATE TABLE IF NOT EXISTS doc_chunks (
	   	file VARCHAR(255) PRIMARY KEY,
	    title VARCHAR(255) NOT NULL,
	  	content TEXT NOT NULL,
	  	embedding VECTOR(1536)
	);`
	await sql`CREATE INDEX ON doc_chunks USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);`.catch(
		() => {}
	)
	await sql`SET ivfflat.probes = 10`.catch(() => {})

	console.log('Database structure setup completed')

	await Bun.$`git clone --depth 1 --single-branch --branch main https://github.com/elysiajs/documentation docs`.catch(
		() => {}
	)

	interface Chunk {
		file: string
		title: string
		content: string
	}

	const markdownsGlob = new Bun.Glob('docs/**/*.md')
	const ops = <Promise<Chunk>[]>[]

	for await (const markdown of markdownsGlob.scan('./docs')) {
		if (
			markdown === 'docs/index.md' ||
			markdown.includes('/playground') ||
			markdown.includes('/docs/migrate/index.md') ||
			(markdown.includes('/blog') &&
				!markdown.includes('/blog/openapi-type-gen'))
		)
			continue

		ops.push(
			new Promise(async (resolve) => {
				const file = `docs/${markdown}`
				const content = await Bun.file(file).text()
				const title =
					content
						.match(/title: (.*)/g)?.[0]
						?.replace('title: ', '') ||
					markdown.slice(markdown.lastIndexOf('/'))

				resolve({
					title,
					file: markdown,
					content: content
						.slice(content.indexOf('---', 3) + 3)
						.replace(/<script setup(.*)<\/script>/gs, '')
						.replace(/<Playground[^>]*?\/>/gs, '')
						.trim()
				})
			})
		)
	}

	const markdowns = await Promise.all(ops)

	const apiKey = process.env.OPENAI_API_KEY
	if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

	const openai = new OpenAI({
		apiKey
	})

	const queue = new Queue({ concurrency: 4, interval: 1000, intervalCap: 20 })
	const _chunk: Chunk[] = []
	let size = 0

	const createEmbedding = (id: number, chunk: Chunk[]) => async () => {
		if (!chunk.length) return

		totalOps++

		const currentDatas = await sql.unsafe(
			`SELECT file, content FROM doc_chunks WHERE file IN (${chunk.map((c) => `'${c.file}'`).join(', ')})`
		)

		for (const data of currentDatas) {
			const index = chunk.findIndex((c) => c.file === data.file)
			if (index !== -1 && chunk[index].content === data.content)
				chunk.splice(index, 1)
		}

		if (!chunk.length) return

		console.log(chunk.map((a) => a.file).join(','), 'need to update')

		const embedding = await openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: chunk.map((c) => c.content)
		})

		if (!embedding) throw new Error('Failed to get embeddings')

		const values = <unknown[]>[]
		let sqlValues = ''
		for (let i = 0; i < chunk.length; i++) {
			if (i) sqlValues += ', '

			const embed = embedding.data[i].embedding
			const { file, title, content } = chunk[i]

			sqlValues += `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
			values.push(file, title, content, `[${embed.join(',')}]`)
		}

		if (!values.length) return

		const query = `INSERT INTO doc_chunks (file, title, content, embedding)
		VALUES ${sqlValues}
		ON CONFLICT (file)
		DO UPDATE SET
		   	content = EXCLUDED.content,
		   	embedding = EXCLUDED.embedding;`

		await sql.unsafe(query, values)
	}

	let totalOps = 0
	for (const { file, title, content } of markdowns) {
		if (size + content.length < 8000) {
			_chunk.push({ file, title, content })
			size += content.length
			continue
		}

		queue.add(createEmbedding(totalOps, [..._chunk]))
		totalOps++
		_chunk.length = 0
		size = 0

		_chunk.push({ file, title, content })
		size += content.length
	}

	queue.add(createEmbedding(totalOps, [..._chunk]))
	_chunk.length = 0
	size = 0

	console.log('Total', queue.size, 'batches to process')

	await queue.onEmpty()

	console.log('Data insertion completed')

	rmdir('docs', { recursive: true })
}
