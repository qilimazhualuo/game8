import { count, eq, like } from 'drizzle-orm'

import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { fmtDate } from '@/fmt.js'

const pickPublic = ({ passwordHash, createdAt, updatedAt, ...rest }) => ({
    ...rest,
    createdAt: fmtDate(createdAt),
    updatedAt: fmtDate(updatedAt),
})

export const hashPassword = (plain) =>
    Bun.password.hash(plain, { algorithm: 'bcrypt', cost: 10 })

/* 内部：返回完整行（含 passwordHash）*/

export const getDetail = (id) =>
    db.select().from(users).where(eq(users.id, id)).get()

export const getDetailByUsername = (username) =>
    db.select().from(users).where(eq(users.username, username)).get()

/* 外部：返回公共字段（不含 passwordHash）*/

export const getById = (id) => {
    const row = getDetail(id)
    return row ? pickPublic(row) : null
}

export const getByUsername = (username) => {
    const row = getDetailByUsername(username)
    return row ? pickPublic(row) : null
}

export const list = async () =>
    (await db.select().from(users).all()).map(pickPublic)

export const listPaginated = (page, pageSize, q = '') => {
    const offset = (page - 1) * pageSize
    const filter = q ? like(users.username, `%${q}%`) : undefined

    const data = (filter
        ? db.select().from(users).where(filter)
        : db.select().from(users)
    ).limit(pageSize).offset(offset).all().map(pickPublic)

    const row = (filter
        ? db.select({ total: count() }).from(users).where(filter)
        : db.select({ total: count() }).from(users)
    ).get()

    return { data, total: row?.total ?? 0 }
}

export const create = async (data) => {
    const id = crypto.randomUUID()
    await db.insert(users).values({ id, ...data })
    return getById(id)
}

export const update = async (id, patch) => {
    await db.update(users).set(patch).where(eq(users.id, id))
    return getById(id)
}

export const remove = (id) =>
    db.delete(users).where(eq(users.id, id))
