import { and, count, desc, eq, ne, sql } from 'drizzle-orm'

import { chatMembers, chats, messages, users } from '@/db/schema.js'
import { db } from '@/db/index.js'
import { fmtDate } from '@/fmt.js'

export const getChatsByUserId = (userId) => {
    const rows = db
        .select({
            id: chats.id,
            name: chats.name,
            type: chats.type,
            createdAt: chats.createdAt,
            updatedAt: chats.updatedAt,
            lastReadAt: chatMembers.lastReadAt,
        })
        .from(chats)
        .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
        .where(eq(chatMembers.userId, userId))
        .orderBy(desc(chats.updatedAt))
        .all()

    return rows.map((row) => {
        const lastMsg = db
            .select({
                id: messages.id,
                content: messages.content,
                type: messages.type,
                senderId: messages.senderId,
                createdAt: messages.createdAt,
                senderNickname: users.nickname,
                senderUsername: users.username,
            })
            .from(messages)
            .innerJoin(users, eq(users.id, messages.senderId))
            .where(eq(messages.chatId, row.id))
            .orderBy(desc(messages.createdAt))
            .limit(1)
            .get()

        const lastReadTs = Math.floor(row.lastReadAt.getTime() / 1000)

        const unreadRow = db
            .select({ c: count() })
            .from(messages)
            .where(
                and(
                    eq(messages.chatId, row.id),
                    ne(messages.senderId, userId),
                    sql`${messages.createdAt} > ${lastReadTs}`,
                ),
            )
            .get()

        const memberRow = db
            .select({ c: count() })
            .from(chatMembers)
            .where(eq(chatMembers.chatId, row.id))
            .get()

        return {
            id: row.id,
            name: row.name,
            type: row.type,
            createdAt: fmtDate(row.createdAt),
            updatedAt: fmtDate(row.updatedAt),
            lastMessage: lastMsg
                ? {
                      ...lastMsg,
                      createdAt: fmtDate(lastMsg.createdAt),
                  }
                : null,
            unreadCount: unreadRow?.c ?? 0,
            memberCount: memberRow?.c ?? 0,
        }
    })
}

export const getChatById = (id) =>
    db.select().from(chats).where(eq(chats.id, id)).get()

export const createChat = (data) => {
    const id = crypto.randomUUID()
    db.insert(chats).values({ id, ...data }).run()
    return getChatById(id)
}

export const updateChat = (id, patch) => {
    db.update(chats).set(patch).where(eq(chats.id, id)).run()
    return getChatById(id)
}

export const deleteChat = (id) => {
    db.delete(chats).where(eq(chats.id, id)).run()
}

export const getChatMembers = (chatId) =>
    db
        .select({
            id: chatMembers.id,
            userId: chatMembers.userId,
            joinedAt: chatMembers.joinedAt,
            lastReadAt: chatMembers.lastReadAt,
            nickname: users.nickname,
            username: users.username,
            avatar: users.avatar,
        })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .where(eq(chatMembers.chatId, chatId))
        .all()

export const addChatMember = (chatId, userId) => {
    const id = crypto.randomUUID()
    db.insert(chatMembers)
        .values({ id, chatId, userId, lastReadAt: new Date() })
        .run()
    return id
}

export const removeChatMember = (chatId, userId) => {
    db.delete(chatMembers)
        .where(
            and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
        )
        .run()
}

export const isChatMember = (chatId, userId) => {
    const row = db
        .select({ id: chatMembers.id })
        .from(chatMembers)
        .where(
            and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
        )
        .get()
    return !!row
}

export const findDmChat = (userId1, userId2) => {
    const c1 = db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId1))
        .all()
        .map((r) => r.chatId)

    if (c1.length === 0) return null

    const c2 = db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId2))
        .all()
        .map((r) => r.chatId)

    if (c2.length === 0) return null

    const common = c1.filter((id) => c2.includes(id))
    if (common.length === 0) return null

    for (const chatId of common) {
        const chat = getChatById(chatId)
        if (chat && chat.type === 'dm') return chat
    }

    return null
}

export const getMessages = (chatId, page = 1, pageSize = 50) => {
    const offset = (page - 1) * pageSize

    const data = db
        .select({
            id: messages.id,
            content: messages.content,
            type: messages.type,
            senderId: messages.senderId,
            chatId: messages.chatId,
            createdAt: messages.createdAt,
            senderNickname: users.nickname,
            senderUsername: users.username,
            senderAvatar: users.avatar,
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.chatId, chatId))
        .orderBy(desc(messages.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all()

    const totalRow = db
        .select({ c: count() })
        .from(messages)
        .where(eq(messages.chatId, chatId))
        .get()

    return {
        data: data
            .reverse()
            .map((m) => ({ ...m, createdAt: fmtDate(m.createdAt) })),
        total: totalRow?.c ?? 0,
        page,
        pageSize,
    }
}

export const createMessage = (data) => {
    const id = crypto.randomUUID()
    const createdAt = new Date()
    db.insert(messages).values({ id, createdAt, ...data }).run()
    db.update(chats)
        .set({ updatedAt: createdAt })
        .where(eq(chats.id, data.chatId))
        .run()
    return db
        .select({
            id: messages.id,
            content: messages.content,
            type: messages.type,
            senderId: messages.senderId,
            chatId: messages.chatId,
            createdAt: messages.createdAt,
            senderNickname: users.nickname,
            senderUsername: users.username,
            senderAvatar: users.avatar,
        })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(eq(messages.id, id))
        .get()
}

