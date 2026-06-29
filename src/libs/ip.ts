import { Elysia } from 'elysia'

export const ipMacro = new Elysia({ name: 'libs/ip' }).macro({ ip: {
	derive: function getIP({ headers, server, request }) {
		return {
			ip:
				headers['cf-connecting-ip'] ||
				headers['x-real-ip'] ||
				(server?.requestIP(request)?.address as string)
		}
	}
} })
