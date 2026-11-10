import { app, ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { exec } from 'child_process'
import { SessionDB } from '../sessionDatabase.cjs'
import { AI_SERVICE_URL } from './common.cjs'

let isPrintSpoolerActive = false

export function registerPrinterIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('print:send', async (_event, payload: { imagePath: string; copies: number; printerName?: string }) => {
    if (isPrintSpoolerActive) {
      console.warn('[Print] BỊ CHẶN: Đang có một lệnh in khác đang xử lý trong Windows Spooler, tuyệt đối không ghi đè!')
      return { success: false, error: 'Máy in đang bận thực thi lệnh in trước, không được gửi đè lệnh in mới.' }
    }

    isPrintSpoolerActive = true
    let localTempFile = ''

    try {
      const copiesCount = Math.max(1, payload.copies || 1)
      const targetPrinter =
        payload.printerName && payload.printerName !== 'Default Windows Printer' && !payload.printerName.includes('SELPHY')
          ? payload.printerName
          : 'DS-RX1'

      console.log(`[Print] Bắt đầu gửi lệnh in ${copiesCount} bản tới máy in: "${targetPrinter}"`)
      const jobUniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

      try {
        const isDataUrl = payload.imagePath.startsWith('data:')
        if (isDataUrl) {
          const base64Data = payload.imagePath.replace(/^data:image\/\w+;base64,/, '')
          localTempFile = path.join(app.getPath('temp'), `fotolism_print_${jobUniqueId}.jpg`)
          fs.writeFileSync(localTempFile, Buffer.from(base64Data, 'base64'))
        } else if (fs.existsSync(payload.imagePath)) {
          localTempFile = payload.imagePath
        } else {
          localTempFile = path.join(app.getPath('temp'), `fotolism_print_${jobUniqueId}.jpg`)
          fs.writeFileSync(localTempFile, Buffer.from(payload.imagePath, 'base64'))
        }
      } catch (err: any) {
        console.error('[Print] Lỗi chuẩn bị file ảnh in:', err)
        return { success: false, error: `Lỗi chuẩn bị file in: ${err.message}` }
      }

      const psPrintSuccess = await new Promise<boolean>((resolve) => {
        const scriptPath = path.join(app.getPath('temp'), `print_job_${jobUniqueId}.ps1`)
        const safeImagePath = localTempFile.replace(/'/g, "''")
        const safePrinter = targetPrinter.replace(/'/g, "''")

        const psContent = `
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Drawing
  $printer = '${safePrinter}'
  $file = '${safeImagePath}'
  $copies = ${copiesCount}

  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $printer
  if (-not $doc.PrinterSettings.IsValid) {
    throw "Máy in '$printer' không khả dụng hoặc chưa kết nối!"
  }
  $doc.PrinterSettings.Copies = $copies
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.OriginAtMargins = $false

  $targetPaper = $null
  foreach ($ps in $doc.PrinterSettings.PaperSizes) {
    if ($ps.PaperName -eq 'PR (4x6)') {
      $targetPaper = $ps
      break
    }
  }
  if ($targetPaper -ne $null) {
    $doc.DefaultPageSettings.PaperSize = $targetPaper
  }

  $img = [System.Drawing.Image]::FromFile($file)
  if ($img.Width -gt $img.Height) {
    $doc.DefaultPageSettings.Landscape = $true
  } else {
    $doc.DefaultPageSettings.Landscape = $false
  }

  $doc.add_PrintPage({
    param($s, $ev)
    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $bounds = $ev.PageBounds
    $ev.Graphics.DrawImage($img, $bounds.X, $bounds.Y, $bounds.Width, $bounds.Height)
    $ev.HasMorePages = $false
  })

  $doc.Print()
  $img.Dispose()
  $doc.Dispose()
  Write-Output "PRINT_OK"
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`
        try {
          fs.writeFileSync(scriptPath, psContent, 'utf-8')
          exec(`powershell -ExecutionPolicy Bypass -NoProfile -File "${scriptPath}"`, { timeout: 15000 }, (error, stdout, stderr) => {
            try {
              fs.unlinkSync(scriptPath)
            } catch {}
            if (!error && stdout.includes('PRINT_OK')) {
              console.log(`[Print] Lệnh in PowerShell tới "${targetPrinter}" THÀNH CÔNG!`)
              resolve(true)
            } else {
              console.warn(`[Print] PowerShell print warning:`, error || stderr)
              resolve(false)
            }
          })
        } catch (e) {
          console.warn('[Print] Không thể tạo file script PowerShell:', e)
          resolve(false)
        }
      })

      const jobId = `print-${Date.now()}`

      if (psPrintSuccess) {
        try {
          SessionDB.createPrintJob({
            id: jobId,
            session_id: 'direct-print',
            file_path: localTempFile,
            copies: copiesCount,
            status: 'SUCCESS',
            printer_name: targetPrinter,
            completed_at: new Date().toISOString(),
          })
        } catch {}

        return { success: true, data: { jobId } }
      }

      console.log('[Print] Chuyển sang fallback Electron print...')
      try {
        const printWindow = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true },
        })

        const tempHtml = path.join(app.getPath('temp'), `print_page_${jobUniqueId}.html`)
        const htmlContent = `<!DOCTYPE html><html><head><style>@page{size:4in 6in;margin:0;}*{box-sizing:border-box;}html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#fff;}img{width:100vw;height:100vh;object-fit:fill;display:block;}</style></head><body><img src="${localTempFile.replace(/\\/g, '/')}" /></body></html>`
        fs.writeFileSync(tempHtml, htmlContent, 'utf-8')

        await printWindow.loadFile(tempHtml)
        await new Promise((r) => setTimeout(r, 400))

        return await new Promise((resolve) => {
          printWindow.webContents.print(
            {
              silent: true,
              printBackground: true,
              landscape: false,
              copies: copiesCount,
              margins: { marginType: 'none' },
              useDefaultPageSize: true,
              deviceName: targetPrinter,
            } as any,
            (success, failureReason) => {
              printWindow.close()
              try {
                fs.unlinkSync(tempHtml)
              } catch {}
              if (success) {
                resolve({ success: true, data: { jobId } })
              } else {
                resolve({ success: false, error: failureReason || 'In thất bại qua Windows Spooler' })
              }
            }
          )
        })
      } catch (fallbackErr: any) {
        return { success: false, error: fallbackErr.message || 'Lỗi in thất bại' }
      }
    } finally {
      isPrintSpoolerActive = false
      if (localTempFile && localTempFile.includes(app.getPath('temp')) && fs.existsSync(localTempFile)) {
        setTimeout(() => {
          try {
            if (fs.existsSync(localTempFile)) fs.unlinkSync(localTempFile)
          } catch {}
        }, 8000)
      }
    }
  })

  ipcMain.handle('print:list-printers', async () => {
    const mainWindow = getMainWindow()
    try {
      if (mainWindow && mainWindow.webContents) {
        const printers = await mainWindow.webContents.getPrintersAsync()
        if (printers && printers.length > 0) {
          return {
            success: true,
            data: {
              printers: printers.map((p) => ({
                name: p.name,
                isDefault: Boolean((p as any).isDefault || (p.options as any)?.['is-default']),
              })),
            },
          }
        }
      }
    } catch (err) {
      console.warn('getPrintersAsync error:', err)
    }

    try {
      const res = await fetch(`${AI_SERVICE_URL}/print/printers`)
      return res.json()
    } catch {
      return {
        success: true,
        data: {
          printers: [],
        },
      }
    }
  })
}
