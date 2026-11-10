import { ipcMain } from 'electron'
import { SessionDB } from '../sessionDatabase.cjs'

export function registerSessionIpc(): void {
    ipcMain.handle('session:create', (_event, sessionData) => {
        try {
            const record = SessionDB.createSession(sessionData)
            return { success: true, data: record }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle('session:get', (_event, sessionId: string) => {
        try {
            const record = SessionDB.getSession(sessionId)
            return { success: true, data: record }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })

    ipcMain.handle(
        'session:update',
        (_event, payload: { id: string; updates: any }) => {
            try {
                SessionDB.updateSession(payload.id, payload.updates)
                return { success: true }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        }
    )

    ipcMain.handle('session:get-captures', (_event, sessionId: string) => {
        try {
            const records = SessionDB.getCaptures(sessionId)
            return { success: true, data: records }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    })
}
