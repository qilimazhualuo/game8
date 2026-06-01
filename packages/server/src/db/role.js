import { and, count, eq, like } from 'drizzle-orm'

import { db } from '@/db/index.js'
import { roleRoutes, roles } from '@/db/schema.js'
import { fmtDate } from '@/fmt.js'

const fmtRow = (row) => {
    if (!row) return row
    return { ...row, createdAt: fmtDate(row.createdAt), updatedAt: fmtDate(row.updatedAt) }
}

/* 角色 */

export const list = () => db.select().from(roles).all().map(fmtRow)

export const listPaginated = (page, pageSize, q = '') => {
    const offset = (page - 1) * pageSize
    const filter = q ? like(roles.name, `%${q}%`) : undefined

    const data = (filter
        ? db.select().from(roles).where(filter)
        : db.select().from(roles)
    ).limit(pageSize).offset(offset).all().map(fmtRow)

    const row = (filter
        ? db.select({ total: count() }).from(roles).where(filter)
        : db.select({ total: count() }).from(roles)
    ).get()

    return { data, total: row?.total ?? 0 }
}

export const getById = (id) => {
    const row = db.select().from(roles).where(eq(roles.id, id)).get()
    return fmtRow(row)
}

export const getByName = (name) => {
    const row = db.select().from(roles).where(eq(roles.name, name)).get()
    return fmtRow(row)
}

export const create = async (data) => {
    const id = crypto.randomUUID()
    await db.insert(roles).values({ id, ...data })
    return getById(id)
}

export const update = async (id, data) => {
    await db.update(roles).set(data).where(eq(roles.id, id)).run()
    return getById(id)
}

export const remove = (id) =>
    db.delete(roles).where(eq(roles.id, id))

/* 角色路由权限 */

export const listRoutes = () => db.select().from(roleRoutes).all()

export const getRoute = (roleId, route) =>
    db
        .select()
        .from(roleRoutes)
        .where(and(eq(roleRoutes.roleId, roleId), eq(roleRoutes.route, route)))
        .get()

export const createRoute = (roleId, route) =>
    db.insert(roleRoutes).values({ id: crypto.randomUUID(), roleId, route })

export const removeRoute = (roleId, route) =>
    db
        .delete(roleRoutes)
        .where(and(eq(roleRoutes.roleId, roleId), eq(roleRoutes.route, route)))

export const getRoutesByRoleId = (roleId) =>
    db.select().from(roleRoutes).where(eq(roleRoutes.roleId, roleId)).all()
