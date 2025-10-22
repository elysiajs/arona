import { Elysia } from 'elysia'

export const ip = new Elysia({ name: 'libs/ip' }).macro('ip', {
	resolve: async ({ headers, server, request }) => ({
		ip:
			headers['cf-connecting-ip'] ||
			(await server?.requestIP(request)?.address as string)
	})
})
