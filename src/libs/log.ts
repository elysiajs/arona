import { createPinoLogger } from '@bogeychan/elysia-logger'

export const logger = createPinoLogger({
	level: 'info',
	timestamp: false,
	base: null
})
export const log = (...args: unknown[]) =>
	logger.info(args.join(' '))
