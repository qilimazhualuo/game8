import { Elysia } from 'elysia'

import {
    createRoleBody,
    updateRoleBody,
    updateRoleRouteBody,
    updateUserRoleBody,
} from '@/db/validation.js'

export const roleRoutes = new Elysia({ name: 'role-routes' })
    .get('/', async ({ role, query }) =>
        role.listPaginated(
            Number(query.page) || 1,
            Number(query.pageSize) || 20,
            query.q || '',
        ),
    )
    .post(
        '/',
        async ({ role, body, set }) => {
            const existing = await role.getByName(body.name)
            if (existing) {
                set.status = 409
                return '角色名已存在'
            }

            return role.create({
                name: body.name,
                description: body.description ?? null,
            })
        },
        { body: createRoleBody },
    )
    .delete('/:roleId', async ({ role, params, set }) => {
        const existing = await role.getById(params.roleId)
        if (!existing) {
            set.status = 404
            return '角色不存在'
        }

        await role.remove(params.roleId)
    })
    .patch(
        '/:roleId',
        async ({ role, params, body, set }) => {
            const existing = await role.getById(params.roleId)
            if (!existing) {
                set.status = 404
                return '角色不存在'
            }

            const data = {}
            if (body.name !== undefined) data.name = body.name
            if (body.description !== undefined) data.description = body.description

            return role.update(params.roleId, data)
        },
        { body: updateRoleBody },
    )
    .get('/routes', ({ role }) => role.listRoutes())
    .put(
        '/routes',
        async ({ role, body, set }) => {
            const roleExists = await role.getById(body.roleId)
            if (!roleExists) {
                set.status = 404
                return '角色不存在'
            }

            if (body.granted) {
                const existing = await role.getRoute(body.roleId, body.route)
                if (!existing) {
                    await role.createRoute(body.roleId, body.route)
                }
            } else {
                await role.removeRoute(body.roleId, body.route)
            }

            return { ok: true }
        },
        { body: updateRoleRouteBody },
    )
    .patch(
        '/user/:userId/role',
        async ({ user, role, params, body, set }) => {
            const userRow = await user.getById(params.userId)
            if (!userRow) {
                set.status = 404
                return '用户不存在'
            }

            if (body.roleId !== undefined) {
                const roleRow = await role.getById(body.roleId)
                if (!roleRow) {
                    set.status = 404
                    return '角色不存在'
                }
            }

            return user.update(params.userId, { roleId: body.roleId ?? null })
        },
        { body: updateUserRoleBody },
    )
