export const isDev =
	!process.env.NODE_ENV || process.env.NODE_ENV === 'development'
export const isProduction = process.env.NODE_ENV === 'production'

export const API_KEY = process.env['API_KEY'] ?? 'Blue Archive'
