import { createPinoLogger } from '@bogeychan/elysia-logger'

export const logger = createPinoLogger({
	level: 'info',
	timestamp: false,
	base: null
})

export function log(...args: unknown[]) {
	if (args.length === 1 && args && typeof args[0] === 'object')
		logger.info(JSON.stringify(args[0]))
	else logger.info(args.join(' '))
}
