<script setup>
import { onMounted, onUnmounted, provide, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import { request } from '@/common/request.js'
import { connectWs, disconnectWs } from '@/common/ws.js'

const router = useRouter()
const route = useRoute()

const currentUser = ref(null)

const loadCurrentUser = async () => {
    const meResponse = await request('/api/auth/me')
    if (!meResponse.ok) {
        currentUser.value = null
        return null
    }
    const user = await meResponse.json()
    currentUser.value = user
    return user
}

provide('currentUser', currentUser)
provide('refreshCurrentUser', loadCurrentUser)

onMounted(async () => {
    const user = await loadCurrentUser()
    if (user) connectWs()
})

onUnmounted(() => {
    disconnectWs()
})

const handleLogout = async () => {
    disconnectWs()
    await request('/api/auth/logout', { method: 'POST' })
    await router.replace({ name: 'login' })
}

const isSystemRouteActive = () => route.path.startsWith('/system')

const isGameActive = () => route.path === '/'
</script>

<template>
    <div class="app-layout">
        <div class="app-header bg-white bordered">
            <QToolbar>
                <div class="text-lg font-bold" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Game8</div>
                <div class="flex gap-1 q-ml-lg">
                    <RouterLink
                        class="nav-link"
                        to="/"
                        :class="isGameActive() && 'nav-link--active'"
                    >
                        进入游戏
                    </RouterLink>
                    <RouterLink
                        class="nav-link"
                        to="/system/users"
                        :class="isSystemRouteActive() && 'nav-link--active'"
                    >
                        系统管理
                    </RouterLink>
                </div>
                <QSpace />
                <span v-if="currentUser" class="text-grey-7 text-sm q-mr-sm">{{ currentUser.username }}</span>
                <QBtn flat dense color="negative" @click="handleLogout">退出</QBtn>
            </QToolbar>
        </div>

        <div class="app-content">
            <RouterView />
        </div>
    </div>
</template>

<style scoped>
.app-layout {
    display: flex;
    flex-direction: column;
    height: 100vh;
}
.app-header {
    flex-shrink: 0;
    border-bottom: 1px solid #e2e8f0;
}
.app-content {
    flex: 1;
    overflow: hidden;
    min-height: 0;
}
.nav-link {
    padding: 4px 12px;
    border-radius: 8px;
    font-size: 0.875rem;
    color: #64748b;
    text-decoration: none;
    transition: color 0.2s, background-color 0.2s;
}
.nav-link:hover {
    color: #1e293b;
    background: rgba(0, 0, 0, 0.04);
}
.nav-link--active {
    color: #1976D2 !important;
    background: rgba(25, 118, 210, 0.08) !important;
}
</style>
