import { createRouter, createWebHistory } from 'vue-router'

import { request } from '@/common/request.js'

const routes = [
    {
        path: '/login',
        name: 'login',
        component: () => import('../views/Login.vue'),
        meta: { isPublic: true },
    },
    {
        path: '/',
        component: () => import('../layouts/AppLayout.vue'),
        children: [
            {
                path: '',
                name: 'game',
                component: () => import('../views/Game.vue'),
                meta: { title: '进入游戏' },
            },
            {
                path: 'system',
                meta: { title: '系统管理' },
                component: () => import('../layouts/SystemLayout.vue'),
                children: [
                    {
                        path: '',
                        redirect: { name: 'system-users' },
                    },
                    {
                        path: 'users',
                        name: 'system-users',
                        component: () => import('../views/system/Users.vue'),
                        meta: { title: '用户管理' },
                    },
                    {
                        path: 'roles',
                        name: 'system-roles',
                        component: () => import('../views/system/Roles.vue'),
                        meta: { title: '角色管理' },
                    },
                ],
            },
        ],
    },
]

const buildRouteTree = (records) => {
    const result = []
    for (const r of records) {
        if (r.meta?.isPublic) continue

        if (r.children) {
            const children = buildRouteTree(r.children)
            if (children.length === 0) continue
            if (r.meta?.title) {
                result.push({ label: r.meta.title, children })
            } else {
                result.push(...children)
            }
        } else if (r.name) {
            result.push({ name: r.name, label: r.meta?.title || r.name })
        }
    }
    return result
}

export const permissionTree = buildRouteTree(routes)

let currentUser = null

const checkRoutePermission = (routeName) => {
    if (!routeName) return true
    if (currentUser?.routes?.includes('*')) return true
    if (!currentUser?.roleId) return false
    return currentUser?.routes?.includes(routeName) ?? false
}

const router = createRouter({
    history: createWebHistory(),
    routes,
})

router.beforeEach(async (to, _from, next) => {
    if (to.meta.isPublic) {
        next()
        return
    }

    try {
        const res = await request('/api/auth/me')
        if (!res.ok) throw new Error()
        currentUser = await res.json()
    } catch {
        next({ name: 'login', query: { redirect: to.fullPath } })
        return
    }

    if (to.name !== 'game') {
        const hasPermission = checkRoutePermission(to.name)
        if (!hasPermission) {
            next({ name: 'game' })
            return
        }
    }

    next()
})

export default router
