import { mkdirSync, existsSync } from 'node:fs'
import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { chatMembers, chats, roleRoutes, roles, users, table } from '@/db/schema.js'

const databasePath = './data/game8.sqlite'

if (!existsSync('./data')) {
    mkdirSync('./data', { recursive: true })
}

const sqlite = new Database(databasePath)
sqlite.run('PRAGMA journal_mode = WAL')
export const db = drizzle(sqlite)

const columnTypeMap = {
    SQLiteText: 'TEXT',
    SQLiteInteger: 'INTEGER',
    SQLiteTimestamp: 'INTEGER',
    SQLiteReal: 'REAL',
    SQLiteNumeric: 'NUMERIC',
    SQLiteBlob: 'BLOB',
}

const getColType = (col) => {
    const name = col.constructor?.name
    return columnTypeMap[name] || 'TEXT'
}

const buildAddColumnSql = (tableName, col) => {
    const colName = col.name
    const sqlType = getColType(col)
    const parts = [`ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${sqlType}`]

    let hasDefault = false
    if (col.hasDefault) {
        if (col.defaultFn && sqlType === 'INTEGER') {
            parts.push("DEFAULT (CAST(strftime('%s','now') AS INTEGER))")
            hasDefault = true
        } else if (col.default !== undefined && col.default !== null) {
            if (typeof col.default === 'string') {
                parts.push(`DEFAULT '${col.default.replace(/'/g, "''")}'`)
            } else if (typeof col.default === 'number' || typeof col.default === 'boolean') {
                parts.push(`DEFAULT ${String(col.default)}`)
            }
            hasDefault = true
        }
    } else if (col.notNull && sqlType === 'INTEGER') {
        parts.push('DEFAULT 0')
        hasDefault = true
    }

    if (col.notNull && hasDefault) {
        parts.push('NOT NULL')
    }

    return parts.join(' ')
}

const buildCreateTableSql = (tableName, columns) => {
    const colDefs = []
    for (const col of columns) {
        const colName = col.name
        const sqlType = getColType(col)
        let def = `"${colName}" ${sqlType}`

        if (col.primary) {
            def += ' PRIMARY KEY'
        }
        if (col.notNull) {
            def += ' NOT NULL'
        }
        if (col.isUnique) {
            def += ' UNIQUE'
        }
        if (col.hasDefault) {
            if (col.defaultFn && sqlType === 'INTEGER') {
                def += " DEFAULT (CAST(strftime('%s','now') AS INTEGER))"
            } else if (col.default !== undefined && col.default !== null) {
                if (typeof col.default === 'string') {
                    def += ` DEFAULT '${col.default.replace(/'/g, "''")}'`
                } else if (typeof col.default === 'number' || typeof col.default === 'boolean') {
                    def += ` DEFAULT ${String(col.default)}`
                }
            }
        }

        colDefs.push(def)
    }
    return `CREATE TABLE IF NOT EXISTS "${tableName}" (${colDefs.join(', ')})`
}

export const syncSchema = () => {
    const existingTables = new Set(
        sqlite
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_%'")
            .all()
            .map((r) => r.name),
    )

    for (const [exportName, tbl] of Object.entries(table)) {
        const tableName = tbl[Symbol.for('drizzle:Name')] || exportName
        const columnsObj = tbl[Symbol.for('drizzle:Columns')]
        if (!columnsObj) continue

        const columns = Object.values(columnsObj)
        if (!columns.length) continue

        if (!existingTables.has(tableName)) {
            const sql = buildCreateTableSql(tableName, columns)
            try {
                sqlite.run(sql)
                console.log(`  + Created table "${tableName}"`)
            } catch (err) {
                console.error(`  ! Failed to create table "${tableName}":`, err.message)
            }
            continue
        }

        const existingCols = sqlite.prepare(`PRAGMA table_info('${tableName}')`).all()
        const existingNames = new Set(existingCols.map((r) => r.name))

        for (const col of columns) {
            if (!existingNames.has(col.name)) {
                const sql = buildAddColumnSql(tableName, col)
                try {
                    sqlite.run(sql)
                    console.log(`  + Added column "${col.name}" to "${tableName}"`)
                } catch (err) {
                    console.error(`  ! Failed to add column "${col.name}" to "${tableName}":`, err.message)
                }
            }
        }
    }
}

const seedDemoUser = async () => {
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.username, 'admin'))
        .get()

    if (existingUser) {
        return
    }

    const adminRoleId = crypto.randomUUID()
    await db.insert(roles).values({
        id: adminRoleId,
        name: 'admin',
        description: '系统管理员',
    })

    await db.insert(roleRoutes).values([
        { id: crypto.randomUUID(), roleId: adminRoleId, route: '*' },
    ])

    await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'admin',
        passwordHash: await Bun.password.hash('admin123', {
            algorithm: 'bcrypt',
            cost: 10,
        }),
        roleId: adminRoleId,
    })
}

const seedGameLobby = async () => {
    const existingLobby = await db
        .select()
        .from(chats)
        .where(eq(chats.name, '游戏大厅'))
        .get()

    if (existingLobby) return

    const lobbyId = crypto.randomUUID()
    await db.insert(chats).values({
        id: lobbyId,
        name: '游戏大厅',
        type: 'group',
    })

    const admin = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, 'admin'))
        .get()

    if (admin) {
        await db.insert(chatMembers).values({
            id: crypto.randomUUID(),
            chatId: lobbyId,
            userId: admin.id,
        })
    }

    console.log('[DB] Created default game lobby')
}

export const initDatabase = async () => {
    console.log('[DB] Syncing schema...')
    syncSchema()
    await seedDemoUser()
    await seedGameLobby()
}
