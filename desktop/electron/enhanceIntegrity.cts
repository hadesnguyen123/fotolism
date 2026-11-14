import * as fs from 'fs'
import * as path from 'path'

/** Keep an AI output already in final/ as the single official file. */
export function enhancedFinalPath(source: string, finalDir: string, fallbackName: string): string {
    return path.resolve(path.dirname(source)) === path.resolve(finalDir)
        ? source
        : path.join(finalDir, fallbackName)
}

/** A RAW copy with a different filename is still not an enhanced source. */
export function assertEnhancedFile(rawPath: string, enhancedPath: string): void {
    if (!enhancedPath || !fs.existsSync(enhancedPath)) {
        throw new Error('Ảnh AI chưa sẵn sàng; chưa thể tạo ảnh final.')
    }
    if (!rawPath || !fs.existsSync(rawPath)) {
        throw new Error('Không tìm thấy ảnh gốc để xác minh kết quả AI.')
    }
    if (path.resolve(rawPath) === path.resolve(enhancedPath)) {
        throw new Error('AI chưa xử lý ảnh; nguồn final vẫn là ảnh gốc.')
    }
    const rawSize = fs.statSync(rawPath).size
    const enhancedSize = fs.statSync(enhancedPath).size
    if (!enhancedSize || (rawSize === enhancedSize && fs.readFileSync(rawPath).equals(fs.readFileSync(enhancedPath)))) {
        throw new Error('Ảnh enhance là bản sao RAW; chưa thể tạo ảnh final.')
    }
}
