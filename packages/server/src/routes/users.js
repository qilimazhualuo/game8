import { eq } from 'drizzle-orm'
import { Elysia } from 'elysia'

import { db } from '@/db/index.js'
import { chatMembers, chats } from '@/db/schema.js'
import {
    createUserBody,
    updateUserBody,
    userIdParams,
} from '@/db/validation.js'

export const userRoutes = new Elysia({ name: 'user-routes' })
    .get('/', async ({ user, query }) =>
        user.listPaginated(
            Number(query.page) || 1,
            Number(query.pageSize) || 20,
            query.q || '',
        ),
    )
    .get(
        '/:userId',
        async ({ user, params, set }) => {
            const row = await user.getById(params.userId)
            if (!row) {
                set.status = 404
                return '用户不存在'
            }
            return row
        },
        { params: userIdParams },
    )
    .post(
        '/',
        async ({ user, body, set }) => {
            const normalizedUsername = body.username.trim()

            const existing = await user.getByUsername(normalizedUsername)
            if (existing) {
                set.status = 409
                return '用户名已存在'
            }

            const newUser = await user.create({
                username: normalizedUsername,
                passwordHash: await user.hashPassword(body.password),
                nickname: body.nickname ?? null,
                avatar: body.avatar ?? null,
            })

            const lobby = db.select({ id: chats.id }).from(chats).where(eq(chats.name, '游戏大厅')).get()
            if (lobby && newUser) {
                db.insert(chatMembers).values({
                    id: crypto.randomUUID(),
                    chatId: lobby.id,
                    userId: newUser.id,
                }).run()
            }

            return newUser
        },
        { body: createUserBody },
    )
    .patch(
        '/:userId',
        async ({ user, params, body, set }) => {
            const existing = await user.getById(params.userId)
            if (!existing) {
                set.status = 404
                return '用户不存在'
            }

            const patch = {}
            if (body.username !== undefined) {
                patch.username = body.username.trim()
            }
            if (body.password !== undefined) {
                patch.passwordHash = await user.hashPassword(body.password)
            }

            if (Object.keys(patch).length === 0) {
                return existing
            }

            try {
                return await user.update(params.userId, patch)
            } catch {
                set.status = 409
                return '用户名已存在'
            }
        },
        { params: userIdParams, body: updateUserBody },
    )
    .delete(
        '/:userId',
        async ({ user, params, currentUser, set }) => {
            if (currentUser.userId === params.userId) {
                set.status = 400
                return '不能删除当前登录用户'
            }

            const existing = await user.getDetail(params.userId)
            if (!existing) {
                set.status = 404
                return '用户不存在'
            }

            if (existing.username === 'admin') {
                set.status = 400
                return '不能删除系统管理员'
            }

            await user.remove(params.userId)
        },
        { params: userIdParams },
    )
    .model({
        userIdParams,
        createUserBody,
        updateUserBody,
    })
