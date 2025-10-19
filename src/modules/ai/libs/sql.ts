export const findReference = `WITH q AS (SELECT $1::vector AS embedding)
SELECT
d.link,
d.file,
d.title,
d.content,
(
ABS(
 (
   (
     0.125 * (d.title_embedding <#> q.embedding) +
     0.6 * (d.embedding       <#> q.embedding) +
     0.1 * (d.file_name_embedding  <#> q.embedding) +
     0.175 * d.weight * - 1
   )
 )
)
) AS score
FROM doc_chunks as d, q
ORDER BY score DESC
LIMIT 15;`

export interface DocFile {
	title: string
	content: string
}

export interface Reference {
	link: string
	file: string
	title: string
	content: string
	score: number
}
