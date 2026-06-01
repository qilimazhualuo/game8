import { Elysia } from 'elysia'

import * as chat from '@/db/chat.js'
import * as role from '@/db/role.js'
import * as user from '@/db/user.js'

export const dbPlugin = new Elysia({ name: 'db' })
    .decorate('user', user)
    .decorate('role', role)
    .decorate('chat', chat)
