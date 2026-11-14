let requestedSession: string | null = null
export function requestReferencePrint(sessionId: string | undefined) { requestedSession = sessionId || null }
export function consumeReferencePrint(sessionId: string | undefined) {
    if (!sessionId || requestedSession !== sessionId) return false
    requestedSession = null
    return true
}
