let ws = null
let reconnectTimer = null
const listeners = new Map()
let wsConnected = false
const openCallbacks = []

export function connectWs() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onopen = () => {
        wsConnected = true
        openCallbacks.splice(0).forEach((fn) => fn())
    }

    ws.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data)
            const handlers = listeners.get(type)
            if (handlers) handlers.forEach((fn) => fn(data))
        } catch {}
    }

    ws.onclose = () => {
        wsConnected = false
        reconnectTimer = setTimeout(() => connectWs(), 3000)
    }

    ws.onerror = () => {
        ws?.close()
    }
}

export function onWsOpen(callback) {
    if (wsConnected) {
        callback()
        return () => {}
    }
    openCallbacks.push(callback)
    return () => {
        const idx = openCallbacks.indexOf(callback)
        if (idx > -1) openCallbacks.splice(idx, 1)
    }
}

export function disconnectWs() {
    clearTimeout(reconnectTimer)
    if (ws) {
        ws.onclose = null
        ws.close()
        ws = null
    }
    wsConnected = false
}

export function onWsMessage(type, handler) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
    return () => {
        const arr = listeners.get(type)
        if (arr) {
            const idx = arr.indexOf(handler)
            if (idx > -1) arr.splice(idx, 1)
        }
    }
}

export function isWsConnected() {
    return wsConnected
}

export function sendWsMessage(type, payload = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, ...payload }))
    }
}
