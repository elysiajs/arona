export const SQL = Object.freeze({
	findReference: `WITH q AS (
	  SELECT $1::vector AS embedding
	),
	ranked AS (
	  SELECT DISTINCT ON (d.file)
	    d.file,
	    d.title,
		d.sequence,
	    (
	      ABS(
	        0.1125 * (d.title_embedding <#> q.embedding) +
	        0.625  * (d.embedding <#> q.embedding) +
	        0.0875 * (d.file_name_embedding <#> q.embedding) +
	        0.175  * d.weight * -1
	      )
	    ) AS score
	  FROM doc_chunks d, q
	  ORDER BY d.file, score DESC
	),
	top_file AS (
	  SELECT *
	  FROM ranked
	  WHERE SCORE > 0.375
	  ORDER BY score DESC, sequence ASC
	  LIMIT 2
	)
	SELECT
	  tf.file,
	  tf.title,
	  string_agg(dc.content, E'\n') AS content,
	  tf.score
	FROM top_file tf
	JOIN doc_chunks dc USING (file)
	GROUP BY tf.file, tf.title, tf.score
	ORDER BY tf.score DESC;`
} as const)

export interface Reference {
	link: string
	title: string
	content: string
	score: number
}
