import { Elysia } from 'elysia'

import { loginBody } from '@/db/validation.js'
export const authRoutes = new Elysia({ name: 'auth-routes' })
    .get('/public-key', ({ auth }) => ({ publicKeyPem: auth.publicKeyPem }))
    .post(
        '/login',
        async ({ auth, body, cookie, set }) => {
            let passwordPlain
            try {
                passwordPlain = auth.decryptPassword(body.encryptedPassword)
            } catch {
                set.status = 400
                return '密码解密失败'
            }

            const normalizedUsername = body.username.trim()
            const userRow = await auth.findUserByCredentials(
                normalizedUsername,
                passwordPlain,
            )

            if (!userRow) {
                set.status = 401
                return '账号或密码错误'
            }

            auth.writeSessionCookies(cookie, userRow.id, userRow.username)
            return userRow
        },
        { body: loginBody },
    )
    .post('/logout', ({ auth, cookie }) => {
        auth.clearSessionCookies(cookie)
    })
    .get('/me', async ({ currentUser, user: userSvc, role: roleSvc, set }) => {
        const row = await userSvc.getById(currentUser.userId)
        if (!row) {
            set.status = 401
            return '未登录或会话已失效'
        }

        let roleName = null
        let routes = []
        if (row.roleId) {
            const roleRow = await roleSvc.getById(row.roleId)
            roleName = roleRow?.name ?? null
            const routeRows = roleSvc.getRoutesByRoleId(row.roleId)
            routes = routeRows.map((r) => r.route)
        }

        return { ...row, roleName, routes }
    })
    .model({ loginBody })
