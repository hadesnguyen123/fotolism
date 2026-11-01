async function testWebhook(url) {
  console.log('Testing webhook URL:', url)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_connection',
        folderName: 'Fotolism_Test_Ping',
        files: []
      }),
      redirect: 'follow'
    })
    console.log('HTTP Status Code:', res.status)
    const text = await res.text()
    if (res.status === 401 || text.includes('Không tìm thấy trang') || text.includes('accounts.google.com')) {
      if (text.includes('Không tìm thấy trang')) {
        console.log('RESULT: ❌ Đường link Webhook URL này không tồn tại hoặc đã bị thay thế bởi link mới khi bạn bấm Triển khai trên Google Apps Script.')
        console.log('➔ Hãy mở script.google.com > Triển khai > Quản lý bản triển khai > Copy lại đúng đường dẫn Web app URL mới.')
      } else {
        console.log('RESULT: ❌ Google đang chặn truy cập hoặc yêu cầu đăng nhập tài khoản Google.')
      }
    } else {
      try {
        const json = JSON.parse(text)
        console.log('RESULT: ✅ THÀNH CÔNG -', json)
      } catch {
        console.log('RESULT: Phản hồi không phải JSON:', text.slice(0, 300))
      }
    }
  } catch (err) {
    console.error('RESULT: ❌ Lỗi mạng:', err.message)
  }
}

const testUrl = process.argv[2] || 'https://script.google.com/macros/s/AKfycbw2koNyt_6qjUzZn9waLYL4eDv_YbRrp7PuZoPHgJoFZVETOKEnMdo_nbfyHm9BzvI1/exec'
testWebhook(testUrl)

