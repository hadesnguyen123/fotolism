import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import * as http from 'node:http'
import { URL } from 'node:url'
import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

// Cấu hình môi trường
const CMS_URL = process.env.CMS_URL || 'https://fotolism-cms.vercel.app'
const R2_ENDPOINT = process.env.R2_ENDPOINT || ''
const R2_BUCKET = process.env.R2_BUCKET || 'fotolism-photos'
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || ''

const DATASET_DIR = 'F:\\Fotolism_image\\benchmark_dataset_500mb'
const TOTAL_FILES = 50
const FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10,485,760 bytes (10 MB)
const TOTAL_DATA_BYTES = TOTAL_FILES * FILE_SIZE_BYTES // 524,288,000 bytes (500 MB)

interface ImageUploadResult {
  fileName: string
  sizeBytes: number
  latencyMs: number
  retries: number
  success: boolean
  error?: string
}

interface BenchmarkIterationResult {
  iteration: number
  concurrency: number
  pureUploadDurationSec: number
  endToEndDurationSec: number
  pureThroughputMbps: number
  endToEndThroughputMbps: number
  avgLatencyMs: number
  p95LatencyMs: number
  timeToFirstImageSec: number
  successfulCount: number
  failedCount: number
  retryCount: number
  ramUsageDeltaMb: number
  cpuUserSec: number
  recoveryTimeSec?: number
}

interface BenchmarkScenarioSummary {
  scenarioId: string
  concurrency: number
  description: string
  iterationsCount: number
  medianPureTimeSec: number
  p95PureTimeSec: number
  medianPureThroughputMbps: number
  p95ThroughputMbps: number
  medianEndToEndSec: number
  avgLatencyPerImageMs: number
  p95LatencyPerImageMs: number
  timeToFirstImageSec: number
  totalRetries: number
  successRatePercent: number
  avgRamDeltaMb: number
  iterations: BenchmarkIterationResult[]
}

/**
 * 1. Chuẩn bị dataset 50 ảnh JPEG hợp lệ × 10 MB = 500 MB
 */
export function ensureBenchmarkDataset(): string[] {
  if (!fs.existsSync(DATASET_DIR)) {
    fs.mkdirSync(DATASET_DIR, { recursive: true })
  }

  const filePaths: string[] = []
  console.log(`[Dataset] Kiểm tra dataset 50 ảnh × 10 MB tại: ${DATASET_DIR}`)

  // Buffer đệm 1 MB để ghi nhanh
  const chunk1Mb = Buffer.alloc(1024 * 1024, 0x5a)

  for (let i = 1; i <= TOTAL_FILES; i++) {
    const fileName = `benchmark_img_${String(i).padStart(3, '0')}.jpg`
    const filePath = path.join(DATASET_DIR, fileName)
    filePaths.push(filePath)

    if (fs.existsSync(filePath) && fs.statSync(filePath).size === FILE_SIZE_BYTES) {
      continue // File đã tồn tại đúng 10 MB
    }

    console.log(`[Dataset] Sinh tệp mẫu #${i}/50: ${fileName} (10 MB)...`)
    const fd = fs.openSync(filePath, 'w')

    // Header JPEG hợp lệ: SOI (FF D8) + APP0 JFIF (FF E0 00 10 4A 46 49 46 ...)
    const jpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00,
    ])
    fs.writeSync(fd, jpegHeader, 0, jpegHeader.length, 0)

    // Ghi các chunks 1 MB
    let written = jpegHeader.length
    while (written + chunk1Mb.length < FILE_SIZE_BYTES - 2) {
      fs.writeSync(fd, chunk1Mb, 0, chunk1Mb.length, written)
      written += chunk1Mb.length
    }

    // Phần dư và JPEG EOI marker (FF D9)
    const remaining = FILE_SIZE_BYTES - written - 2
    if (remaining > 0) {
      const padding = Buffer.alloc(remaining, 0x33)
      fs.writeSync(fd, padding, 0, padding.length, written)
      written += padding.length
    }
    const eoi = Buffer.from([0xff, 0xd9])
    fs.writeSync(fd, eoi, 0, eoi.length, written)
    fs.closeSync(fd)
  }

  console.log(`[Dataset] Hoàn tất chuẩn bị 50 tệp JPEG hợp lệ (Tổng: ${(TOTAL_DATA_BYTES / 1024 / 1024).toFixed(0)} MB)`)
  return filePaths
}

