<script setup>
import { inject, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { onWsMessage } from '@/common/ws.js'
import { request } from '@/common/request.js'

const messages = ref([])
const inputText = ref('')
const messagesEndRef = ref(null)
const activeChatId = ref(null)

let cleanupWs = null

const scrollToBottom = () => {
    nextTick(() => {
        if (messagesEndRef.value) {
            messagesEndRef.value.scrollIntoView({ behavior: 'smooth' })
        }
    })
}

const loadChats = async () => {
    const res = await request('/api/chats')
    if (!res.ok) return
    const chats = await res.json()
    if (chats.length > 0) {
        activeChatId.value = chats[0].id
        loadMessages(chats[0].id)
    }
}

const loadMessages = async (chatId) => {
    const res = await request(`/api/chats/${chatId}/messages?page=1&pageSize=50`)
    if (!res.ok) return
    const result = await res.json()
    messages.value = result.data || []
    scrollToBottom()
}

onMounted(() => {
    loadChats()
    cleanupWs = onWsMessage('new_message', (msg) => {
        if (msg.chatId === activeChatId.value) {
            messages.value.push(msg)
            scrollToBottom()
        }
    })
})

onUnmounted(() => {
    if (cleanupWs) cleanupWs()
})

const sendMessage = async () => {
    const text = inputText.value.trim()
    if (!text || !activeChatId.value) return
    inputText.value = ''

    const res = await request(`/api/chats/${activeChatId.value}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
    })
    if (res.ok) {
        const msg = await res.json()
        messages.value.push(msg)
        scrollToBottom()
    }
}
</script>

<template>
    <div class="chat-overlay">
        <div class="chat-messages">
            <div v-for="msg in messages" :key="msg.id" class="chat-msg">
                <span class="msg-sender">&lt;{{ msg.senderNickname || msg.senderUsername || '系统' }}&gt;</span>
                <span class="msg-text">{{ msg.content }}</span>
            </div>
            <div ref="messagesEndRef" />
        </div>
        <div class="chat-input-line">
            <span class="chat-prompt">&gt;</span>
            <input
                v-model="inputText"
                class="chat-input"
                @keyup.enter="sendMessage"
                placeholder="输入消息..."
            />
        </div>
    </div>
</template>

<style scoped>
.chat-overlay {
    position: absolute;
    bottom: 20px;
    left: 20px;
    width: 560px;
    max-height: 280px;
    background: rgba(0, 0, 0, 0.55);
    border: 2px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 14px;
    color: #ffffff;
    pointer-events: auto;
}
.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px 10px;
    min-height: 60px;
    max-height: 220px;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
.chat-messages::-webkit-scrollbar {
    width: 4px;
}
.chat-messages::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
}
.chat-msg {
    padding: 1px 0;
    line-height: 1.5;
    word-break: break-word;
}
.msg-sender {
    color: #55ffff;
    margin-right: 6px;
}
.msg-text {
    color: #ffffff;
}
.chat-input-line {
    display: flex;
    align-items: center;
    padding: 4px 10px 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.chat-prompt {
    color: #ffffff;
    margin-right: 8px;
    font-weight: bold;
    user-select: none;
}
.chat-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 14px;
}
.chat-input::placeholder {
    color: rgba(255, 255, 255, 0.25);
}
</style>
