/**
 * @file aiEnhanceQueue.cts
 * Quản lý hàng đợi xử lý ảnh AI cục bộ với giới hạn số tác vụ đồng thời (concurrency),
 * tái sử dụng tiến trình đang chạy cho các yêu cầu trùng lặp để tiết kiệm CPU/RAM.
 */

/**
 * Hàng đợi kiểm soát tải xử lý AI, chống quá tải phần cứng Kiosk.
 */
export class AiEnhanceQueue {
    private active = 0
    private waiting: Array<() => void> = []
    private pending = new Map<string, Promise<unknown>>()

    /**
     * Khởi tạo hàng đợi với số lượng tác vụ AI chạy đồng thời tối đa.
     * @param concurrency Giới hạn tác vụ xử lý cùng lúc (mặc định 1 để đảm bảo CPU/GPU ổn định cho LiveView).
     */
    constructor(private readonly concurrency = 1) {}

    /**
     * Xin cấp slot xử lý; nếu hàng đợi đã đầy sẽ xếp hàng chờ đến khi có slot trống.
     */
    private acquire(): Promise<void> {
        if (this.active < this.concurrency) {
            this.active += 1
            return Promise.resolve()
        }
        return new Promise((resolve) => this.waiting.push(resolve))
    }

    /**
     * Giải phóng một slot xử lý và đánh thức tác vụ tiếp theo đang chờ trong hàng đợi.
     */
    private release() {
        this.active -= 1
        const next = this.waiting.shift()
        if (next) {
            this.active += 1
            next()
        }
    }

    /**
     * Thực thi tác vụ AI theo khóa định danh (deduplication key).
     * Nếu tác vụ cùng key đang chạy dở, trả về luôn Promise đó thay vì gọi lặp lại.
     *
     * @template T Kiểu dữ liệu trả về của tác vụ.
     * @param key Khóa định danh tác vụ (thường gắn với đường dẫn hoặc hash ảnh).
     * @param work Hàm bất đồng bộ thực hiện xử lý ảnh AI.
     * @returns Kết quả xử lý ảnh từ tác vụ đã hoàn thành.
     */
    run<T>(key: string, work: () => Promise<T>): Promise<T> {
        const existing = this.pending.get(key)
        if (existing) return existing as Promise<T>
        const job = this.acquire().then(async () => {
            try {
                return await work()
            } finally {
                this.release()
            }
        })
        this.pending.set(key, job)
        const clear = () => {
            if (this.pending.get(key) === job) this.pending.delete(key)
        }
        void job.then(clear, clear)
        return job
    }
}