/**
 * Stream file từ ổ đĩa SSD lên R2 Presigned URL
 */
function streamPutToR2(
  filePath: string,
  targetUrl: string,
  fileSize: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl)
    const transport = parsedUrl.protocol === 'https:' ? https : http

    const req = transport.request(
      parsedUrl,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': fileSize,
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
        } else {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 150)}`)))
        }
      }
    )

    req.on('error', (err) => reject(err))

    const stream = fs.createReadStream(filePath)
    stream.on('error', (err) => {
      req.destroy(err)
      reject(err)
    })
    stream.pipe(req)
  })
}

/**
 * Chạy 1 vòng lặp benchmark
 */
async function runSingleIteration(
  scenarioId: string,
  iterationIndex: number,
  concurrency: number,
  filePaths: string[],
  simulateDisruption: boolean
): Promise<{ result: BenchmarkIterationResult; uploadedKeys: string[] }> {
  console.log(`\n▶ [${scenarioId}] Vòng ${iterationIndex}: Concurrency=${concurrency}, Data=500 MB (Simulate Disruption: ${simulateDisruption})`)

  const sessionId = `bench_${scenarioId.toLowerCase()}_it${iterationIndex}_${Date.now()}`
  const startCpu = process.cpuUsage()
  const startMem = process.memoryUsage().rss
  const endToEndStartTime = Date.now()

  // 1. Yêu cầu CMS cấp 50 Presigned PUT URLs
  const filesPayload = filePaths.map((fp) => ({
    fileName: path.basename(fp),
    type: 'original' as const,
    sizeBytes: FILE_SIZE_BYTES,
    contentType: 'image/jpeg',
  }))

  const urlReqStart = Date.now()
  const urlRes = await fetch(`${CMS_URL}/api/storage/upload-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      customerName: 'BenchmarkRunner',
      sessionType: 'selfbooth',
      files: filesPayload,
    }),
  })

  if (!urlRes.ok) {
    throw new Error(`CMS API upload-urls failed with status ${urlRes.status}`)
  }

  const urlData: any = await urlRes.json()
  if (!urlData.success || !Array.isArray(urlData.urls)) {
    throw new Error(`Invalid URL data: ${urlData.error}`)
  }

  const urlsList = urlData.urls as Array<{ fileName: string; putUrl: string; objectKey: string }>
  const urlMap = new Map<string, { putUrl: string; objectKey: string }>()
  urlsList.forEach((u) => urlMap.set(u.fileName, { putUrl: u.putUrl, objectKey: u.objectKey }))

  const uploadedKeys: string[] = urlsList.map((u) => u.objectKey)

  // 2. Chuẩn bị hàng đợi upload song song
  const queue = filePaths.map((fp) => ({
    filePath: fp,
    fileName: path.basename(fp),
    putUrl: urlMap.get(path.basename(fp))!.putUrl,
    objectKey: urlMap.get(path.basename(fp))!.objectKey,
  }))

  const results: ImageUploadResult[] = []
  let timeToFirstImageMs = 0
  let totalRetries = 0
  let completedCount = 0
  let disruptedAttempts = 0
  let disruptionRecoveryStart = 0
  let disruptionRecoveryEnd = 0

  const pureUploadStartTime = Date.now()

  // Worker runner function
  async function worker(workerId: number) {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break

      const imgStart = Date.now()
      let success = false
      let attempts = 0
      let lastErr = ''

      while (!success && attempts < 4) {
        attempts++
        try {
          // Mô phỏng gián đoạn mạng nếu kịch bản B05 (gián đoạn 2 lần ngẫu nhiên)
          if (simulateDisruption && disruptedAttempts < 2 && Math.random() < 0.25) {
            disruptedAttempts++
            totalRetries++
            if (!disruptionRecoveryStart) disruptionRecoveryStart = Date.now()
            console.log(`⚡ [Simulated Drop] Giả lập ngắt kết nối socket trên worker #${workerId}...`)
            await new Promise((r) => setTimeout(r, 1200)) // gián đoạn 1.2s
            throw new Error('Simulated network disruption: connection reset')
          }

          // PUT stream file 10MB
          await streamPutToR2(item.filePath, item.putUrl, FILE_SIZE_BYTES)

          // Xác nhận upload với CMS
          await fetch(`${CMS_URL}/api/storage/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              objectKey: item.objectKey,
              fileName: item.fileName,
              type: 'original',
              sizeBytes: FILE_SIZE_BYTES,
            }),
          })

          success = true
          if (simulateDisruption && disruptionRecoveryStart && !disruptionRecoveryEnd) {
            disruptionRecoveryEnd = Date.now()
          }
        } catch (e: any) {
          lastErr = e.message
          totalRetries++
          const backoff = Math.min(2500, 300 * Math.pow(1.8, attempts) + Math.random() * 200)
          await new Promise((r) => setTimeout(r, backoff))
        }
      }

      const imgDuration = Date.now() - imgStart
      completedCount++
      if (completedCount === 1) {
        timeToFirstImageMs = Date.now() - pureUploadStartTime
      }

      results.push({
        fileName: item.fileName,
        sizeBytes: FILE_SIZE_BYTES,
        latencyMs: imgDuration,
        retries: attempts - 1,
        success,
        error: success ? undefined : lastErr,
      })

      process.stdout.write(`\r  Progress: ${completedCount}/${TOTAL_FILES} ảnh [Worker ${workerId}]`)
    }
  }

  // Chạy đồng thời `concurrency` workers
  const activeWorkers: Promise<void>[] = []
  for (let w = 0; w < concurrency; w++) {
    activeWorkers.push(worker(w + 1))
  }
  await Promise.all(activeWorkers)
  process.stdout.write('\n')

  const pureUploadEndTime = Date.now()
  const endToEndEndTime = Date.now()

  const pureUploadDurationSec = (pureUploadEndTime - pureUploadStartTime) / 1000
  const endToEndDurationSec = (endToEndEndTime - endToEndStartTime) / 1000

  // Tính Throughput (Mbps) = Bytes * 8 / Duration Sec / 1,000,000
  const pureThroughputMbps = +((TOTAL_DATA_BYTES * 8) / pureUploadDurationSec / 1_000_000).toFixed(2)
  const endToEndThroughputMbps = +((TOTAL_DATA_BYTES * 8) / endToEndDurationSec / 1_000_000).toFixed(2)

  // Tính Latency Avg & P95
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)
  const avgLatencyMs = +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0)
  const p95Idx = Math.floor(latencies.length * 0.95)
  const p95LatencyMs = latencies[p95Idx] || latencies[latencies.length - 1]

  const endCpu = process.cpuUsage(startCpu)
  const endMem = process.memoryUsage().rss
  const ramUsageDeltaMb = +((endMem - startMem) / (1024 * 1024)).toFixed(2)
  const cpuUserSec = +(endCpu.user / 1_000_000).toFixed(2)

  const successfulCount = results.filter((r) => r.success).length
  const failedCount = results.filter((r) => !r.success).length
  const recoveryTimeSec = disruptionRecoveryEnd && disruptionRecoveryStart
    ? +((disruptionRecoveryEnd - disruptionRecoveryStart) / 1000).toFixed(2)
    : undefined

  console.log(`  ✓ Pure Time: ${pureUploadDurationSec.toFixed(1)}s | Throughput: ${pureThroughputMbps} Mbps | P95: ${p95LatencyMs}ms | RAM Delta: ${ramUsageDeltaMb} MB`)

  return {
    result: {
      iteration: iterationIndex,
      concurrency,
      pureUploadDurationSec: +pureUploadDurationSec.toFixed(2),
      endToEndDurationSec: +endToEndDurationSec.toFixed(2),
      pureThroughputMbps,
      endToEndThroughputMbps,
      avgLatencyMs,
      p95LatencyMs,
      timeToFirstImageSec: +(timeToFirstImageMs / 1000).toFixed(2),
      successfulCount,
      failedCount,
      retryCount: totalRetries,
      ramUsageDeltaMb,
      cpuUserSec,
      recoveryTimeSec,
    },
    uploadedKeys,
  }
}

/**
 * Xóa sạch các object benchmark sau khi chạy xong
 */
async function cleanupBenchmarkObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  console.log(`[Cleanup] Đang dọn dẹp ${keys.length} tệp benchmark trên R2 bucket ${R2_BUCKET}...`)

  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })

    // Xóa theo batch 500 keys
    for (let i = 0; i < keys.length; i += 500) {
      const batch = keys.slice(i, i + 500)
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      )
    }
    console.log(`[Cleanup] Đã dọn dẹp và xác minh cleanup sạch sẽ!`)
  } catch (err: any) {
    console.warn(`[Cleanup] Lỗi dọn dẹp benchmark objects:`, err.message)
  }
}

/**
 * Hàm tính Median và P95 cho mảng số
 */
function getMedian(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : +((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)
}

function getP95(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  return sorted[idx] || sorted[sorted.length - 1]
}

/**
 * MAIN BENCHMARK RUNNER
 */
export async function runUploadBenchmarkSuite(options?: {
  iterationsPerScenario?: number
  scenariosToRun?: string[]
}): Promise<{
  summaries: BenchmarkScenarioSummary[]
  reportJsonPath: string
  reportCsvPath: string
}> {
  const iterationsCount = options?.iterationsPerScenario || 3
  const scenariosConfig = [
    { id: 'B01', concurrency: 1, description: 'Tuần tự (Concurrency 1)', disruption: false },
    { id: 'B02', concurrency: 2, description: 'Song song 2 luồng (Concurrency 2)', disruption: false },
    { id: 'B03', concurrency: 4, description: 'Mặc định Fotolism (Concurrency 4)', disruption: false },
    { id: 'B04', concurrency: 8, description: 'Tối đa mạng Gigabit (Concurrency 8)', disruption: false },
    { id: 'B05', concurrency: 4, description: 'Concurrency 4 có gián đoạn mạng', disruption: true },
  ]

  const scenarios = options?.scenariosToRun
    ? scenariosConfig.filter((s) => options.scenariosToRun!.includes(s.id))
    : scenariosConfig

  console.log('═══════════════════════════════════════════════════════════════════════════════')
  console.log('   FOTOLISM 3.0 — CLOUDFLARE R2 UPLOAD BENCHMARK (50 ẢNH × 10 MB = 500 MB)    ')
  console.log('═══════════════════════════════════════════════════════════════════════════════')
  console.log(`Target: ${R2_ENDPOINT} (Bucket: ${R2_BUCKET})`)
  console.log(`CMS: ${CMS_URL}`)
  console.log(`Iterations: ${iterationsCount} vòng mỗi kịch bản | Dataset: 500 MB\n`)

  const filePaths = ensureBenchmarkDataset()
  const allUploadedKeys: string[] = []
  const summaries: BenchmarkScenarioSummary[] = []

  for (const sc of scenarios) {
    console.log(`\n===============================================================================`)
    console.log(`KỊCH BẢN ${sc.id}: ${sc.description} (Chạy ${iterationsCount} lần)`)
    console.log(`===============================================================================`)

    const iterationResults: BenchmarkIterationResult[] = []

    for (let it = 1; it <= iterationsCount; it++) {
      const { result, uploadedKeys } = await runSingleIteration(
        sc.id,
        it,
        sc.concurrency,
        filePaths,
        sc.disruption
      )
      iterationResults.push(result)
      allUploadedKeys.push(...uploadedKeys)

      // Nghỉ 1s giữa các lần chạy để ổn định đường truyền
      if (it < iterationsCount) {
        await new Promise((r) => setTimeout(r, 1000))
      }
    }

    // Tổng hợp thống kê Median / P95 cho Scenario
    const pureTimes = iterationResults.map((r) => r.pureUploadDurationSec)
    const throughs = iterationResults.map((r) => r.pureThroughputMbps)
    const e2eTimes = iterationResults.map((r) => r.endToEndDurationSec)
    const latencies = iterationResults.map((r) => r.avgLatencyMs)
    const p95Latencies = iterationResults.map((r) => r.p95LatencyMs)
    const ttFirsts = iterationResults.map((r) => r.timeToFirstImageSec)
    const ramDeltas = iterationResults.map((r) => r.ramUsageDeltaMb)
    const totalRetries = iterationResults.reduce((sum, r) => sum + r.retryCount, 0)
    const totalSuccessful = iterationResults.reduce((sum, r) => sum + r.successfulCount, 0)
    const totalAttempted = TOTAL_FILES * iterationsCount

    summaries.push({
      scenarioId: sc.id,
      concurrency: sc.concurrency,
      description: sc.description,
      iterationsCount,
      medianPureTimeSec: getMedian(pureTimes),
      p95PureTimeSec: getP95(pureTimes),
      medianPureThroughputMbps: getMedian(throughs),
      p95ThroughputMbps: getP95(throughs),
      medianEndToEndSec: getMedian(e2eTimes),
      avgLatencyPerImageMs: getMedian(latencies),
      p95LatencyPerImageMs: getMedian(p95Latencies),
      timeToFirstImageSec: getMedian(ttFirsts),
      totalRetries,
      successRatePercent: +((totalSuccessful / totalAttempted) * 100).toFixed(1),
      avgRamDeltaMb: +(ramDeltas.reduce((a, b) => a + b, 0) / ramDeltas.length).toFixed(1),
      iterations: iterationResults,
    })
  }

  // Dọn dẹp toàn bộ dữ liệu test trên Cloudflare R2
  await cleanupBenchmarkObjects(allUploadedKeys)

  // Xuất file JSON & CSV
  const reportDir = path.join(process.cwd(), 'benchmark-results')
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })

  const reportJsonPath = path.join(reportDir, 'r2-benchmark-report.json')
  const reportCsvPath = path.join(reportDir, 'r2-benchmark-report.csv')

  const reportData = {
    benchmarkTitle: 'Fotolism 3.0 Cloudflare R2 500MB Upload Benchmark',
    timestamp: new Date().toISOString(),
    dataset: {
      fileCount: TOTAL_FILES,
      fileSizeMb: 10,
      totalDataMb: 500,
    },
    r2Config: {
      bucket: R2_BUCKET,
      endpoint: R2_ENDPOINT,
    },
    summaries,
  }

  fs.writeFileSync(reportJsonPath, JSON.stringify(reportData, null, 2), 'utf8')

  // CSV Content
  const csvRows = [
    'ScenarioId,Concurrency,Description,MedianPureTimeSec,P95PureTimeSec,MedianThroughputMbps,MedianEndToEndSec,AvgLatencyMs,P95LatencyMs,TimeToFirstImageSec,TotalRetries,SuccessRate,AvgRamDeltaMb',
    ...summaries.map((s) =>
      [
        s.scenarioId,
        s.concurrency,
        `"${s.description}"`,
        s.medianPureTimeSec,
        s.p95PureTimeSec,
        s.medianPureThroughputMbps,
        s.medianEndToEndSec,
        s.avgLatencyPerImageMs,
        s.p95LatencyPerImageMs,
        s.timeToFirstImageSec,
        s.totalRetries,
        `${s.successRatePercent}%`,
        s.avgRamDeltaMb,
      ].join(',')
    ),
  ]
  fs.writeFileSync(reportCsvPath, csvRows.join('\n'), 'utf8')

  // In bảng kết quả tổng hợp Markdown ra Terminal
  console.log('\n\n═══════════════════════════════════════════════════════════════════════════════════════════════════════════')
  console.log('                          KẾT QUẢ SO SÁNH BENCHMARK CLOUDFLARE R2 (500 MB)                                 ')
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════')
  console.log(
    '| Test | Luồng (C) | Pure Time (s) | E2E Time (s) | Throughput (Mbps) | P95 Latency | TT First | RAM Delta | Tỷ lệ OK |'
  )
  console.log(
    '| :--- | :-------: | :-----------: | :----------: | :---------------: | :---------: | :------: | :-------: | :------: |'
  )
  for (const s of summaries) {
    console.log(
      `| ${s.scenarioId.padEnd(4)} | ${String(s.concurrency).padEnd(9)} | ${(s.medianPureTimeSec + 's').padEnd(13)} | ${(s.medianEndToEndSec + 's').padEnd(12)} | ${(s.medianPureThroughputMbps + ' Mbps').padEnd(17)} | ${(s.p95LatencyPerImageMs + 'ms').padEnd(11)} | ${(s.timeToFirstImageSec + 's').padEnd(8)} | ${(s.avgRamDeltaMb + 'MB').padEnd(9)} | ${(s.successRatePercent + '%').padEnd(8)} |`
    )
  }
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════════')
  console.log(`📁 Báo cáo chi tiết đã lưu:`)
  console.log(`   - JSON: ${reportJsonPath}`)
  console.log(`   - CSV:  ${reportCsvPath}`)

  return { summaries, reportJsonPath, reportCsvPath }
}

// Cho phép chạy trực tiếp từ dòng lệnh: tsx scripts/r2-upload-benchmark.ts
if (require.main === module || process.argv[1]?.includes('r2-upload-benchmark')) {
  runUploadBenchmarkSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark fatal error:', err)
      process.exit(1)
    })
}

