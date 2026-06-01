import crypto from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Elysia } from 'elysia'
import forge from 'node-forge'
import jwt from 'jsonwebtoken'

import { getDetailByUsername } from '@/db/user.js'

const rsaKeysPath = './data/rsa-keys.json'

const loadOrCreateRsaKeyPair = () => {
    if (existsSync(rsaKeysPath)) {
        return JSON.parse(readFileSync(rsaKeysPath, 'utf8'))
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    const rsaKeys = { publicKeyPem: publicKey, privateKeyPem: privateKey }

    if (!existsSync('./data')) {
        mkdirSync('./data', { recursive: true })
    }
    writeFileSync(rsaKeysPath, JSON.stringify(rsaKeys))

    return rsaKeys
}

const { publicKeyPem, privateKeyPem } = loadOrCreateRsaKeyPair()
const forgePrivateKey = forge.pki.privateKeyFromPem(privateKeyPem)

const createAuthService = () => ({
    publicKeyPem,

    decryptPassword: (base64Cipher) => {
        return forgePrivateKey.decrypt(
            forge.util.decode64(base64Cipher),
            'RSAES-PKCS1-V1_5',
        )
    },

    findUserByCredentials: async (username, passwordPlain) => {
        const userRow = await getDetailByUsername(username)

        if (!userRow) {
            return null
        }

        const passwordValid = await Bun.password.verify(
            passwordPlain,
            userRow.passwordHash,
        )

        if (!passwordValid) {
            return null
        }

        return userRow
    },

    writeSessionCookies: (cookieJar, userId, username) => {
        applyCookie(
            cookieJar[ACCESS_COOKIE_NAME],
            signAccessToken({ sub: userId, username }),
            accessCookieOptions,
        )
        applyCookie(
            cookieJar[REFRESH_COOKIE_NAME],
            signRefreshToken({ sub: userId, username }),
            refreshCookieOptions,
        )
    },

    clearSessionCookies: (cookieJar) => {
        cookieJar[ACCESS_COOKIE_NAME].remove()
        cookieJar[REFRESH_COOKIE_NAME].remove()
    },
})

const ACCESS_COOKIE_NAME = 'access_token'
const REFRESH_COOKIE_NAME = 'refresh_token'

const FIVE_MINUTES_SECONDS = 5 * 60
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60

const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-this-secret'

const accessCookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: FIVE_MINUTES_SECONDS,
}

const refreshCookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TWENTY_FOUR_HOURS_SECONDS,
}

const signAccessToken = (payload) =>
    jwt.sign(payload, jwtSecret, { expiresIn: '5m' })

const signRefreshToken = (payload) =>
    jwt.sign({ ...payload, tokenType: 'refresh' }, jwtSecret, {
        expiresIn: '24h',
    })

const tryVerifyAccess = (token) => {
    try {
        const decoded = jwt.verify(token, jwtSecret)
        if (decoded.tokenType === 'refresh') return null
        return decoded
    } catch {
        return null
    }
}

const tryVerifyRefresh = (token) => {
    try {
        const decoded = jwt.verify(token, jwtSecret)
        if (decoded.tokenType !== 'refresh') return null
        return decoded
    } catch {
        return null
    }
}

const applyCookie = (cookieItem, tokenValue, options) => {
    cookieItem.set({ value: tokenValue, ...options })
}

const resolveSessionFromCookies = (cookieJar) => {
    const accessToken = cookieJar[ACCESS_COOKIE_NAME]?.value
    const fromAccess = accessToken ? tryVerifyAccess(accessToken) : null
    if (fromAccess) {
        return {
            authUser: {
                userId: fromAccess.sub,
                username: fromAccess.username,
            },
            authAccessReissued: false,
        }
    }

    const refreshToken = cookieJar[REFRESH_COOKIE_NAME]?.value
    const fromRefresh = refreshToken ? tryVerifyRefresh(refreshToken) : null
    if (!fromRefresh) return null

    applyCookie(
        cookieJar[ACCESS_COOKIE_NAME],
        signAccessToken({
            sub: fromRefresh.sub,
            username: fromRefresh.username,
        }),
        accessCookieOptions,
    )

    return {
        authUser: {
            userId: fromRefresh.sub,
            username: fromRefresh.username,
        },
        authAccessReissued: true,
    }
}

export const resolveCurrentUser = (cookieJar) => {
    const session = resolveSessionFromCookies(cookieJar)
    return session?.authUser ?? null
}

const publicRoutes = new Set([
    'GET /api/auth/public-key',
    'POST /api/auth/login',
    'POST /api/auth/logout',
    'POST /api/users',
])

export const authPlugin = new Elysia({ name: 'auth' })
    .decorate('auth', createAuthService())
    .derive({ as: 'global' }, ({ cookie }) => ({
        currentUser: resolveCurrentUser(cookie),
    }))
    .onBeforeHandle({ as: 'global' }, ({ currentUser, set, request }) => {
        const key = `${request.method} ${new URL(request.url).pathname}`
        if (publicRoutes.has(key)) return

        if (!currentUser) {
            set.status = 401
            return '未登录或会话已失效'
        }
    })
