import { t } from 'elysia'

export const loginBody = t.Object({
    username: t.String({ minLength: 1 }),
    encryptedPassword: t.String({ minLength: 1 }),
})

export const userIdParams = t.Object({
    userId: t.String({ minLength: 1 }),
})

export const createUserBody = t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 6 }),
    nickname: t.Optional(t.String()),
    avatar: t.Optional(t.String()),
})

export const createRoleBody = t.Object({
    name: t.String({ minLength: 1 }),
    description: t.Optional(t.String()),
})

export const updateRoleRouteBody = t.Object({
    roleId: t.String({ minLength: 1 }),
    route: t.String({ minLength: 1 }),
    granted: t.Boolean(),
})

export const updateUserRoleBody = t.Object({
    roleId: t.Optional(t.String()),
})

export const updateRoleBody = t.Object({
    name: t.Optional(t.String({ minLength: 1 })),
    description: t.Optional(t.String()),
})

export const updateUserBody = t.Object({
    username: t.Optional(t.String({ minLength: 1 })),
    password: t.Optional(t.String({ minLength: 6 })),
})

/* Chat */
export const createChatBody = t.Object({
    name: t.Optional(t.String()),
    type: t.Optional(t.String()),
    isGroup: t.Optional(t.Boolean()),
    memberIds: t.Array(t.String()),
})

export const updateChatBody = t.Object({
    name: t.Optional(t.String()),
})

export const chatIdParams = t.Object({
    chatId: t.String({ minLength: 1 }),
})

export const addMembersBody = t.Object({
    userIds: t.Array(t.String()),
})

export const sendMessageBody = t.Object({
    content: t.Optional(t.String()),
    type: t.Optional(t.String()),
})
