import { Elysia } from 'elysia'

import { sendToChatMembers, sendToUser } from '@/routes/ws.js'
import {
    addMembersBody,
    chatIdParams,
    createChatBody,
    sendMessageBody,
    updateChatBody,
} from '@/db/validation.js'

export const chatRoutes = new Elysia({ name: 'chat-routes' })
    .get('/', async ({ chat, currentUser }) => {
        const list = chat.getChatsByUserId(currentUser.userId)
        return Promise.all(
            list.map(async (c) => {
                const members = chat.getChatMembers(c.id)
                return { ...c, members }
            }),
        )
    })
    .post(
        '/',
        async ({ chat, user, currentUser, body, set }) => {
            const now = new Date()

            const chatType = body.type || (body.isGroup ? 'group' : 'dm')
            const chatData = {
                name:
                    chatType !== 'dm'
                        ? body.name || (chatType === 'meeting' ? '新会议室' : '新群组')
                        : null,
                type: chatType,
                createdAt: now,
                updatedAt: now,
            }

            const newChat = chat.createChat(chatData)

            chat.addChatMember(newChat.id, currentUser.userId)

            for (const memberId of body.memberIds) {
                if (memberId !== currentUser.userId) {
                    chat.addChatMember(newChat.id, memberId)
                }
            }

            if (chatType === 'dm' && body.memberIds.length > 0) {
                const otherUserId = body.memberIds.find(
                    (id) => id !== currentUser.userId,
                )
                if (otherUserId) {
                    const otherUser = await user.getById(otherUserId)
                    chat.updateChat(newChat.id, {
                        name: otherUser?.nickname || otherUser?.username,
                    })
                }
            }

            return {
                ...newChat,
                createdAt: newChat.createdAt,
                updatedAt: newChat.updatedAt,
                members: chat.getChatMembers(newChat.id),
            }
        },
        { body: createChatBody },
    )
    .get(
        '/:chatId',
        async ({ chat, params, currentUser, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            const c = chat.getChatById(params.chatId)
            if (!c) {
                set.status = 404
                return '群组不存在'
            }

            return {
                ...c,
                members: chat.getChatMembers(params.chatId),
            }
        },
        { params: chatIdParams },
    )
    .patch(
        '/:chatId',
        async ({ chat, params, currentUser, body, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            const patch = {}
            if (body.name !== undefined) patch.name = body.name

            const updated = chat.updateChat(params.chatId, patch)
            if (!updated) {
                set.status = 404
                return '群组不存在'
            }

            return updated
        },
        { params: chatIdParams, body: updateChatBody },
    )
    .delete(
        '/:chatId',
        async ({ chat, params, currentUser, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            chat.deleteChat(params.chatId)
        },
        { params: chatIdParams },
    )
    .post(
        '/:chatId/members',
        async ({ chat, params, currentUser, body, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            const c = chat.getChatById(params.chatId)
            if (!c || c.type === 'dm') {
                set.status = 400
                return '只有群组或会议室可以添加成员'
            }

            for (const memberId of body.userIds) {
                if (!chat.isChatMember(params.chatId, memberId)) {
                    chat.addChatMember(params.chatId, memberId)
                }
            }

            const updatedMembers = chat.getChatMembers(params.chatId)
            const allIds = updatedMembers.map((m) => m.userId)
            sendToChatMembers(
                params.chatId,
                { type: 'chat_updated', data: { chatId: params.chatId } },
                allIds,
            )

            return { members: updatedMembers }
        },
        { params: chatIdParams, body: addMembersBody },
    )
    .delete(
        '/:chatId/members/:userId',
        async ({ chat, params, currentUser, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            const c = chat.getChatById(params.chatId)
            if (!c || c.type === 'dm') {
                set.status = 400
                return '只有群组或会议室可以移除成员'
            }

            if (params.userId === currentUser.userId) {
                set.status = 400
                return '不能移除自己'
            }

            chat.removeChatMember(params.chatId, params.userId)

            const updatedMembers = chat.getChatMembers(params.chatId)
            const allIds = updatedMembers.map((m) => m.userId)
            sendToChatMembers(
                params.chatId,
                { type: 'chat_updated', data: { chatId: params.chatId } },
                allIds,
            )
            sendToUser(params.userId, {
                type: 'chat_updated',
                data: { chatId: params.chatId },
            })

            return { members: updatedMembers }
        },
    )
    .get(
        '/:chatId/messages',
        async ({ chat, params, currentUser, query, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            return chat.getMessages(
                params.chatId,
                Number(query.page) || 1,
                Number(query.pageSize) || 50,
            )
        },
        { params: chatIdParams },
    )
    .post(
        '/:chatId/messages',
        async ({ chat, params, currentUser, body, set }) => {
            if (!chat.isChatMember(params.chatId, currentUser.userId)) {
                set.status = 403
                return '不是群组成员'
            }

            if (!body.content && body.type !== 'TEXT') {
                set.status = 400
                return '消息内容不能为空'
            }

            const msg = chat.createMessage({
                content: body.content || '',
                type: body.type || 'TEXT',
                senderId: currentUser.userId,
                chatId: params.chatId,
            })

            const members = chat.getChatMembers(params.chatId)
            const memberIds = members
                .map((m) => m.userId)
                .filter((id) => id !== currentUser.userId)
            sendToChatMembers(
                params.chatId,
                { type: 'new_message', data: msg },
                memberIds,
            )

            return {
                ...msg,
                createdAt: msg.createdAt,
            }
        },
        { params: chatIdParams, body: sendMessageBody },
    )
    .model({
        createChatBody,
        updateChatBody,
        chatIdParams,
        addMembersBody,
        sendMessageBody,
    })
