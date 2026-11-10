import { describe, it, expect, beforeEach } from 'vitest'
import { SessionDB } from '../dist-electron/sessionDatabase.cjs'
import { r2UploadWorker } from '../dist-electron/r2UploadWorker.cjs'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Fotolism 3.0 — SQLite UploadTasks Outbox & Worker Suite', () => {
  const testSessionId = `test_sess_${Date.now()}`

  beforeEach(() => {
    // Đảm bảo session tồn tại trong DB trước khi thêm upload task (foreign key)
    SessionDB.createSession({
      id: testSessionId,
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
      total_slots: 4,
      payment_status: 'PAID',
      print_copies: 1,
    })
  })

  it('OUTBOX-01: Enqueue Upload Task with PENDING status', () => {
    const task = SessionDB.enqueueUploadTask({
      id: `task_${testSessionId}_001`,
      session_id: testSessionId,
      image_id: 'img_001',
      file_path: 'C:\\test\\001.jpg',
      object_key: `fotolism-photos/${testSessionId}/originals/001.jpg`,
      size_bytes: 10485760,
      is_final: 0,
      status: 'PENDING',
      attempts: 0,
    })

    expect(task.id).toBe(`task_${testSessionId}_001`)
    expect(task.status).toBe('PENDING')
    expect(task.size_bytes).toBe(10485760)

    const fetched = SessionDB.getUploadTask(task.id)
    expect(fetched).not.toBeNull()
    expect(fetched?.object_key).toBe(`fotolism-photos/${testSessionId}/originals/001.jpg`)
  })

  it('OUTBOX-02: Priority Queue — Final composite image (is_final=1) is returned first', () => {
    // Thêm ảnh original
    SessionDB.enqueueUploadTask({
      id: `task_${testSessionId}_orig_1`,
      session_id: testSessionId,
      image_id: 'orig_1',
      file_path: 'C:\\test\\orig_1.jpg',
      object_key: `fotolism-photos/${testSessionId}/originals/orig_1.jpg`,
      size_bytes: 10485760,
      is_final: 0,
      status: 'PENDING',
      attempts: 0,
    })

    // Thêm ảnh final composite sau nhưng có is_final = 1
    SessionDB.enqueueUploadTask({
      id: `task_${testSessionId}_composite`,
      session_id: testSessionId,
      image_id: 'composite',
      file_path: 'C:\\test\\composite.jpg',
      object_key: `fotolism-photos/${testSessionId}/final/composite.jpg`,
      size_bytes: 8388608,
      is_final: 1,
      status: 'PENDING',
      attempts: 0,
    })

    const pending = SessionDB.getPendingUploadTasks(5)
    expect(pending.length).toBeGreaterThan(0)
    // Phần tử đầu tiên phải là composite (is_final = 1)
    expect(pending[0].is_final).toBe(1)
  })

  it('OUTBOX-03: Update Status and Retry Logic', () => {
    const taskId = `task_${testSessionId}_retry_test`
    SessionDB.enqueueUploadTask({
      id: taskId,
      session_id: testSessionId,
      image_id: 'retry_img',
      file_path: 'C:\\test\\retry.jpg',
      object_key: `fotolism-photos/${testSessionId}/originals/retry.jpg`,
      size_bytes: 10485760,
      is_final: 0,
      status: 'PENDING',
      attempts: 0,
    })

    // Cập nhật trạng thái UPLOADING
    SessionDB.updateUploadTaskStatus(taskId, 'UPLOADING')
    let task = SessionDB.getUploadTask(taskId)
    expect(task?.status).toBe('UPLOADING')

    // Thất bại lần 1: FAILED_RETRYABLE
    SessionDB.updateUploadTaskStatus(taskId, 'FAILED_RETRYABLE', 'Connection timeout', true)
    task = SessionDB.getUploadTask(taskId)
    expect(task?.status).toBe('FAILED_RETRYABLE')
    expect(task?.attempts).toBe(1)
    expect(task?.last_error).toBe('Connection timeout')

    // Khôi phục hàng đợi
    const retriedCount = SessionDB.retryFailedUploadTasks()
    expect(retriedCount).toBeGreaterThanOrEqual(1)

    task = SessionDB.getUploadTask(taskId)
    expect(task?.status).toBe('PENDING')
    expect(task?.last_error).toBeNull()
  })

  it('WORKER-01: R2 Upload Worker concurrency settings [1, 2, 4, 8]', () => {
    r2UploadWorker.setConcurrency(2)
    expect(r2UploadWorker.getConcurrency()).toBe(2)

    r2UploadWorker.setConcurrency(8)
    expect(r2UploadWorker.getConcurrency()).toBe(8)

    r2UploadWorker.setConcurrency(4) // Trở về mặc định 4
    expect(r2UploadWorker.getConcurrency()).toBe(4)

    // Bỏ qua giá trị không hợp lệ
    r2UploadWorker.setConcurrency(99)
    expect(r2UploadWorker.getConcurrency()).toBe(4)
  })

  it('WORKER-02: R2 Upload Worker Stats reflects SQLite counts', () => {
    const stats = r2UploadWorker.getStats()
    expect(stats.concurrency).toBe(4)
    expect(typeof stats.pendingTasks).toBe('number')
    expect(typeof stats.uploadedTasks).toBe('number')
    expect(typeof stats.failedTasks).toBe('number')
  })
})
