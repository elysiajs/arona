export const SQL = Object.freeze({
	findReference: `WITH q AS (SELECT $1::vector AS embedding)
	SELECT
	d.link,
	d.title,
	d.content,
	(
	ABS(
	 (
	   (
	     0.1125 * (d.title_embedding <#> q.embedding) +
	     0.625 * (d.embedding <#> q.embedding) +
	     0.0875 * (d.file_name_embedding <#> q.embedding) +
	     0.175 * d.weight * - 1
	   )
	 )
	)
	) AS score
	FROM doc_chunks as d, q
	ORDER BY score DESC
	LIMIT 12;`
} as const)

export interface Reference {
	link: string
	title: string
	content: string
	score: number
}
