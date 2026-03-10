export const CONFIG = {
	POW_DIFFICULTY: 19,
	CHALLENGE_EXPIRY_MS: 15 * 60_000
} as const

export const secret = process.env.CHALLENGE_SECRET
// if (!secret)
// 	throw new Error('CHALLENGE_SECRET is not set in environment variables')
