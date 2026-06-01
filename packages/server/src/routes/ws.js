import { Elysia } from 'elysia'

import { resolveCurrentUser } from '@/plugins/auth.js'
import { db } from '@/db/index.js'
import { chatMembers, gamePlayers } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { GameEngine } from '@/engine/GameEngine.js'

const onlineUsers = new Map()

export function sendToUser(userId, data) {
    const set = onlineUsers.get(userId)
    if (!set) return
    const payload = JSON.stringify(data)
    for (const ws of set) {
        try {
            ws.send(payload)
        } catch {}
    }
}

function broadcastAll(data) {
    const payload = JSON.stringify(data)
    for (const set of onlineUsers.values()) {
        for (const ws of set) {
            try {
                ws.send(payload)
            } catch {}
        }
    }
}

export const engine = new GameEngine({
    sendToUser,
    broadcast: broadcastAll,
})

export const wsRoutes = new Elysia({ name: 'ws-routes' }).ws('/ws', {
    open(ws) {
        const user = resolveCurrentUser(ws.data?.cookie)
        if (!user?.userId) {
            ws.close(1008, 'Unauthorized')
            return
        }

        ws.data._userId = user.userId
        if (!onlineUsers.has(user.userId)) {
            onlineUsers.set(user.userId, new Set())
        }
        onlineUsers.get(user.userId).add(ws)
    },
    message(ws, raw) {
        try {
            const data = JSON.parse(raw)
            const userId = ws.data?._userId
            if (!userId) return

            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }))
                return
            }

            if (data.type === 'game:join') {
                engine.addPlayer(userId)
                ws.send(JSON.stringify({
                    type: 'game:state',
                    data: engine.getState(),
                }))
                return
            }

            if (data.type === 'game:input') {
                engine.queueInput(userId, data.data || {})
                return
            }

            if (data.type === 'game:leave') {
                engine.removePlayer(userId)
                return
            }
        } catch {}
    },
    close(ws) {
        const userId = ws.data?._userId
        if (userId) {
            const set = onlineUsers.get(userId)
            if (set) {
                set.delete(ws)
                if (set.size === 0) {
                    onlineUsers.delete(userId)
                    engine.removePlayer(userId)
                }
            }
        }
    },
})

export const sendToChatMembers = (chatId, data, memberUserIds) => {
    const payload = JSON.stringify(data)
    for (const userId of memberUserIds) {
        const set = onlineUsers.get(userId)
        if (!set) continue
        for (const ws of set) {
            try {
                ws.send(payload)
            } catch {}
        }
    }
}
