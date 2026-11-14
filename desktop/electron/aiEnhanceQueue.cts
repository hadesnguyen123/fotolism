/** Bound CPU/RAM use and share an in-flight request with duplicate callers. */
export class AiEnhanceQueue {
    private tail: Promise<unknown> = Promise.resolve()
    private pending = new Map<string, Promise<unknown>>()

    run<T>(key: string, work: () => Promise<T>): Promise<T> {
        const existing = this.pending.get(key)
        if (existing) return existing as Promise<T>
        const job = this.tail.then(work)
        this.pending.set(key, job)
        this.tail = job.then(() => undefined, () => undefined)
        const clear = () => {
            if (this.pending.get(key) === job) this.pending.delete(key)
        }
        void job.then(clear, clear)
        return job
    }
}
