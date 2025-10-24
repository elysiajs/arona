export const isDev =
	!process.env.NODE_ENV || process.env.NODE_ENV === 'development'

export const API_KEY = process.env['API_KEY'] ?? 'Blue Archive'
