<script setup>
import JSEncrypt from 'jsencrypt'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { request } from '@/common/request.js'

const router = useRouter()
const route = useRoute()

const publicKeyPem = ref('')
const loadError = ref('')
const usernameInput = ref('')
const passwordInput = ref('')
const submitError = ref('')
const submitErrorType = ref('error')
const isSubmitting = ref(false)
const isSignupPanel = ref(false)

const syncHashToSignupPanel = () => {
    isSignupPanel.value = route.hash === '#signup'
}

onMounted(() => {
    loadPublicKey()
    syncHashToSignupPanel()
})

watch(() => route.hash, syncHashToSignupPanel)

const avatarPreview = ref('')
const avatarFile = ref(null)
const avatarPicker = ref(null)

const signupForm = ref({
    username: '',
    password: '',
    confirmPassword: '',
    nickname: '',
    avatar: '',
})

const onAvatarPicked = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
            let w = img.width
            let h = img.height
            const max = 64
            if (w > max || h > max) {
                const ratio = Math.min(max / w, max / h)
                w = Math.round(w * ratio)
                h = Math.round(h * ratio)
            }
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, w, h)
            signupForm.value.avatar = canvas.toDataURL('image/png')
            avatarPreview.value = signupForm.value.avatar
        }
        img.src = e.target.result
    }
    reader.readAsDataURL(file)
    avatarFile.value = null
}

const loadPublicKey = async () => {
    loadError.value = ''
    try {
        const response = await request('/api/auth/public-key')
        if (!response.ok) {
            loadError.value = '公钥拉取失败，刷新页面重试。'
            submitErrorType.value = 'warning'
            return
        }
        const data = await response.json()
        publicKeyPem.value = data.publicKeyPem || ''
        if (!publicKeyPem.value) {
            loadError.value = '服务端未返回公钥。'
            submitErrorType.value = 'warning'
        }
    } catch {
        loadError.value = '网络错误，拿不到公钥。'
        submitErrorType.value = 'warning'
    }
}

const buildEncryptedPassword = () => {
    const encryptor = new JSEncrypt()
    encryptor.setPublicKey(publicKeyPem.value)
    return encryptor.encrypt(passwordInput.value)
}

const goSignupHash = () => {
    router.replace({
        path: '/login',
        hash: '#signup',
        query: { ...route.query },
    })
}

const goLoginHash = () => {
    router.replace({
        path: '/login',
        hash: '',
        query: { ...route.query },
    })
}

const handleSignup = async () => {
    submitError.value = ''
    if (!signupForm.value.username.trim()) {
        submitError.value = '请输入用户名'
        submitErrorType.value = 'warning'
        return
    }
    if (signupForm.value.password.length < 6) {
        submitError.value = '密码至少 6 位'
        submitErrorType.value = 'warning'
        return
    }
    if (signupForm.value.password !== signupForm.value.confirmPassword) {
        submitError.value = '两次密码不一致'
        submitErrorType.value = 'warning'
        return
    }
    if (!signupForm.value.nickname.trim()) {
        submitError.value = '请输入昵称'
        submitErrorType.value = 'warning'
        return
    }

    isSubmitting.value = true
    try {
        const response = await request('/api/users', {
            method: 'POST',
            body: JSON.stringify({
                username: signupForm.value.username.trim(),
                password: signupForm.value.password,
                nickname: signupForm.value.nickname.trim() || undefined,
                avatar: signupForm.value.avatar || undefined,
            }),
        })
        if (!response.ok) {
            const err = await response.json().catch(() => '')
            submitError.value = err || '注册失败'
            submitErrorType.value = 'error'
            return
        }

        usernameInput.value = signupForm.value.username.trim()
        passwordInput.value = signupForm.value.password
        await handleSubmit()
    } catch {
        submitError.value = '网络错误，注册失败'
        submitErrorType.value = 'error'
    } finally {
        isSubmitting.value = false
    }
}

const resetLogin = () => {
    usernameInput.value = ''
    passwordInput.value = ''
    submitError.value = ''
}

const resetSignup = () => {
    signupForm.value = { username: '', password: '', confirmPassword: '', nickname: '', avatar: '' }
    avatarPreview.value = ''
    avatarFile.value = null
    submitError.value = ''
}

