<script setup>
import { computed, onMounted, ref } from 'vue'

import { request } from '@/common/request.js'

const pageSize = 20
const currentPage = ref(1)
const totalUsers = ref(0)
const searchQuery = ref('')
const userList = ref([])
const loadError = ref('')
const formError = ref('')
const isLoading = ref(false)
const isSubmitting = ref(false)
const initialLoadDone = ref(false)

const showCreateDialog = ref(false)
const newUsername = ref('')
const newPassword = ref('')

const allLoaded = computed(() => userList.value.length >= totalUsers.value)

const loadUsers = async (page = 1, q = '', append = false) => {
    const params = new URLSearchParams({ page, pageSize })
    if (q) params.set('q', q)
    const response = await request(`/api/users?${params}`)
    if (!response.ok) {
        const message = await response.json().catch(() => '')
        throw new Error(message || '加载用户列表失败')
    }
    const result = await response.json()
    if (append) {
        userList.value.push(...result.data)
    } else {
        userList.value = result.data
    }
    totalUsers.value = result.total
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
        await loadUsers(1, searchQuery.value, false)
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
        await loadUsers(currentPage.value, searchQuery.value, true)
        done()
    } catch {
        done()
    }
}

onMounted(loadData)

const handleCreateUser = async () => {
    formError.value = ''
    const username = newUsername.value.trim()
    if (!username || !newPassword.value) {
        formError.value = '用户名和密码都得填。'
        return
    }

    isSubmitting.value = true
    try {
        const response = await request('/api/users', {
            method: 'POST',
            body: JSON.stringify({
                username,
                password: newPassword.value,
            }),
        })
        const responseBody = await response.json().catch(() => '')
        if (!response.ok) {
            formError.value = responseBody || '创建用户失败'
            return
        }
        newUsername.value = ''
        newPassword.value = ''
        showCreateDialog.value = false
        await loadData()
    } catch {
        formError.value = '网络错误，创建失败。'
    } finally {
        isSubmitting.value = false
    }
}

const handleDeleteUser = async (userId) => {
    if (!window.confirm('确定删除这个用户？')) {
        return
    }

    const response = await request(`/api/users/${userId}`, {
        method: 'DELETE',
    })
    if (!response.ok) {
        const message = await response.json().catch(() => '')
        loadError.value = message || '删除失败'
        return
    }
    loadError.value = ''
    await loadData()
}


</script>

<template>
    <div class="page">
        <div class="row items-center q-mb-lg">
            <div class="col">
                <div class="text-h5 text-dark q-mb-xs">用户管理</div>
                <QInput v-model="searchQuery" placeholder="搜索用户…" outlined dense class="q-mt-xs" style="max-width: 320px" clearable @update:model-value="doSearch" />
            </div>
            <QBtn color="primary" label="创建用户" @click="showCreateDialog = true" />
        </div>

        <div v-if="loadError" class="error-banner">{{ loadError }}</div>
        <p v-if="isLoading && userList.length === 0" class="text-grey-6">加载中…</p>
        <QInfiniteScroll v-else-if="!isLoading || userList.length > 0" :key="searchQuery" class="scroll-area" scroll-target=".scroll-area" @load="onLoadMore">
            <div v-if="userList.length === 0" class="text-grey-6">暂无用户。</div>
            <div v-else class="row q-col-gutter-sm">
                <div v-for="user in userList" :key="user.id" class="col-12 col-sm-6 col-md-4 col-lg-3">
                    <QCard flat bordered>
                        <QCardSection>
                            <div class="text-weight-medium">{{ user.username }}</div>
                            <div class="text-caption text-grey-6 font-mono break-all">{{ user.id }}</div>
                        </QCardSection>
                        <QSeparator />
                        <QCardActions align="right">
                            <QBtn size="sm" color="negative" :disable="user.username === 'admin'" @click="handleDeleteUser(user.id)">删除</QBtn>
                        </QCardActions>
                    </QCard>
                </div>
            </div>
            <template v-slot:loading>
                <div class="text-center q-py-md text-grey-6">加载更多…</div>
            </template>
            <div v-if="allLoaded && userList.length > 0" class="text-center q-py-md text-grey-5">已加载完全</div>
        </QInfiniteScroll>
        <QDialog v-model="showCreateDialog" persistent>
            <QCard style="min-width: 350px">
                <QCardSection class="text-h6">新建用户</QCardSection>
                <QCardSection>
                    <form @submit.prevent="handleCreateUser">
                        <QInput v-model="newUsername" placeholder="用户名" autocomplete="off" outlined dense class="q-mb-sm" />
                        <QInput v-model="newPassword" type="password" placeholder="密码（至少 6 位）" autocomplete="new-password" outlined dense class="q-mb-md" />
                        <div v-if="formError" class="error-banner q-mb-md">{{ formError }}</div>
                        <div class="row justify-end q-gutter-sm">
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
.font-mono {
    font-family: monospace;
}
.break-all {
    word-break: break-all;
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
