<script setup>
import { computed, onMounted, ref } from 'vue'

import { permissionTree } from '@/router/index.js'
import { request } from '@/common/request.js'

const pageSize = 20
const currentPage = ref(1)
const totalRoles = ref(0)
const searchQuery = ref('')
const roleList = ref([])
const routePerms = ref([])
const loadError = ref('')
const formError = ref('')
const isLoading = ref(false)
const isSubmitting = ref(false)
const initialLoadDone = ref(false)

const showCreateDialog = ref(false)
const newRoleName = ref('')
const newRoleDesc = ref('')
const newRoleRoutes = ref(new Set())

const allLoaded = computed(() => roleList.value.length >= totalRoles.value)

const toggleNewRoleRoute = (routeName) => {
    const s = newRoleRoutes.value
    if (s.has(routeName)) s.delete(routeName)
    else s.add(routeName)
    newRoleRoutes.value = new Set(s)
}

const showEditDialog = ref(false)
const editingRole = ref(null)
const editRoleName = ref('')
const editRoleDesc = ref('')
const editRoleRoutes = ref(new Set())

const openEditDialog = (role) => {
    editingRole.value = role
    editRoleName.value = role.name
    editRoleDesc.value = role.description || ''
    editRoleRoutes.value = new Set(
        routePerms.value
            .filter((rp) => rp.roleId === role.id)
            .map((rp) => rp.route),
    )
    showEditDialog.value = true
}

const toggleEditRoleRoute = (routeName) => {
    const s = editRoleRoutes.value
    if (s.has(routeName)) s.delete(routeName)
    else s.add(routeName)
    editRoleRoutes.value = new Set(s)
}

