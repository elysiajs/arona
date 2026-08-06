import { aot } from 'elysia/plugin/aot/bun'

Bun.build({
	entrypoints: ['src/index.ts'],
	outdir: 'dist',
	target: 'bun',
	//compile: true,
//	minify: true,
	// minify: {
	// 	whitespace: true,
	// 	syntax: true,
	// 	identifiers: false,
	// 	keepNames: true
	// },
	plugins: [aot('src/server.ts', { verbose: true })]
}).then(() => {
	process.exit(0)
})
