/** Bound CPU/RAM use with configurable concurrency and share in-flight requests with duplicate callers. */
export class AiEnhanceQueue {
    private active = 0
    private waiting: Array<() => void> = []
    private pending = new Map<string, Promise<unknown>>()

    constructor(private readonly concurrency = 1) {}

    private acquire(): Promise<void> {
        if (this.active < this.concurrency) {
            this.active += 1
            return Promise.resolve()
        }
        return new Promise((resolve) => this.waiting.push(resolve))
    }

    private release() {
        this.active -= 1
        const next = this.waiting.shift()
        if (next) {
            this.active += 1
            next()
        }
    }

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