const handleSubmit = async () => {
    submitError.value = ''
    if (!usernameInput.value.trim() || !passwordInput.value) {
        submitError.value = '用户名和密码都得填'
        submitErrorType.value = 'warning'
        return
    }
    isSubmitting.value = true
    try {
        await loadPublicKey()
        if (!publicKeyPem.value) {
            submitError.value = '公钥还没准备好，等一下再点'
            submitErrorType.value = 'warning'
            return
        }
        const encryptedPassword = buildEncryptedPassword()
        if (!encryptedPassword) {
            submitError.value = '密码 RSA 加密失败，检查公钥或浏览器环境'
            submitErrorType.value = 'error'
            return
        }
        const response = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                username: usernameInput.value.trim(),
                encryptedPassword,
            }),
        })
        if (!response.ok) {
            const errorMessage = await response.json().catch(() => '')
            submitError.value = errorMessage || '登录失败，请稍后重试'
            submitErrorType.value = 'error'
            return
        }
        const redirectTarget =
            typeof route.query.redirect === 'string' && route.query.redirect
                ? route.query.redirect
                : '/'
        await router.replace(redirectTarget)
    } catch {
        submitError.value = '请求炸了，网络有问题吧'
        submitErrorType.value = 'error'
    } finally {
        isSubmitting.value = false
    }
}
</script>

