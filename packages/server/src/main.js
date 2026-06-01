import { Elysia } from 'elysia'

import { initDatabase } from '@/db/index.js'
import { authPlugin } from '@/plugins/auth.js'
import { dbPlugin } from '@/plugins/db.js'
import { authRoutes } from '@/routes/auth.js'
import { chatRoutes } from '@/routes/chats.js'
import { userRoutes } from '@/routes/users.js'
import { roleRoutes } from '@/routes/roles.js'
import { wsRoutes, engine } from '@/routes/ws.js'

await initDatabase()

engine.start()

const app = new Elysia()
    .use(authPlugin)
    .use(dbPlugin)
    .group('/api/auth', (api) => api.use(authRoutes))
    .group('/api/users', (api) => api.use(userRoutes))
    .group('/api/roles', (api) => api.use(roleRoutes))
    .group('/api/chats', (api) => api.use(chatRoutes))
    .use(wsRoutes)
    .listen(3000, () => {
        console.log('Game8 Server is listening on port 3000...')
    })

export default app
