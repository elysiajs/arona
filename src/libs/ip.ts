import { Elysia } from 'elysia'

export const ip = new Elysia({ name: 'libs/ip' }).macro('ip', {
	resolve: function getIP({ headers, server, request }) {
		return {
			ip:
				headers['cf-connecting-ip'] ||
				(server?.requestIP(request)?.address as string)
		}
	}
})