<template>
    <div class="login-page">
        <div class="login-bg" />
        <div style="width: 100%; max-width: 400px; position: relative; z-index: 1;">
            <div class="text-center q-mb-lg">
                <div class="text-h4 q-mb-xs" style="letter-spacing: 0.15em; font-weight: 800; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">GAME8</div>
                <div class="login-subtitle">游戏平台</div>
            </div>

            <QCard class="login-card">
                <template v-if="!isSignupPanel">
                    <QCardSection class="text-center">
                        <div class="text-h6 text-white">进入游戏</div>
                    </QCardSection>

                    <QSeparator />

                    <QCardSection>
                        <QBanner v-if="loadError" type="warning" class="q-mb-md">
                            <template v-slot:avatar><QIcon name="warning" /></template>
                            {{ loadError }}
                        </QBanner>

                        <QForm @submit="handleSubmit" @reset="resetLogin" class="q-gutter-md">
                            <QInput
                                v-model="usernameInput"
                                filled
                                dark
                                label="用户名 *"
                                hint="请输入用户名"
                                autocomplete="username"
                                lazy-rules
                                :rules="[val => !!val || '请输入用户名']"
                            />

                            <QInput
                                v-model="passwordInput"
                                filled
                                dark
                                type="password"
                                label="密码 *"
                                hint="请输入密码"
                                autocomplete="current-password"
                                lazy-rules
                                :rules="[val => !!val || '请输入密码']"
                            />

                            <QBanner v-if="submitError" :class="submitErrorType === 'warning' ? 'bg-warning-1 text-warning-8' : 'bg-negative-1 text-negative'">
                                <template v-slot:avatar><QIcon :name="submitErrorType === 'warning' ? 'warning' : 'error'" /></template>
                                {{ submitError }}
                            </QBanner>

                            <div class="q-gutter-sm">
                                <QBtn type="submit" label="进入游戏" class="full-width submit-btn text-white" :loading="isSubmitting" :disable="isSubmitting" />
                                <QBtn type="reset" flat label="重置" class="full-width reset-btn" :disable="isSubmitting" />
                            </div>
                        </QForm>

                        <div class="text-center q-mt-md text-caption login-toggle">
                            没有账号？
                            <QBtn flat dense color="primary" label="注册" @click="goSignupHash" class="q-ml-xs" />
                        </div>
                    </QCardSection>
                </template>

                <template v-else>
                    <QCardSection class="text-center">
                        <div class="text-h6 text-white">注册</div>
                    </QCardSection>

                    <QSeparator />

                    <QCardSection>
                        <QBanner v-if="loadError" type="warning" class="q-mb-md">
                            <template v-slot:avatar><QIcon name="warning" /></template>
                            {{ loadError }}
                        </QBanner>

                        <QForm @submit="handleSignup" @reset="resetSignup" class="q-gutter-md">
                            <QInput
                                v-model="signupForm.username"
                                filled
                                dark
                                label="用户名 *"
                                hint="请输入用户名"
                                autocomplete="username"
                                lazy-rules
                                :rules="[val => !!val || '请输入用户名']"
                            />

                            <QInput
                                v-model="signupForm.password"
                                filled
                                dark
                                type="password"
                                label="密码 *"
                                hint="至少 6 位"
                                autocomplete="new-password"
                                lazy-rules
                                :rules="[
                                    val => !!val || '请输入密码',
                                    val => val.length >= 6 || '密码至少 6 位'
                                ]"
                            />

                            <QInput
                                v-model="signupForm.confirmPassword"
                                filled
                                dark
                                type="password"
                                label="确认密码 *"
                                hint="再次输入密码"
                                autocomplete="new-password"
                                lazy-rules
                                :rules="[
                                    val => !!val || '请确认密码',
                                    val => val === signupForm.password || '两次密码不一致'
                                ]"
                            />

                            <QInput
                                v-model="signupForm.nickname"
                                filled
                                dark
                                label="昵称 *"
                                hint="请输入昵称"
                                lazy-rules
                                :rules="[val => !!val || '请输入昵称']"
                            />

                            <QFile
                                ref="avatarPicker"
                                v-model="avatarFile"
                                accept="image/*"
                                @update:model-value="onAvatarPicked"
                                style="display: none"
                            />
                            <div class="row items-center q-gutter-sm">
                                <QAvatar v-if="avatarPreview" size="40px" class="shadow-1">
                                    <img :src="avatarPreview">
                                </QAvatar>
                                <QBtn flat dense color="primary" size="sm" icon="add_photo_alternate" @click="avatarPicker.pickFiles()">
                                    {{ avatarPreview ? '更换头像' : '上传头像' }}
                                </QBtn>
                            </div>

                            <QBanner v-if="submitError" :class="submitErrorType === 'warning' ? 'bg-warning-1 text-warning-8' : 'bg-negative-1 text-negative'">
                                <template v-slot:avatar><QIcon :name="submitErrorType === 'warning' ? 'warning' : 'error'" /></template>
                                {{ submitError }}
                            </QBanner>

                            <div class="q-gutter-sm">
                                <QBtn type="submit" label="注 册" class="full-width submit-btn text-white" :loading="isSubmitting" :disable="isSubmitting" />
                                <QBtn type="reset" flat label="重置" class="full-width reset-btn" :disable="isSubmitting" />
                            </div>
                        </QForm>

                        <div class="text-center q-mt-md text-caption login-toggle">
                            已有账号？
                            <QBtn flat dense color="primary" label="登录" @click="goLoginHash" class="q-ml-xs" />
                        </div>
                    </QCardSection>
                </template>
            </QCard>
        </div>
    </div>
</template>

<style scoped>
.login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
    overflow: hidden;
}
.login-bg {
    position: absolute;
    inset: 0;
    background:
        radial-gradient(ellipse at 20% 50%, rgba(72, 50, 150, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 50%, rgba(50, 100, 200, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 0%, rgba(100, 50, 180, 0.15) 0%, transparent 40%);
    pointer-events: none;
}
.login-subtitle {
    color: rgba(255, 255, 255, 0.7);
    font-weight: 300;
}
.login-card {
    background: rgba(255, 255, 255, 0.08) !important;
    backdrop-filter: blur(12px);
    border-color: rgba(255, 255, 255, 0.12) !important;
    color: rgba(255, 255, 255, 0.9);
}
.login-card :deep(.q-separator) {
    background: rgba(255, 255, 255, 0.12);
}
.submit-btn {
    height: 48px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.1em;
    border-radius: 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    transition: transform 0.2s, box-shadow 0.2s;
}
.submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
}
.reset-btn {
    color: rgba(255, 255, 255, 0.6) !important;
}
.login-toggle {
    color: rgba(255, 255, 255, 0.5);
}
.login-toggle .q-btn {
    color: rgba(255, 255, 255, 0.9) !important;
}
</style>

