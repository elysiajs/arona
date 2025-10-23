import { createPinoLogger } from '@bogeychan/elysia-logger'

export const logger = createPinoLogger({
	level: 'info',
	timestamp: false,
	base: null
})
export const log = (...args: string[]) => logger.info(args.join(' '))
