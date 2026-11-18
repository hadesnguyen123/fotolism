/**
 * @file enhanceIntegrity.cts
 * Kiểm tra tính toàn vẹn và hợp lệ của ảnh qua xử lý AI trước khi đưa vào bố cục khung in,
 * ngăn chặn trường hợp file ảnh hỏng, rỗng hoặc AI trả về nguyên bản ảnh RAW chưa xử lý.
 * Phụ thuộc: Node.js fs, path.
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Xác định đường dẫn file ảnh hoàn thiện cuối cùng trong thư mục final/.
 * Nếu file nguồn đã nằm sẵn trong thư mục final/, giữ nguyên đường dẫn để tránh sao chép dư thừa.
 *
 * @param source Đường dẫn file ảnh nguồn hiện tại.
 * @param finalDir Đường dẫn thư mục lưu ảnh hoàn thiện của session.
 * @param fallbackName Tên file đích nếu ảnh nguồn chưa nằm trong finalDir.
 * @returns Đường dẫn tuyệt đối chuẩn hóa của file ảnh hoàn thiện.
 */
export function enhancedFinalPath(source: string, finalDir: string, fallbackName: string): string {
    return path.resolve(path.dirname(source)) === path.resolve(finalDir)
        ? source
        : path.join(finalDir, fallbackName)
}

/**
 * Xác thực tính hợp lệ của ảnh AI trước khi đưa vào quy trình in ấn/ghép khung.
 * Ném lỗi nếu ảnh AI không tồn tại, rỗng hoặc nội dung nhị phân trùng khớp hoàn toàn với ảnh RAW gốc.
 *
 * @param rawPath Đường dẫn ảnh gốc chụp từ máy ảnh Canon.
 * @param enhancedPath Đường dẫn ảnh đã qua xử lý bởi AI service.
 * @throws {Error} Khi file không tồn tại hoặc AI chưa thực sự tạo ra ảnh mới khác ảnh gốc.
 */
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

