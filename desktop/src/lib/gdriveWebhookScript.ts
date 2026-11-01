/**
 * Google Apps Script Webhook để kết nối Fotolism với Google Drive
 * Folder ID đích: 1FcgyAe79bpnZnYgxR4i4b4qM_42oB5eU
 * 
 * HƯỚNG DẪN CÀI ĐẶT (Chỉ mất 1 phút):
 * 1. Mở https://script.google.com/
 * 2. Bấm "Dự án mới" (New project)
 * 3. Xóa code cũ và dán toàn bộ đoạn code dưới đây vào.
 * 4. Bấm "Triển khai" (Deploy) > "Tùy chọn triển khai mới" (New deployment).
 * 5. Chọn loại: "Ứng dụng web" (Web app).
 * 6. Mục "Người có quyền truy cập" (Who has access): Chọn "Bất kỳ ai" (Anyone).
 * 7. Bấm "Triển khai" và sao chép Web App URL (dạng https://script.google.com/macros/s/.../exec).
 * 8. Dán URL vào mục Quản Trị > Google Drive & Timelapse > Webhook URL trong Fotolism!
 */

export const GOOGLE_APPS_SCRIPT_SAMPLE = `function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: "Fotolism Google Apps Script Webhook đang hoạt động tốt!"
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch(parseErr) {
        data = {};
      }
    }

    // 1. Phản hồi kiểm tra kết nối từ nút "Kiểm Tra Webhook" của Kiosk
    if (data.action === 'test_connection' || data.action === 'test_ping') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Kết nối Webhook thành công! Google Apps Script hoạt động tốt."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Tìm thư mục cha (Ưu tiên: Folder ID gửi lên -> Tìm thư mục tên 'Fotolism' -> Root Drive)
    var parentFolder = null;
    if (data.parentFolderId && data.parentFolderId.length > 5 && data.parentFolderId !== '1FcgyAe79bpnZnYgxR4i4b4qM_42oB5eU') {
      try {
        parentFolder = DriveApp.getFolderById(data.parentFolderId);
      } catch(fErr) {}
    }

    if (!parentFolder) {
      // Tìm thư mục có tên 'Fotolism' trên Google Drive của bạn
      var existingFolders = DriveApp.getFoldersByName('Fotolism');
      if (existingFolders.hasNext()) {
        parentFolder = existingFolders.next();
      } else {
        // Tự tạo thư mục Fotolism ở Drive nếu chưa có
        parentFolder = DriveApp.createFolder('Fotolism');
        parentFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      }
    }

    // 3. Tự động tạo thư mục con cho phiên chụp (VD: Fotolism_2026-10-31_14h30)
    var now = new Date();
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    var timeStamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '_' + pad(now.getHours()) + 'h' + pad(now.getMinutes());
    var folderName = data.folderName || ('Fotolism_' + timeStamp);

    var newFolder = parentFolder.createFolder(folderName);
    newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 4. Đẩy từng file ảnh lên thư mục con
    if (data.files && Array.isArray(data.files)) {
      for (var i = 0; i < data.files.length; i++) {
        var fileItem = data.files[i];
        if (!fileItem || !fileItem.dataUrl) continue;
        
        var parts = fileItem.dataUrl.split(';base64,');
        if (parts.length === 2) {
          var contentType = parts[0].replace('data:', '');
          var decoded = Utilities.base64Decode(parts[1]);
          var blob = Utilities.newBlob(decoded, contentType, fileItem.name);
          newFolder.createFile(blob);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      folderId: newFolder.getId(),
      folderUrl: newFolder.getUrl(),
      folderName: folderName
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`