const handleEditRole = async () => {
    if (!editingRole.value) return
    formError.value = ''
    isSubmitting.value = true
    try {
        const name = editRoleName.value.trim()
        const desc = editRoleDesc.value.trim()
        if (name !== editingRole.value.name || desc !== (editingRole.value.description || '')) {
            const res = await request(`/api/roles/${editingRole.value.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name, description: desc || undefined }),
            })
            if (!res.ok) {
                const msg = await res.json().catch(() => '')
                formError.value = msg || '更新角色失败'
                return
            }
        }
        const currentRoutes = new Set(
            routePerms.value
                .filter((rp) => rp.roleId === editingRole.value.id)
                .map((rp) => rp.route),
        )
        const ops = []
        for (const r of editRoleRoutes.value) {
            if (!currentRoutes.has(r)) ops.push({ route: r, granted: true })
        }
        for (const r of currentRoutes) {
            if (!editRoleRoutes.value.has(r)) ops.push({ route: r, granted: false })
        }
        await Promise.all(
            ops.map((op) =>
                request('/api/roles/routes', {
                    method: 'PUT',
                    body: JSON.stringify({ roleId: editingRole.value.id, ...op }),
                }),
            ),
        )
        showEditDialog.value = false
        editingRole.value = null
        await loadData()
    } catch {
        formError.value = '网络错误'
    } finally {
        isSubmitting.value = false
    }
}

const loadRoles = async (page = 1, q = '', append = false) => {
    const params = new URLSearchParams({ page, pageSize })
    if (q) params.set('q', q)

    const [rolesRes, permsRes] = await Promise.all([
        request(`/api/roles?${params}`),
        request('/api/roles/routes'),
    ])
    if (!rolesRes.ok) {
        const msg = await rolesRes.json().catch(() => '')
        throw new Error(msg || '加载角色列表失败')
    }
    if (!permsRes.ok) {
        const msg = await permsRes.json().catch(() => '')
        throw new Error(msg || '加载权限配置失败')
    }
    const result = await rolesRes.json()
    if (append) {
        roleList.value.push(...result.data)
    } else {
        roleList.value = result.data
    }
    totalRoles.value = result.total
    routePerms.value = await permsRes.json()
}

const doSearch = () => {
    currentPage.value = 1
    initialLoadDone.value = false
    loadData()
}

const loadData = async () => {
    isLoading.value = true
    loadError.value = ''
    try {
        await loadRoles(1, searchQuery.value, false)
    } catch (error) {
        loadError.value = error.message
    } finally {
        isLoading.value = false
    }
}

const onLoadMore = async (index, done) => {
    if (!initialLoadDone.value) {
        initialLoadDone.value = true
        done()
        return
    }
    if (allLoaded.value) {
        done(true)
        return
    }
    try {
        currentPage.value++
        await loadRoles(currentPage.value, searchQuery.value, true)
        done()
    } catch {
        done()
    }
}

onMounted(loadData)

const handleCreateRole = async () => {
    formError.value = ''
    if (!newRoleName.value.trim()) {
        formError.value = '请输入角色名称'
        return
    }
    isSubmitting.value = true
    try {
        const response = await request('/api/roles', {
            method: 'POST',
            body: JSON.stringify({
                name: newRoleName.value.trim(),
                description: newRoleDesc.value.trim() || undefined,
            }),
        })
        if (!response.ok) {
            const msg = await response.json().catch(() => '')
            formError.value = msg || '创建角色失败'
            return
        }
        const newRole = await response.json()
        const created = newRole.id
        await Promise.all(
            [...newRoleRoutes.value].map((route) =>
                request('/api/roles/routes', {
                    method: 'PUT',
                    body: JSON.stringify({ roleId: created, route, granted: true }),
                }),
            ),
        )
        newRoleName.value = ''
        newRoleDesc.value = ''
        newRoleRoutes.value = new Set()
        showCreateDialog.value = false
        await loadData()
    } catch {
        formError.value = '网络错误'
    } finally {
        isSubmitting.value = false
    }
}

const handleDeleteRole = async (roleId) => {
    if (!window.confirm('确定删除这个角色？')) return
    const response = await request(`/api/roles/${roleId}`, { method: 'DELETE' })
    if (!response.ok) {
        loadError.value = '删除失败'
        return
    }
    await loadData()
}

const flatRoutes = computed(() => {
    const result = []
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            result.push({ ...n, depth })
            if (n.children) walk(n.children, depth + 1)
        }
    }
    walk(permissionTree, 0)
    return result
})


</script>

<template>
    <div class="page">
        <div class="row items-center q-mb-lg">
            <div class="col">
                <div class="text-h5 text-dark q-mb-xs">角色管理</div>
                <QInput v-model="searchQuery" placeholder="搜索角色…" outlined dense class="q-mt-xs" style="max-width: 320px" clearable @update:model-value="doSearch" />
            </div>
            <QBtn color="primary" label="创建角色" @click="showCreateDialog = true" />
        </div>

        <div v-if="loadError" class="error-banner">{{ loadError }}</div>
        <p v-if="isLoading && roleList.length === 0" class="text-grey-6">加载中…</p>
        <QInfiniteScroll v-else-if="!isLoading || roleList.length > 0" :key="searchQuery" class="scroll-area" scroll-target=".scroll-area" @load="onLoadMore">
            <div v-if="roleList.length === 0" class="text-grey-6">暂无角色。</div>
            <div v-else class="row q-col-gutter-sm">
                <div v-for="role in roleList" :key="role.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
                    <QCard flat bordered>
                        <QCardSection>
                            <div class="text-weight-medium">{{ role.name }}</div>
                            <div class="text-caption text-grey-6">{{ role.description || '-' }}</div>
                        </QCardSection>
                        <QCardSection class="text-caption text-grey-5 q-pt-none">
                            {{ role.createdAt }}
                        </QCardSection>
                        <QSeparator />
                        <QCardActions align="right">
                            <QBtn size="sm" color="primary" @click="openEditDialog(role)">编辑</QBtn>
                            <QBtn size="sm" color="negative" @click="handleDeleteRole(role.id)">删除</QBtn>
                        </QCardActions>
                    </QCard>
                </div>
            </div>
            <template v-slot:loading>
                <div class="text-center q-py-md text-grey-6">加载更多…</div>
            </template>
            <div v-if="allLoaded && roleList.length > 0" class="text-center q-py-md text-grey-5">已加载完全</div>
        </QInfiniteScroll>

        <QDialog v-model="showEditDialog" persistent>
            <QCard style="min-width: 400px; max-width: 90vw">
                <QCardSection class="text-h6">编辑角色</QCardSection>
                <QCardSection>
                    <form @submit.prevent="handleEditRole">
                        <QInput v-model="editRoleName" placeholder="角色名称" autocomplete="off" outlined dense class="q-mb-sm" />
                        <QInput v-model="editRoleDesc" placeholder="角色描述（可选）" autocomplete="off" outlined dense class="q-mb-md" />
                        <div class="text-subtitle2 q-mb-sm">路由权限</div>
                        <div class="perm-scroll" style="max-height: 300px">
                            <QIntersection
                                v-for="route in flatRoutes"
                                :key="route.name || route.label"
                                transition="scale"
                                class="perm-item"
                                :style="{ paddingLeft: route.depth * 24 + 16 + 'px' }"
                            >
                                <div class="row items-center no-wrap">
                                    <div class="col">
                                        <div :class="route.children ? 'text-weight-medium' : ''">{{ route.label }}</div>
                                    </div>
                                    <QCheckbox
                                        v-if="route.name"
                                        :model-value="editRoleRoutes.has(route.name)"
                                        @update:model-value="() => toggleEditRoleRoute(route.name)"
                                        dense
                                    />
                                </div>
                            </QIntersection>
                        </div>
                        <div v-if="formError" class="error-banner q-mb-md q-mt-md">{{ formError }}</div>
                        <div class="row justify-end q-gutter-sm q-mt-md">
                            <QBtn flat label="取消" color="grey-7" @click="showEditDialog = false" :disable="isSubmitting" />
                            <QBtn type="submit" color="primary" :loading="isSubmitting" :disable="isSubmitting" label="保存" />
                        </div>
                    </form>
                </QCardSection>
            </QCard>
        </QDialog>
        <QDialog v-model="showCreateDialog" persistent>
            <QCard style="min-width: 400px; max-width: 90vw">
                <QCardSection class="text-h6">新建角色</QCardSection>
                <QCardSection>
                    <form @submit.prevent="handleCreateRole">
                        <QInput v-model="newRoleName" placeholder="角色名称" autocomplete="off" outlined dense class="q-mb-sm" />
                        <QInput v-model="newRoleDesc" placeholder="角色描述（可选）" autocomplete="off" outlined dense class="q-mb-md" />
                        <div class="text-subtitle2 q-mb-sm">路由权限</div>
                        <div class="perm-scroll" style="max-height: 300px">
                            <QIntersection
                                v-for="route in flatRoutes"
                                :key="route.name || route.label"
                                transition="scale"
                                class="perm-item"
                                :style="{ paddingLeft: route.depth * 24 + 16 + 'px' }"
                            >
                                <div class="row items-center no-wrap">
                                    <div class="col">
                                        <div :class="route.children ? 'text-weight-medium' : ''">{{ route.label }}</div>
                                    </div>
                                    <QCheckbox
                                        v-if="route.name"
                                        :model-value="newRoleRoutes.has(route.name)"
                                        @update:model-value="() => toggleNewRoleRoute(route.name)"
                                        dense
                                    />
                                </div>
                            </QIntersection>
                        </div>
                        <div v-if="formError" class="error-banner q-mb-md q-mt-md">{{ formError }}</div>
                        <div class="row justify-end q-gutter-sm q-mt-md">
                            <QBtn flat label="取消" color="grey-7" @click="showCreateDialog = false" :disable="isSubmitting" />
                            <QBtn type="submit" color="primary" :loading="isSubmitting" :disable="isSubmitting" label="创建" />
                        </div>
                    </form>
                </QCardSection>
            </QCard>
        </QDialog>
    </div>
</template>

<style scoped>
.page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}
.scroll-area {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding-right: 6px;
}
.error-banner {
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.8125rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
}
.full-width {
    width: 100%;
}
.perm-scroll {
    overflow-y: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
}
.perm-item {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
}
.perm-item:last-child {
    border-bottom: none;
}
</style>

<style>
.q-card {
    transition: box-shadow 0.2s;
}
.q-card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
}
</style>
