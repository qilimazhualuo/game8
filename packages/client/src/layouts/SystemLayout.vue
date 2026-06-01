<script setup>
import { RouterLink, RouterView } from 'vue-router'

const systemMenuItems = [
    { name: 'system-users', label: '用户管理' },
    { name: 'system-roles', label: '角色管理' },
]
</script>

<template>
    <div class="system-layout">
        <aside class="system-sidebar">
            <div class="text-grey-5 text-xs font-bold uppercase tracking-wider q-mb-md q-ml-sm sidebar-title">系统管理</div>
            <nav class="flex flex-col gap-1">
                <RouterLink
                    v-for="item in systemMenuItems"
                    :key="item.name"
                    class="sidebar-link"
                    :to="{ name: item.name }"
                    active-class="sidebar-link--active"
                >
                    {{ item.label }}
                </RouterLink>
            </nav>
        </aside>
        <section class="system-content">
            <RouterView />
        </section>
    </div>
</template>

<style scoped>
.system-layout {
    display: flex;
    height: 100%;
    background: #f8fafc;
}
.system-sidebar {
    width: 200px;
    flex-shrink: 0;
    padding: 20px 12px 20px 20px;
    border-right: 1px solid #e2e8f0;
    background: #ffffff;
}
.sidebar-link {
    display: block;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 0.875rem;
    color: #64748b;
    text-decoration: none;
    transition: color 0.2s, background-color 0.2s;
    white-space: nowrap;
}
.sidebar-link:hover {
    color: #1e293b;
    background: rgba(0, 0, 0, 0.04);
}
.sidebar-link--active {
    color: #1976D2 !important;
    background: rgba(25, 118, 210, 0.08) !important;
}
.system-content {
    flex: 1;
    min-width: 0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

@media (max-width: 767px) {
    .system-layout {
        flex-direction: column;
    }
    .system-sidebar {
        width: 100%;
        padding: 12px 16px;
        border-right: none;
        border-bottom: 1px solid #e2e8f0;
    }
    .system-sidebar nav {
        flex-direction: row;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    .system-sidebar .sidebar-title {
        display: none;
    }
    .system-content {
        padding: 16px;
    }
}
</style>
