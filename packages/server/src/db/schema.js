import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const roles = sqliteTable('roles', {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    description: text('description'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    nickname: text('nickname'),
    avatar: text('avatar'),
    roleId: text('role_id').references(() => roles.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const roleRoutes = sqliteTable(
    'role_routes',
    {
        id: text('id').primaryKey(),
        roleId: text('role_id')
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),
        route: text('route').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => ({
        uniqRoleRoute: unique().on(table.roleId, table.route),
    }),
)

export const chats = sqliteTable('chats', {
    id: text('id').primaryKey(),
    name: text('name'),
    type: text('type', { enum: ['dm', 'group', 'meeting'] }).default('dm').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const chatMembers = sqliteTable(
    'chat_members',
    {
        id: text('id').primaryKey(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        chatId: text('chat_id')
            .notNull()
            .references(() => chats.id, { onDelete: 'cascade' }),
        joinedAt: integer('joined_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
        lastReadAt: integer('last_read_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => ({
        uniqMember: unique().on(table.userId, table.chatId),
    }),
)

export const messages = sqliteTable('messages', {
    id: text('id').primaryKey(),
    content: text('content'),
    type: text('type').default('TEXT').notNull(),
    senderId: text('sender_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
        .notNull()
        .references(() => chats.id, { onDelete: 'cascade' }),
    fileUrl: text('file_url'),
    fileName: text('file_name'),
    knowledgeRefs: text('knowledge_refs', { mode: 'json' }),
    doubaoAuxImageUrl: text('doubao_aux_image_url'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const readStatuses = sqliteTable(
    'read_statuses',
    {
        id: text('id').primaryKey(),
        messageId: text('message_id')
            .notNull()
            .references(() => messages.id, { onDelete: 'cascade' }),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        readAt: integer('read_at', { mode: 'timestamp' })
            .notNull()
            .$defaultFn(() => new Date()),
    },
    (table) => ({
        uniqRead: unique().on(table.messageId, table.userId),
    }),
)

export const gamePlayers = sqliteTable('game_players', {
    id: text('id').primaryKey(),
    userId: text('user_id')
        .notNull()
        .unique()
        .references(() => users.id, { onDelete: 'cascade' }),
    x: text('x').default('0').notNull(),
    y: text('y').default('0').notNull(),
    z: text('z').default('0').notNull(),
    rotationY: text('rotation_y').default('0').notNull(),
    isOnline: integer('is_online', { mode: 'boolean' }).default(false).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const table = {
    users,
    roles,
    roleRoutes,
    chats,
    chatMembers,
    messages,
    readStatuses,
    gamePlayers,
}
