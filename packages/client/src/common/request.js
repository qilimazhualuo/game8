export const request = (input, init = {}) => {
    const headers = new Headers(init.headers)

    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json')
    }

    const hasRequestBody = init.body !== undefined && init.body !== null
    if (hasRequestBody && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
    }

    return fetch(input, {
        ...init,
        credentials: 'include',
        headers,
    })
}
