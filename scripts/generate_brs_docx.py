# -*- coding: utf-8 -*-
import os
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def create_document():
    doc = Document()
    
    # ── Page Setup (A4, 1 inch margins) ──
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)

    # ── Styles ──
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(30, 41, 59) # Slate 800
    normal_style.paragraph_format.line_spacing = 1.2
    normal_style.paragraph_format.space_after = Pt(6)

    # ── Colors ──
    PRIMARY_COLOR = RGBColor(74, 46, 24)     # Fotolism Warm Dark Brown
    SECONDARY_COLOR = RGBColor(217, 119, 6)  # Warm Gold
    TITLE_COLOR = RGBColor(40, 25, 13)
    GRAY_TEXT = RGBColor(100, 116, 139)
    HEX_HEADER_BG = "4A2E18"
    HEX_LIGHT_BG = "F8FAFC"
    HEX_ALT_ROW = "F1F5F9"
    HEX_BORDER = "CBD5E1"
    HEX_CALLOUT_BG = "FEF3C7"
    HEX_CALLOUT_BORDER = "D97706"

    # Helper: Add Heading 1
    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(8)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(18)
        run.font.bold = True
        run.font.color.rgb = PRIMARY_COLOR
        return p

    # Helper: Add Heading 2
    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(14)
        run.font.bold = True
        run.font.color.rgb = SECONDARY_COLOR
        return p

    # Helper: Add Heading 3
    def add_h3(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        run = p.add_run(text)
        run.font.name = 'Calibri'
        run.font.size = Pt(12)
        run.font.bold = True
        run.font.color.rgb = PRIMARY_COLOR
        return p

    # Helper: Callout Box
    def add_callout(text, title="LƯU Ý NGHIỆP VỤ QUAN TRỌNG"):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        cell = tbl.cell(0, 0)
        cell.width = Inches(6.47)
        set_cell_background(cell, "FFFBEB")
        set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
        
        tcPr = cell._tc.get_or_add_tcPr()
        borders = parse_xml(f'''
            <w:tcBorders {nsdecls("w")}>
                <w:top w:val="none"/>
                <w:left w:val="single" w:sz="24" w:space="0" w:color="{HEX_CALLOUT_BORDER}"/>
                <w:bottom w:val="none"/>
                <w:right w:val="none"/>
            </w:tcBorders>
        ''')
        tcPr.append(borders)
        
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(3)
        run_t = p.add_run(f"📌 {title}: ")
        run_t.bold = True
        run_t.font.color.rgb = SECONDARY_COLOR
        run_t.font.size = Pt(10.5)
        
        run_c = p.add_run(text)
        run_c.font.size = Pt(10.5)
        run_c.font.color.rgb = RGBColor(74, 46, 24)
        doc.add_paragraph() # space after table

    # ═══════════════════════════════════════════════════════════════════════════
    # ── COVER / TITLE BLOCK ──
    # ═══════════════════════════════════════════════════════════════════════════
    p_pre = doc.add_paragraph()
    p_pre.paragraph_format.space_before = Pt(36)
    p_pre.paragraph_format.space_after = Pt(4)
    run_pre = p_pre.add_run("FOTOLISM PHOTOBOOTH SUITE • TÀI LIỆU QUẢN TRỊ NGHIỆP VỤ")
    run_pre.font.size = Pt(10)
    run_pre.font.bold = True
    run_pre.font.color.rgb = SECONDARY_COLOR

    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_after = Pt(8)
    run_title = p_title.add_run("TÀI LIỆU ĐẶC TẢ NGHIỆP VỤ HỆ THỐNG\n(BUSINESS REQUIREMENTS SPECIFICATION)")
    run_title.font.size = Pt(24)
    run_title.font.bold = True
    run_title.font.color.rgb = TITLE_COLOR

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_after = Pt(20)
    run_sub = p_sub.add_run("Phân tích quy trình vận hành chuỗi Photobooth, tích hợp phần cứng máy ảnh Canon & máy in nhiệt, cổng thanh toán VietQR SePay, đối soát tài chính 3 bên và phân bổ dữ liệu tối ưu.")
    run_sub.font.size = Pt(12)
    run_sub.font.color.rgb = GRAY_TEXT

    # Metadata Table
    meta_tbl = doc.add_table(rows=5, cols=2)
    meta_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_data = [
        ("Hệ thống / Sản phẩm:", "Fotolism 3.0 Photobooth & Cloud CMS"),
        ("Phiên bản tài liệu:", "3.0.0 (Tài liệu gốc tham chiếu dự án - Master Reference)"),
        ("Tác giả / Phân tích:", "Ban Kiến Trúc Hệ Thống & Kỹ Sư Nghiệp Vụ Fotolism"),
        ("Thời điểm phát hành:", "Tháng 10/2026"),
        ("Trạng thái phê duyệt:", "Bản thảo chuẩn hoá (Chờ chủ chuỗi hiệu chỉnh & chốt)")
    ]
    for i, (k, v) in enumerate(meta_data):
        row = meta_tbl.rows[i]
        c0, c1 = row.cells[0], row.cells[1]
        c0.width, c1.width = Inches(2.2), Inches(4.27)
        set_cell_background(c0, HEX_LIGHT_BG)
        set_cell_background(c1, "FFFFFF")
        set_cell_margins(c0, 60, 60, 100, 100)
        set_cell_margins(c1, 60, 60, 100, 100)
        
        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_after = Pt(2)
        r0 = p0.add_run(k)
        r0.bold = True
        r0.font.size = Pt(10)
        r0.font.color.rgb = PRIMARY_COLOR
        
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(2)
        r1 = p1.add_run(v)
        r1.font.size = Pt(10)

    doc.add_page_break()

    # ═══════════════════════════════════════════════════════════════════════════
    # ── MỤC LỤC & TỔNG QUAN ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("MỤC LỤC & DANH MỤC TRUY XUẤT NHANH")
    toc_items = [
        ("Chương 1", "Tổng quan Dự án, Tầm nhìn & Nguyên tắc Kiến trúc Cốt lõi"),
        ("Chương 2", "Các Tác nhân Hệ thống & Ma trận Phân quyền (Actors & Roles)"),
        ("Chương 3", "Quy trình Nghiệp vụ Trải nghiệm Khách hàng (Customer Journey)"),
        ("Chương 4", "Nghiệp vụ Thanh toán Tự động VietQR SePay & Xử lý Ngoại lệ"),
        ("Chương 5", "Nghiệp vụ Điều khiển Phần cứng: Canon EDSDK 64-bit & Máy in Dye-Sub"),
        ("Chương 6", "Nghiệp vụ Kế toán & Đối soát Doanh thu 3 bên (Triple Reconciliation)"),
        ("Chương 7", "Nghiệp vụ Phân phối Media & QR Delivery (Cloud Gallery)"),
        ("Chương 8", "Nghiệp vụ Vận hành Ngoại tuyến (Offline-First Policy) & Đồng bộ"),
        ("Chương 9 (Task 2)", "Phân tích Toàn diện Dữ liệu & Kiến trúc Cơ sở Dữ liệu Tối ưu Nhất"),
        ("Chương 10", "Kế hoạch Vận hành, Bảo trì & Bảng Tham chiếu Quyết định (ADR)")
    ]
    for ch, desc in toc_items:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        r_ch = p.add_run(f"• {ch}: ")
        r_ch.bold = True
        r_ch.font.color.rgb = SECONDARY_COLOR
        r_desc = p.add_run(desc)
        r_desc.font.color.rgb = RGBColor(30, 41, 59)

    add_callout(
        "Tài liệu này được biên soạn dạng chuẩn mở để chủ đầu tư/quản lý chuỗi có thể trực tiếp ghi chú, điều chỉnh giá bán, hạn mức chiết khấu và quy định vận hành. Mọi thay đổi trong tài liệu này sẽ được đồng bộ thành tiêu chuẩn code trong toàn bộ vòng đời phát triển của Fotolism.",
        "HƯỚNG DẪN THAM CHIẾU"
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 1: TỔNG QUAN HỆ THỐNG ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 1: TỔNG QUAN HỆ THỐNG & NGUYÊN TẮC CỐT LÕI")
    
    add_h2("1.1 Bối cảnh & Tầm nhìn kinh doanh")
    p = doc.add_paragraph(
        "Fotolism là giải pháp photobooth chụp ảnh thế hệ mới, được thiết kế chuyên biệt cho thị trường trung tâm thương mại, khu vui chơi, quán cà phê và sự kiện tại Việt Nam. Không dừng lại ở một ứng dụng chụp ảnh đơn lẻ, Fotolism được xây dựng thành một hệ sinh thái đồng bộ gồm: Trạm Kiosk cảm ứng tự phục vụ (Self-service Kiosk) và Trung tâm Quản trị Đám mây (Cloud CMS)."
    )
    p = doc.add_paragraph(
        "Mục tiêu kinh doanh cốt lõi của Fotolism bao gồm:\n"
        "1. Trải nghiệm khách hàng mượt mà, thời thượng: Khách hàng chỉ mất từ 90 đến 120 giây từ lúc chọn khung đến khi cầm trên tay dải ảnh in sắc nét và video hậu trường.\n"
        "2. Vận hành tự động hoá 100%: Thanh toán chuyển khoản tự động quét QR 24/7 nhận tiền trong 1 giây qua ngân hàng MBBank/SePay, không phụ thuộc nhân viên thu tiền.\n"
        "3. Chống thất thoát tài chính tuyệt đối: Áp dụng cơ chế kiểm kê đối soát 3 bên giữa Tiền ghi nhận Kiosk, Tiền thực tế vào tài khoản ngân hàng và Số lượng vật tư giấy in tiêu hao.\n"
        "4. Khả năng mở rộng không giới hạn: Thiết kế sẵn sàng cho việc mở rộng từ 2 máy ban đầu lên chuỗi 20 đến 100 máy Kiosk đa chi nhánh mà không tốn chi phí hạ tầng đắt đỏ."
    )

    add_h2("1.2 5 Nguyên tắc kiến trúc bất biến (Architectural Tenets)")
    tenets = [
        ("1. Offline-First (Ngoại tuyến là trên hết):", "Sự cố mất mạng Internet hoặc 4G chập chờn tại trung tâm thương mại tuyệt đối không được phép làm gián đoạn việc chụp ảnh, ghép khung hay in ảnh của khách. Mọi giao dịch và dữ liệu phải được lưu trữ bền vững tại Local SQLite trước khi đồng bộ lên Cloud."),
        ("2. Pure Camera (Chất lượng quang học thuần khiết):", "Sử dụng cảm biến 24MP từ thân máy Canon EOS R100/R50 chuyên nghiệp. Không lật gương (No Mirror), không áp dụng các bộ lọc làm biến dạng màu sắc quang học mặc định, tạo ra độ chi tiết và sắc thái vượt trội so với các booth dùng webcam."),
        ("3. Idempotency & Zero-Leakage (Chống trùng lặp & Rò rỉ):", "Mỗi giao dịch ngân hàng (Mã tham chiếu SePay) và mỗi lệnh chụp/in đều có định danh duy nhất (Idempotent Key). Ngăn chặn dứt điểm tình trạng quét mã nhận 2 lần tiền hoặc bấm nút làm máy in xả 2 lần giấy."),
        ("4. Lean Cloud Cost (Chi phí vận hành Cloud = 0đ):", "Tận dụng tối đa Free-tier của Supabase (PostgreSQL 500MB), Next.js Vercel, Cloudflare R2 (Miễn phí băng thông tải ảnh 0đ Egress) và OpenSSH Tunnel."),
        ("5. Separation of Concerns (Tách bạch trách nhiệm):", "Kiosk chỉ chịu trách nhiệm tương tác phần cứng và trải nghiệm khách. Cloud CMS chịu trách nhiệm chốt giá, voucher, phân phối khung ảnh và báo cáo doanh thu.")
    ]
    for title, desc in tenets:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        rt = p.add_run(f"• {title} ")
        rt.bold = True
        rt.font.color.rgb = PRIMARY_COLOR
        rd = p.add_run(desc)

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 2: CÁC TÁC NHÂN HỆ THỐNG ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 2: CÁC TÁC NHÂN HỆ THỐNG & PHÂN QUYỀN (ACTORS & ROLES)")
    p = doc.add_paragraph("Hệ sinh thái Fotolism phục vụ 5 nhóm người dùng chính và tương tác với 4 hệ thống phần cứng/dịch vụ ngoài:")

    actors_table_data = [
        ("Khách hàng (Customer)", "Người trực tiếp đứng trước Kiosk cảm ứng", "Tương tác chạm màn hình, chọn gói, quét QR thanh toán, tạo dáng chụp ảnh, trang trí sticker và nhận ảnh in kèm mã QR tải file về máy."),
        ("Nhân viên quầy (Booth Staff)", "Nhân viên hỗ trợ khách tại điểm đặt", "Hỗ trợ khách hàng lớn tuổi/trẻ em, mở khoá phiên khẩn cấp bằng mã PIN (Staff PIN: 888888) khi có sự cố mạng, thay cuộn giấy in khi sắp hết."),
        ("Quản lý chi nhánh (Store Manager)", "Quản lý giám sát 1 hoặc nhiều điểm booth", "Theo dõi doanh thu ca làm việc, đối soát số tiền mặt nhân viên nộp lại, duyệt yêu cầu in lại khi kẹt giấy, kiểm tra vật tư cuộn giấy."),
        ("Chủ chuỗi (Chain Owner)", "Chủ đầu tư toàn bộ hệ sinh thái Fotolism", "Xem báo cáo P&L lợi nhuận ròng trên điện thoại, quản lý bảng giá toàn hệ thống, tạo mã voucher khuyến mãi, quản lý phân quyền và rút tiền."),
        ("Kỹ thuật viên (Technician)", "Kỹ sư phần cứng và bảo trì hệ thống", "Hiệu chỉnh góc máy ảnh Canon, cân màu máy in DNP/HiTi, cấu hình cổng COM/USB, kiểm tra log camera daemon, cập nhật phiên bản ứng dụng.")
    ]

    tbl_actors = doc.add_table(rows=len(actors_table_data)+1, cols=3)
    tbl_actors.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_actors.rows[0].cells[0].paragraphs[0].add_run("Tác nhân (Actor)").bold = True
    tbl_actors.rows[0].cells[1].paragraphs[0].add_run("Vị trí / Thiết bị").bold = True
    tbl_actors.rows[0].cells[2].paragraphs[0].add_run("Trách nhiệm & Quyền hạn nghiệp vụ").bold = True
    
    col_widths = [Inches(1.8), Inches(1.8), Inches(2.87)]
    for row_idx, row in enumerate(tbl_actors.rows):
        is_head = (row_idx == 0)
        bg = HEX_HEADER_BG if is_head else (HEX_ALT_ROW if row_idx % 2 == 1 else "FFFFFF")
        for c_idx, cell in enumerate(row.cells):
            cell.width = col_widths[c_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, 80, 80, 100, 100)
            if is_head:
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(10)
            else:
                act, pos, duty = actors_table_data[row_idx - 1]
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(2)
                text = act if c_idx == 0 else (pos if c_idx == 1 else duty)
                r = p.add_run(text)
                r.font.size = Pt(9.5)
                if c_idx == 0:
                    r.bold = True
                    r.font.color.rgb = PRIMARY_COLOR

    doc.add_paragraph()

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 3: QUY TRÌNH TRẢI NGHIỆM KHÁCH HÀNG ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 3: QUY TRÌNH NGHIỆP VỤ TRẢI NGHIỆM KHÁCH HÀNG (CUSTOMER JOURNEY)")
    p = doc.add_paragraph(
        "Toàn bộ hành trình của khách hàng được chuẩn hoá thành 8 bước tuần tự, loại bỏ tối đa thao tác rườm rà:"
    )

    steps = [
        ("Bước 0: Màn hình chờ & Thu hút (Idle Attract Screen)", 
         "Khi không có khách, Kiosk chạy video screensaver nghệ thuật hoặc trình chiếu các dải ảnh mẫu bắt mắt. "
         "Khách chạm bất kỳ vào màn hình cảm ứng để bắt đầu phiên chụp. Hệ thống lập tức tạo mã phiên Session ID duy nhất (VD: FTL_20261030_XXXX)."),
        
        ("Bước 1: Chọn định dạng khung & Khổ in (Frame Size Selection)",
         "Khách hàng lựa chọn 1 trong 2 định dạng in tiêu chuẩn:\n"
         "• Gói Dải Strip đôi (2x6 inch): Máy in nhiệt 4x6 sẽ tự động dùng dao cắt đôi (2-cut) tạo thành 2 dải kẹp xinh xắn (Giá mặc định: 50.000 VNĐ, tối thiểu 2 dải).\n"
         "• Gói Postcard (4x6 inch): 1 tấm ảnh bưu thiếp khổ lớn nguyên bản (Giá mặc định: 70.000 VNĐ, tối thiểu 1 tấm)."),

        ("Bước 2: Chọn bố cục khung hình (Layout Selection)",
         "Tuỳ thuộc vào khổ in đã chọn ở Bước 1, Kiosk hiển thị các layout phù hợp:\n"
         "• Khổ 2x6: Bố cục 3 ô dọc (Classic 3-cut), 4 ô dọc (Standard 4-cut), hoặc 1 ô lớn kết hợp chữ nghệ thuật.\n"
         "• Khổ 4x6: Bố cục 4 ô vuông (Grid 2x2), 6 ô (Grid 2x3), hoặc 8 ô mini."),

        ("Bước 3: Chọn số lượng bản in & Nhập mã ưu đãi (Quantity & Coupon)",
         "• Khách hàng có thể tăng số lượng bản in cho nhóm bạn đi cùng. Khổ 2x6 tăng theo bước nhảy +2 dải (+25.000đ); khổ 4x6 tăng theo bước nhảy +1 tấm (+35.000đ).\n"
         "• Ô nhập mã giảm giá (Voucher): Nhập mã (ví dụ FOTOLISM10 giảm 10% hoặc mã giảm 20.000đ). Hệ thống tự động tính lại tổng tiền chốt của đơn hàng."),

        ("Bước 4: Thanh toán tự động (Automated Payment)",
         "• Hiển thị mã VietQR động được tạo chuẩn NAPAS 24/7 mang số tài khoản MBBank 03609032002 (NGUYEN HOANG).\n"
         "• Nhúng sẵn số tiền chính xác và nội dung chuyển khoản là mã đơn hàng (FTL######).\n"
         "• Thời gian chờ thanh toán: 120 giây (có thanh đếm ngược visual).\n"
         "• Khi khách chuyển khoản thành công: Webhook SePay ghi nhận biến động số dư và phản hồi trong 1.2 giây. Kiosk tự động hiện hoạt ảnh chúc mừng và chuyển vào phòng chụp.\n"
         "• Cứu hộ khẩn cấp: Nút xác nhận nhân viên bằng Staff PIN trong trường hợp khách trả tiền mặt hoặc mạng ngân hàng bị bảo trì."),

        ("Bước 5: Trải nghiệm chụp ảnh Studio Pure Camera (Photo Capture Session)",
         "• Máy ảnh Canon EOS R100 kích hoạt luồng Live View EVF 35 FPS qua cáp USB tốc độ cao.\n"
         "• Màn trập cơ học Canon xả đúng 1 nhịp tách cơ dứt khoát không có độ trễ lấy nét (Zero AF Delay) nhờ lệnh Completely_NonAF.\n"
         "• Cơ chế Pure Camera: Ảnh chụp không lật gương (No Mirror), giữ nguyên góc nhìn thực tế quang học studio.\n"
         "• Khách chụp tuần tự từng ô theo bố cục đã chọn, có đếm ngược 3s - 5s - 10s cho mỗi kiểu tạo dáng.\n"
         "• Sau mỗi kiểu, file ảnh 24MP full EXIF được truyền thẳng về máy Kiosk và ghi vào ổ đĩa F:\\Fotolism_image."),

        ("Bước 6: Trang trí dải ảnh & Bộ lọc màu (Decoration & Styling)",
         "Khách hàng tuỳ biến dải ảnh trước khi in:\n"
         "• Chọn Theme Frame: Khung viền màu pastel, phong cách Y2K, khung sinh nhật, lễ hội.\n"
         "• Bộ lọc điện ảnh (Color Filters): Vintage, B&W (Đen trắng tương phản cao), Film Warm, Korean Natural.\n"
         "• Sticker & Bút vẽ: Kéo thả sticker dễ thương và ký tên điện tử lên dải ảnh."),

        ("Bước 7: Xuất file in nhiệt & Quét QR nhận file (Printing & Delivery)",
         "• Bộ xử lý đồ hoạ Canvas kết xuất dải ảnh hoàn chỉnh ở độ phân giải 300 DPI chuẩn in ấn.\n"
         "• Gửi lệnh in trực tiếp đến máy in nhiệt DNP RX1HS qua Windows Spooler. Thời gian in: ~12 giây.\n"
         "• Màn hình hiển thị mã QR Delivery tức thì để khách hàng quét camera điện thoại tải trọn bộ: Dải ảnh hoàn thiện (JPG), Từng ảnh đơn 24MP và Video Timelapse hậu trường (MP4) về máy.\n"
         "• Hết thời gian chờ 60 giây, Kiosk tự động dọn dẹp bộ nhớ tạm và trở về Màn hình chờ (Idle Screen).")
    ]

    for title, desc in steps:
        add_h2(title)
        p = doc.add_paragraph(desc)

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 4: NGHIỆP VỤ THANH TOÁN SEPAY & TIỀN MẶT ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 4: NGHIỆP VỤ THANH TOÁN TỰ ĐỘNG VIETQR SEPAY & TIỀN MẶT")
    
    add_h2("4.1 Ma trận xử lý thanh toán VietQR SePay")
    p = doc.add_paragraph(
        "Hệ thống tích hợp cổng thanh toán tự động SePay kết nối tài khoản MBBank 03609032002 (NGUYEN HOANG). Quy trình xử lý dòng tiền tuân theo các quy tắc nghiêm ngặt:"
    )

    pay_rules = [
        ("1. Tạo mã VietQR động chuẩn EMVCo:", 
         "Mã QR được khởi tạo động chứa cả tham số &des=FTL###### (chuẩn SePay) và &addInfo=FTL###### (chuẩn VietQR NAPAS). 99% các ứng dụng ngân hàng và ví điện tử khi quét mã sẽ tự động khoá số tiền và nội dung chuyển khoản, khách hàng không thể chỉnh sửa sai lệch."),
        
        ("2. Tiếp nhận Webhook tức thì qua đường truyền riêng:",
         "SePay đẩy webhook biến động số dư qua đường hầm SSH sạch (Zero Warning Screen). Cloud CMS phản hồi HTTP 200 trong vòng dưới 50ms và lập tức ghi nhận giao dịch vào Sổ cái (Ledger)."),

        ("3. Cơ chế Khớp lệnh Cứu hộ Thông minh (Smart Match):",
         "Trong thực tế, một số ví điện tử (như ViettelMoney, ZaloPay) tự ý thay thế nội dung chuyển khoản bằng tên khách (VD: 'Nguyen Hoang chuyen tien tu ViettelMoney') làm mất mã FTL######. "
         "Khi đó, thuật toán Smart Match sẽ tự động quét các giao dịch tiền vào chưa gán mã đơn trong vòng 60 phút gần nhất. Nếu số tiền trùng khớp 100% với đơn hàng đang chờ, hệ thống lập tức ghép giao dịch và mở máy chụp ảnh."),

        ("4. Cơ chế Bảo vệ Doanh thu chống trả thiếu tiền:",
         "Nếu khách hàng chuyển thiếu tiền (Ví dụ: Đơn 70.000đ nhưng chuyển 50.000đ), cơ chế Smart Match sẽ từ chối tự động ghép đơn để bảo vệ doanh thu. Giao dịch được lưu vào trạng thái UNMATCHED và chờ quản lý xử lý."),

        ("5. Xác nhận Tiền mặt qua mã PIN Nhân viên (Staff PIN):",
         "Khi khách hàng không sử dụng tài khoản ngân hàng hoặc có sự cố mạng, nhân viên trực quầy thu tiền mặt và nhập mã PIN (mặc định: 888888). Giao dịch được lưu vào SQLite với phân loại payment_method: 'cash' và ghi nhận mã nhân viên xác nhận để đối soát cuối ca.")
    ]
    for r_title, r_desc in pay_rules:
        add_h3(r_title)
        doc.add_paragraph(r_desc)

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 5: ĐIỀU KHIỂN PHẦN CỨNG ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 5: NGHIỆP VỤ ĐIỀU KHIỂN PHẦN CỨNG (CANON EDSDK & MÁY IN)")
    
    add_h2("5.1 Tiến trình Canon EDSDK Daemon chuyên dụng (fotolism_canon_daemon.exe)")
    p = doc.add_paragraph(
        "Thay vì sử dụng các phần mềm trung gian dễ treo máy, Fotolism phát triển tiến trình C# .NET 64-bit chạy nền, nhúng trực tiếp thư viện chính hãng Canon EDSDK.dll 64-bit:\n"
        "• Lắng nghe tại cổng nội bộ http://127.0.0.1:8899/.\n"
        "• Kéo luồng Live View (EVF) 35 FPS với độ trễ < 30ms trực tiếp từ cảm biến máy ảnh.\n"
        "• Vòng lặp Keep-Alive (chống ngủ) mỗi 15 giây: Gửi lệnh kEdsCameraCommand_ExtendShutDownTimer giúp máy ảnh không bao giờ bị tắt nguồn tự động.\n"
        "• Chụp không trễ (Zero AF Shutter): Gửi lệnh Completely_NonAF, rèm trập xả đúng 1 nhịp tách dứt khoát, loại bỏ hoàn toàn hiện tượng lấy nét lại làm giật hình."
    )

    add_h2("5.2 Nghiệp vụ Máy in Nhiệt Thăng hoa (DNP RX1HS / HiTi P525L)")
    p = doc.add_paragraph(
        "Máy in nhiệt hoạt động theo cơ chế cuộn ribbon màu và cuộn giấy ép nhiệt liên tục (Dye-Sublimation):\n"
        "• Khổ 2x6: Kích hoạt tính năng cắt đôi phần cứng (2-inch cut mode) trong driver Windows. Máy tự động in 2 dải trên cùng 1 lần nạp giấy 4x6 và cắt đôi.\n"
        "• Quản lý định mức cuộn giấy: 1 cuộn giấy DNP RX1HS in được đúng 400 tấm 4x6 (tương đương 800 dải 2x6). Kiosk đếm lùi số tờ sau mỗi lệnh in và gửi cảnh báo về Cloud CMS khi cuộn giấy còn dưới 20 tấm.\n"
        "• Chống in lậu: Mọi lệnh in đều phải bắt nguồn từ một Session ID hợp lệ có hoá đơn thanh toán đi kèm."
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 6: ĐỐI SOÁT TÀI CHÍNH 3 BÊN ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 6: NGHIỆP VỤ KẾ TOÁN & ĐỐI SOÁT DOANH THU 3 BÊN (TRIPLE RECONCILIATION)")
    p = doc.add_paragraph(
        "Trong kinh doanh Photobooth, thất thoát doanh thu thường đến từ: Nhân viên thu tiền mặt nhưng không nhập hệ thống, hoặc nhân viên in ảnh riêng cho bạn bè. "
        "Fotolism 3.0 giải quyết triệt để vấn đề này bằng Mô hình Đối soát 3 Góc Độc Lập (Triple Reconciliation Matrix):"
    )

    recon_data = [
        ("Góc 1: Doanh Thu Kiosk (Kiosk Ledger)", "Phần mềm ghi nhận cục bộ", "Tổng giá trị các hoá đơn thanh toán đã chốt (Gồm VietQR SePay + Tiền mặt do nhân viên xác nhận bằng PIN)."),
        ("Góc 2: Dòng Tiền Ngân Hàng (Bank Statement)", "Tài khoản ngân hàng MBBank qua SePay", "Tổng số tiền thực tế đổ về tài khoản ngân hàng của chủ sở hữu có khớp mã đơn hàng hoặc khớp Smart Match."),
        ("Góc 3: Bộ Đếm Giấy Phần Cứng (Hardware Counter)", "Driver máy in DNP / HiTi", "Số lượt cắt giấy thực tế do cảm biến cơ học của máy in ghi lại (không thể can thiệp bằng phần mềm).")
    ]

    tbl_rec = doc.add_table(rows=4, cols=3)
    tbl_rec.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_rec.rows[0].cells[0].paragraphs[0].add_run("Góc Đối Soát").bold = True
    tbl_rec.rows[0].cells[1].paragraphs[0].add_run("Nguồn Dữ Liệu").bold = True
    tbl_rec.rows[0].cells[2].paragraphs[0].add_run("Ý Nghĩa Nghiệp Vụ Đối Chiếu").bold = True
    for r_idx, row in enumerate(tbl_rec.rows):
        is_head = (r_idx == 0)
        bg = HEX_HEADER_BG if is_head else (HEX_ALT_ROW if r_idx % 2 == 1 else "FFFFFF")
        for c_idx, cell in enumerate(row.cells):
            cell.width = col_widths[c_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, 80, 80, 100, 100)
            if is_head:
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(10)
            else:
                g, src, mean = recon_data[r_idx - 1]
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(2)
                text = g if c_idx == 0 else (src if c_idx == 1 else mean)
                r = p.add_run(text)
                r.font.size = Pt(9.5)
                if c_idx == 0:
                    r.bold = True
                    r.font.color.rgb = PRIMARY_COLOR

    doc.add_paragraph()

    add_callout(
        "CÔNG THỨC ĐỐI SOÁT BẮT BUỘC: [Tổng số bản in thực tế từ máy in] = [Số bản in theo các đơn hàng đã thanh toán] + [Số bản in lỗi được phép in lại có chụp hình bằng chứng]. Bất kỳ sai số nào vượt quá 2 bản in/ngày sẽ được hệ thống gắn cờ CẢNH BÁO GIAN LẬN gửi thông báo tức thì lên ứng dụng di động của Chủ chuỗi.",
        "CÔNG THỨC KIỂM KÊ VẬT TƯ"
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 7: PHÂN PHỐI MEDIA & QR DELIVERY ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 7: NGHIỆP VỤ PHÂN PHỐI MEDIA & QR DELIVERY")
    p = doc.add_paragraph(
        "Mỗi phiên chụp của khách hàng tạo ra 3 loại tài nguyên media chính:\n"
        "1. Dải ảnh in hoàn chỉnh (Final Composited Strip): File JPG độ phân giải 300 DPI kích thước 600x1800 (khổ 2x6) hoặc 1200x1800 (khổ 4x6).\n"
        "2. Từng ảnh đơn gốc (Single Shot Photos): File ảnh 24MP (6000x4000) chất lượng studio từ Canon EOS R100 để khách có thể phóng to hoặc đăng mạng xã hội.\n"
        "3. Video hậu trường Timelapse: Video MP4 tua nhanh tốc độ 2.5x ghi lại toàn bộ biểu cảm và khoảnh khắc tạo dáng vui nhộn của nhóm bạn."
    )
    p = doc.add_paragraph(
        "Quy trình đồng bộ và phân phối:\n"
        "• Ngay khi phiên kết thúc, Kiosk đóng gói media và tải ngầm lên Cloudflare R2 / Google Drive.\n"
        "• Mã QR hiển thị trên màn hình in chứa đường dẫn bảo mật có chữ ký thời hạn (VD: https://fotolism.app/g/FTL_20261030_XXXX).\n"
        "• Khách chỉ cần mở ứng dụng Camera trên iPhone/Android quét mã là xem được toàn bộ thư viện ảnh và video.\n"
        "• Chính sách lưu trữ: Ảnh dải in và video lưu trữ vĩnh viễn trên Cloudflare R2 (do miễn phí băng thông tải về); ảnh gốc 24MP được tự động dọn dẹp sau 30 ngày để tối ưu chi phí lưu trữ."
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 8: VẬN HÀNH NGOẠI TUYẾN (OFFLINE-FIRST) ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 8: NGUYÊN TẮC VẬN HÀNH NGOẠI TUYẾN (OFFLINE-FIRST POLICY)")
    p = doc.add_paragraph(
        "Tại các địa điểm công cộng như phố đi bộ hoặc trung tâm thương mại, kết nối Internet thường xuyên bị chập chờn. Fotolism áp dụng nguyên tắc Offline-First như một tiêu chuẩn sống còn:\n"
        "• Mọi trạng thái phiên chụp, từng tấm ảnh chụp và lịch sử in đều được lưu vào cơ sở dữ liệu SQLite cục bộ trên máy tính Kiosk trước tiên.\n"
        "• Khi mất Internet: Khách hàng vẫn thực hiện được các thao tác chọn khung, chụp ảnh, ghép dải và in ảnh bình thường (chỉ có chức năng đồng bộ Cloud và tải ảnh qua QR Internet chuyển sang lưu trữ cục bộ/Hotspot LAN dự phòng).\n"
        "• Tiến trình CloudSyncService chạy ngầm: Tự động phát hiện khi mạng Internet có trở lại và đẩy toàn bộ hàng đợi phiên tồn đọng lên Cloud CMS theo cơ chế retry có giãn cách (exponential backoff)."
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 9: PHÂN TÍCH DỮ LIỆU & DATABASE TỐI ƯU (TASK 2) ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 9: PHÂN TÍCH TOÀN DIỆN DỮ LIỆU & KIẾN TRÚC LƯU TRỮ TỐI ƯU (TASK 2)")
    
    add_h2("9.1 Bảng phân tích phân loại dữ liệu hệ thống")
    p = doc.add_paragraph(
        "Để đảm bảo tốc độ phản hồi tức thì (<16ms cho giao diện Kiosk) đồng thời đảm bảo tính toàn vẹn tuyệt đối cho dữ liệu kế toán tài chính, dữ liệu trong hệ thống Fotolism được phân loại thành 8 nhóm chuyên biệt:"
    )

    data_classification = [
        ("1. Dữ liệu Điều khiển Phần cứng", 
         "Frame buffer Live View, trạng thái máy ảnh (CONNECTED, DISCONNECTED, BUSY), nhiệt độ cảm biến, lệnh màn trập.",
         "Vô cùng nhanh, liên tục (35-40 FPS)", 
         "In-Memory C# Native / RAM Process", 
         "Không lưu đĩa; chỉ cập nhật trạng thái Live View trong bộ nhớ RAM để đảm bảo độ trễ = 0ms."),
        
        ("2. Dữ liệu Phiên & Tệp Media Cục bộ", 
         "Ảnh gốc 24MP (JPG/CR3), file dải in 300 DPI, video hậu trường MP4/WebM, metadata phiên chụp.",
         "Dung lượng lớn (20MB - 80MB/phiên)", 
         "Local NVMe/SSD Filesystem (F:\\Fotolism_image)", 
         "Lưu trực tiếp vào ổ đĩa tốc độ cao F:\\ với phân cấp thư mục theo ngày và phiên (VD: F:\\Fotolism_image\\Fotolism_20261030_...\\)."),

        ("3. Dữ liệu Hàng đợi & Trạng thái Thực thi Kiosk", 
         "Session queue, trạng thái từng shot chụp (PENDING, COMPLETED, FAILED), retry count, sync flag.",
         "Giao dịch ACID cục bộ, cần bền vững khi sập nguồn", 
         "Local SQLite (WAL Mode)", 
         "Lưu trong file SQLite cục bộ (sessionDatabase.db). Sử dụng chế độ WAL (Write-Ahead Logging) để đọc ghi đồng thời không bị khoá."),

        ("4. Dữ liệu Giao dịch Tài chính & Sổ cái", 
         "Mã đơn hàng, số tiền, ngân hàng, mã tham chiếu SePay, nội dung chuyển khoản, trạng thái đối soát.",
         "Độ tin cậy tài chính tuyệt đối, không được mất", 
         "Cloud PostgreSQL (Supabase RLS) + Kiosk SQLite", 
         "Ghi kép: Lưu tại SQLite Kiosk để hoạt động offline, đồng thời lưu tại Cloud PostgreSQL với cơ chế chống trùng lặp Idempotency."),

        ("5. Dữ liệu Vật tư & Bộ đếm Máy in", 
         "Số cuộn giấy nạp, số lượt cắt giấy cơ học, số bản in đã xuất, lý do in lại (kẹt giấy, lỗi màu).",
         "Dữ liệu kiểm kê đối soát, không cho phép sửa đổi", 
         "Local SQLite + Cloud PostgreSQL (Audit Table)", 
         "Ghi Append-Only (chỉ thêm mới, không cho phép sửa/xoá) để phục vụ kiểm toán tài chính và chống nhân viên gian lận."),

        ("6. Dữ liệu Cấu hình Kinh doanh & Khung ảnh", 
         "Bảng giá gói (2x6/4x6), danh mục Voucher giảm giá, danh sách Khung viền PNG, bố cục Layout, Sticker.",
         "Đọc thường xuyên, cập nhật định kỳ từ Cloud", 
         "Cloud PostgreSQL (Master) -> Kiosk Cache JSON/Assets", 
         "Cloud CMS là nguồn chân lý duy nhất (Single Source of Truth). Kiosk tải cache về local để nạp tức thì khi khởi động."),

        ("7. Dữ liệu Giám sát Thiết bị & Đo lường (Telemetry)", 
         "Heartbeat mỗi 60s, CPU/RAM Kiosk, dung lượng ổ cứng còn lại, nhiệt độ máy in, số lượng giấy còn lại.",
         "Thời gian thực, tần suất cao, có thể tổng hợp", 
         "Cloud PostgreSQL (TimescaleDB / Hypertable)", 
         "Dùng để hiển thị Dashboard thời gian thực cho chủ chuỗi và gửi cảnh báo khi Kiosk gặp sự cố phần cứng."),

        ("8. Dữ liệu Phân phối Khách hàng (Cloud Gallery)", 
         "Mã QR tra cứu, link tải ảnh công khai, lượt tải về, thời hạn hết hạn.",
         "Băng thông tải về cực lớn từ điện thoại khách", 
         "Object Storage (Cloudflare R2) + CDN", 
         "Cloudflare R2 miễn phí 100% chi phí băng thông tải về (Zero Egress Fee), giúp chủ chuỗi tiết kiệm hàng triệu đồng so với AWS S3.")
    ]

    tbl_data = doc.add_table(rows=len(data_classification)+1, cols=4)
    tbl_data.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_data.rows[0].cells[0].paragraphs[0].add_run("Phân Loại Dữ Liệu").bold = True
    tbl_data.rows[0].cells[1].paragraphs[0].add_run("Thuộc Tính & Đặc Điểm").bold = True
    tbl_data.rows[0].cells[2].paragraphs[0].add_run("Công Nghệ Lưu Trữ Tối Ưu").bold = True
    tbl_data.rows[0].cells[3].paragraphs[0].add_run("Lý Do Lựa Chọn & Kiến Trúc").bold = True
    
    col_w_data = [Inches(1.5), Inches(1.8), Inches(1.5), Inches(1.67)]
    for row_idx, row in enumerate(tbl_data.rows):
        is_head = (row_idx == 0)
        bg = HEX_HEADER_BG if is_head else (HEX_ALT_ROW if row_idx % 2 == 1 else "FFFFFF")
        for c_idx, cell in enumerate(row.cells):
            cell.width = col_w_data[c_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, 80, 80, 90, 90)
            if is_head:
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(9.5)
            else:
                cat, desc, prop, tech, reas = data_classification[row_idx - 1]
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(2)
                if c_idx == 0:
                    text = cat
                elif c_idx == 1:
                    text = f"{desc}\n(Đặc điểm: {prop})"
                elif c_idx == 2:
                    text = tech
                else:
                    text = reas
                r = p.add_run(text)
                r.font.size = Pt(8.5)
                if c_idx == 0 or c_idx == 2:
                    r.bold = True
                    r.font.color.rgb = PRIMARY_COLOR if c_idx == 0 else SECONDARY_COLOR

    doc.add_paragraph()

    add_h2("9.2 Kiến trúc Database Phân tầng (Tiered Database Topology)")
    p = doc.add_paragraph(
        "Hệ thống áp dụng mô hình phân tầng lưu trữ tối ưu 4 lớp:\n"
        "• Lớp 1: In-Memory RAM (C# Daemon & Zustand Store): Lưu trạng thái Live View, bộ đếm ngược, giỏ hàng phiên chụp hiện tại. Tốc độ < 1ms.\n"
        "• Lớp 2: Local SQLite WAL & Local SSD (Kiosk Máy Trạm): Lưu trữ toàn bộ lịch sử phiên chụp, dữ liệu hàng đợi đồng bộ và file ảnh 24MP/timelapse. Đảm bảo Kiosk hoạt động ngoại tuyến vĩnh viễn không phụ thuộc Internet.\n"
        "• Lớp 3: Cloud PostgreSQL (Supabase Cloud CMS): Lưu trữ sổ cái tài chính tập trung, quản lý chuỗi nhiều Kiosk, bảng giá, voucher, đối soát 3 bên và phân quyền RBAC. Hỗ trợ ACID transaction tuyệt đối.\n"
        "• Lớp 4: Cloudflare R2 Object Storage: Lưu trữ ảnh thành phẩm và video MP4 để phục vụ khách hàng quét QR tải về với chi phí băng thông 0đ."
    )

    # ═══════════════════════════════════════════════════════════════════════════
    # ── CHƯƠNG 10: KẾ HOẠCH VẬN HÀNH & KẾT LUẬN ──
    # ═══════════════════════════════════════════════════════════════════════════
    add_h1("CHƯƠNG 10: KẾ HOẠCH VẬN HÀNH & BẢNG THAM CHIẾU QUYẾT ĐỊNH (ADR)")
    
    add_h2("10.1 Bảng Tham chiếu Quyết định Thiết kế (Architecture Decision Records - ADR)")
    adrs = [
        ("ADR-01: Cổng thanh toán VietQR SePay", 
         "Lựa chọn SePay thay vì tích hợp trực tiếp từng ngân hàng", 
         "Hỗ trợ Webhook tức thì 24/7, tự động khớp lệnh qua MBBank, không yêu cầu thủ tục giấy tờ phức tạp, tích hợp sẵn tính năng tự sinh mã QR."),
        ("ADR-02: Canon EDSDK 64-bit Daemon độc lập", 
         "Phát triển daemon C# chạy cổng 8899 thay vì dùng CLI trung gian", 
         "Giải quyết triệt để lỗi màn trập tách 2 lần, tăng tốc độ Live View lên 35 FPS, chống ngủ máy ảnh và không bị treo giao diện Electron."),
        ("ADR-03: Cloudflare R2 cho QR Delivery", 
         "Lựa chọn Cloudflare R2 thay vì AWS S3 hay Google Drive API cá nhân", 
         "Không tính phí băng thông tải về (Zero Egress Fee), tốc độ CDN toàn cầu siêu nhanh trên điện thoại người dùng, chi phí lưu trữ chỉ $0.015/GB/tháng."),
        ("ADR-04: Lưu trữ kép Local SQLite + Cloud PostgreSQL", 
         "Mô hình Offline-First với SQLite cục bộ và Supabase trên Cloud", 
         "Booth tại trung tâm thương mại vẫn hoạt động 100% khi mất mạng; dữ liệu tự động đồng bộ lên Cloud khi có mạng trở lại mà không xung đột.")
    ]

    tbl_adr = doc.add_table(rows=len(adrs)+1, cols=3)
    tbl_adr.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_adr.rows[0].cells[0].paragraphs[0].add_run("Quyết Định Thiết Kế (ADR)").bold = True
    tbl_adr.rows[0].cells[1].paragraphs[0].add_run("Giải Pháp Lựa Chọn").bold = True
    tbl_adr.rows[0].cells[2].paragraphs[0].add_run("Lý Do & Giá Trị Mang Lại").bold = True
    for r_idx, row in enumerate(tbl_adr.rows):
        is_head = (r_idx == 0)
        bg = HEX_HEADER_BG if is_head else (HEX_ALT_ROW if r_idx % 2 == 1 else "FFFFFF")
        for c_idx, cell in enumerate(row.cells):
            cell.width = col_widths[c_idx]
            set_cell_background(cell, bg)
            set_cell_margins(cell, 80, 80, 100, 100)
            if is_head:
                for run in cell.paragraphs[0].runs:
                    run.font.color.rgb = RGBColor(255, 255, 255)
                    run.font.size = Pt(10)
            else:
                a_id, sol, val = adrs[r_idx - 1]
                p = cell.paragraphs[0]
                p.paragraph_format.space_after = Pt(2)
                text = a_id if c_idx == 0 else (sol if c_idx == 1 else val)
                r = p.add_run(text)
                r.font.size = Pt(9.5)
                if c_idx == 0:
                    r.bold = True
                    r.font.color.rgb = PRIMARY_COLOR

    doc.add_paragraph()

    add_h2("10.2 Kết luận & Cam kết chất lượng")
    p = doc.add_paragraph(
        "Tài liệu Đặc tả Nghiệp vụ này là khung quy chuẩn nền tảng (Master Business Requirements) cho hệ thống Fotolism 3.0. "
        "Mọi lập trình viên, kỹ sư phần cứng và nhân viên vận hành tham gia dự án đều phải tuân thủ nghiêm ngặt các quy định về Offline-First, Đối soát 3 bên và Bảo vệ dòng tiền được nêu trong tài liệu này."
    )
    p = doc.add_paragraph(
        "Chủ sở hữu có toàn quyền thay đổi các thông số bảng giá, bước nhảy bản in thêm và chính sách chiết khấu trực tiếp trên file Word này. "
        "Toàn bộ mã nguồn Fotolism sẽ tự động tham chiếu và thích ứng với các thông số kinh doanh được cập nhật."
    )

    # Save to F:\JoyBooth\FOTOLISM_NGHIEP_VU_HE_THONG.docx
    output_path = r"F:\JoyBooth\FOTOLISM_NGHIEP_VU_HE_THONG.docx"
    doc.save(output_path)
    print(f"Document created successfully at: {output_path}")

if __name__ == "__main__":
    create_document()
