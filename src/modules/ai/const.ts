export const SQL = {
	findReference: `WITH q AS (
	  SELECT $1::vector AS embedding
	),
	ranked AS (
	  SELECT DISTINCT ON (d.file)
	    d.file,
		d.link,
	    d.title,
		d.sequence,
		d.summary,
	    (
	      ABS(
	        0.1 * (d.title_embedding <#> q.embedding) +
	        0.675  * (d.embedding <#> q.embedding) +
	        0.1 * (d.file_name_embedding <#> q.embedding) +
	        0.125  * d.weight * -1
	      )
	    ) AS score
	  FROM doc_chunks d, q
	  ORDER BY d.file, score DESC
	),
	filtered AS (
	  SELECT *
	  FROM ranked
	  WHERE score >= 0.4
	  ORDER BY score DESC
	  LIMIT $2
	),
	chunk AS (
	  SELECT
		f.file,
		f.link,
		f.title,
		dc.summary,
		dc.sequence,
		f.score as score
	  FROM filtered f
	  JOIN doc_chunks dc
		ON dc.file = f.file
		AND dc.sequence BETWEEN f.sequence AND f.sequence + 1
	  ORDER BY score, sequence
	)
	SELECT
	  c.link,
	  c.title,
	  string_agg(c.summary, E'\n') AS summary,
	  c.score
	FROM chunk c
	GROUP BY c.file, c.title, c.score, c.link
	ORDER BY c.score DESC;`
} as const
