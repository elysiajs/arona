import { record } from '@elysiajs/opentelemetry'

import { SQL } from 'bun'
import { rmdir } from 'fs/promises'

import { OpenAI } from 'openai'
import Queue from 'p-queue'

import { sql } from './database'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

const dbRoot = url.slice(0, url.indexOf('/', 12))
const dbName = url.slice(url.indexOf('/', 12) + 1)

const titleWeight = {
	essential: 1,
	blog: 0.8,
	eden: 0.7,
	unknown: 0.5,
	migrate: 0.4,
	integration: 0.35,
	tutorial: 0.3
} as const

export const structure = () =>
	record('index', async () => {
		const rootSQL = new SQL(dbRoot)
		await sql`CREATE DATABASE ${sql(dbName)};`.catch(() => {})
		console.log(`Created Database "${dbName}"`)
		await rootSQL.close()

		await sql`CREATE EXTENSION IF NOT EXISTS vector;`
		// await sql`DROP TABLE IF EXISTS doc_chunks;`
		await sql`CREATE TABLE IF NOT EXISTS doc_chunks (
		link VARCHAR(255) PRIMARY KEY,
	   	file VARCHAR(255) NOT NULL,
		file_name VARCHAR(255) GENERATED ALWAYS AS (
		  regexp_replace(file, '.*/|\\.[^.]+$', '', 'g')
		) STORED,
	    title VARCHAR(255) NOT NULL,
	  	content TEXT NOT NULL,
		weight FLOAT NOT NULL DEFAULT 0.5,
	  	embedding VECTOR(1536) NOT NULL,
		title_embedding VECTOR(1536) NOT NULL,
		file_name_embedding VECTOR(1536) NOT NULL
	);`
		await sql`CREATE INDEX doc_chunks_file_idx ON doc_chunks (file);`.catch(
			() => {}
		)
		// await sql`CREATE INDEX ON doc_chunks USING ivfflat (embedding vector_l2_ops) WITH (lists = 100);`.catch(
		// 	() => {}
		// )
		// await sql`SET ivfflat.probes = 10`.catch(() => {})

		console.log('Database structure setup completed')

		if (process.env.NODE_ENV === 'production')
			rmdir('docs', { recursive: true }).catch(() => {})

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
				markdown.includes('/cheat-sheet.md') ||
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

		const queue = new Queue({
			concurrency: 4,
			interval: 1000,
			intervalCap: 20
		})
		const _chunk: Chunk[] = []
		let size = 0

		const createEmbedding = (id: number, chunk: Chunk[]) => async () => {
			if (!chunk.length) return

			totalOps++

			const currentFiles = await sql.unsafe<Chunk[]>(
				`SELECT file, content FROM doc_chunks WHERE file IN (${chunk.map((c) => `'${c.file}'`).join(', ')})`
			)

			function format(x: string) {
				const sep = x.indexOf('\n')
				const title =
					sep === -1
						? x
						: x.slice(0, sep).replace(/#/g, '').trimStart()

				return {
					title,
					content: x
				}
			}

			const headerToLink = (file: string, title: string) =>
				file.replace('docs/', '').replace('.md', '') +
				'#' +
				title
					.replace(/[^a-zA-Z -]/g, '')
					.split('-')
					.filter((x) => x.trim())
					.join('-')
					.replace(/ /g, '-')
					.toLowerCase()
					.trim()

			const notTag = (title: string) =>
				!title.startsWith('<') && !title.endsWith('>')

			const index = (z: Chunk[]) =>
				z
					.flatMap((x) =>
						x.content
							.split('\n## ')
							.map(format)
							.filter((x) => notTag(x.title))
							.map((c) => ({
								...x,
								...c,
								link: headerToLink(x.file, c.title)
							}))
					)
					//remove duplicate link
					.filter(
						(x, i, a) => a.findIndex((y) => y.link === x.link) === i
					)

			const newChapters = index(chunk).filter(
				(x) =>
					!x.file.includes('tutorial/') ||
					(x.file.includes('tutorial/') &&
						!x.title.includes('#assignment'))
			)

			const currentChapters = index(currentFiles)

			const chapters: typeof newChapters = []
			const toRemove: typeof currentChapters = []

			for (const newChapter of newChapters) {
				const existIndex = currentChapters.findIndex(
					(c) => c.link === newChapter.link
				)

				if (existIndex === -1) chapters.push(newChapter)
				else if (
					true
					// currentChapters[existIndex].content !== newChapter.content
				)
					chapters.push(newChapter)
			}

			for (const currentChapter of currentChapters) {
				const existIndex = newChapters.findIndex(
					(c) => c.title === currentChapter.title
				)

				if (existIndex === -1) toRemove.push(currentChapter)
			}

			if (!chapters.length && !toRemove.length) return

			if (chapters.length) {
				console.log(
					'update',
					chapters.map((a) => a.link)
				)

				const embedding = await openai.embeddings.create({
					model: 'text-embedding-3-small',
					input: [
						...chapters.map((c) => c.content),
						...chapters.map((c) => {
							const subTitle = c.file.split('/')[1]

							return `${subTitle} ${c.title}`
						}),
						...chapters.map((c) =>
							c.file.slice(c.file.lastIndexOf('/') + 1, -3)
						)
					]
				})

				if (embedding) {
					const values = <unknown[]>[]
					let sqlValues = ''
					const groups = embedding.data.length / 3

					function makeSqlValues(i: number, count: number): string {
						const start = i * count + 1
						const placeholders = Array.from(
							{ length: count },
							(_, j) => `$${start + j}`
						)
						return `(${placeholders.join(', ')})`
					}

					for (let i = 0; i < groups; i++) {
						if (i) sqlValues += ', '

						const embed = embedding.data[i].embedding
						const titleEmbed = embedding.data[i + groups].embedding
						const fileEmbed =
							embedding.data[i + groups * 2].embedding

						const { title, link, content, file } = chapters[i]
						const subTitle = file.split('/')[1] || 'unknown'

						sqlValues += makeSqlValues(i, 8)
						values.push(
							link,
							file,
							title,
							content,
							titleWeight[subTitle as keyof typeof titleWeight] ||
								titleWeight.unknown,
							`[${embed.join(',')}]`,
							`[${titleEmbed.join(',')}]`,
							`[${fileEmbed.join(',')}]`
						)
					}

					if (!values.length) return

					const query = `INSERT INTO doc_chunks (link, file, title, content, weight, embedding, title_embedding, file_name_embedding)
					VALUES ${sqlValues}
					ON CONFLICT (link)
					DO UPDATE SET
					   	content = EXCLUDED.content,
					   	embedding = EXCLUDED.embedding,
						weight = EXCLUDED.weight,
						title_embedding = EXCLUDED.title_embedding,
						file_name_embedding = EXCLUDED.file_name_embedding
						;`

					await sql.unsafe(query, values)
				} else {
					console.error(
						'Failed to create embeddings for batch',
						chapters.map((a) => a.link).join(',')
					)
				}
			}

			if (toRemove.length) {
				console.log(
					'remove',
					toRemove.map((a) => a.link)
				)

				const query = `DELETE FROM doc_chunks WHERE link IN (${toRemove
					.map((c) => `'${c.link}'`)
					.join(', ')});`

				await sql.unsafe(query).catch(() => {
					console.log('Failed to remove', query)
				})
			}
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

		if (process.env.NODE_ENV === 'production')
			rmdir('docs', { recursive: true })
	})
