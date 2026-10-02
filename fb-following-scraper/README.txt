CÀI ĐẶT
1. Giải nén thư mục fb-following-scraper.
2. Mở chrome://extensions -> bật "Developer mode" (Chế độ nhà phát triển).
3. Bấm "Load unpacked" -> chọn thư mục fb-following-scraper.

SỬ DỤNG
1. Mở facebook.com/<tên-người-dùng>/following (trang "Đang theo dõi"). Nếu tab đã mở trước khi cài, bấm F5.
2. Bấm icon extension -> "Bắt đầu cào". Extension tự cuộn và thu thập.
3. Bấm "Xuất CSV" bất cứ lúc nào để tải file (mở được bằng Excel, đúng font tiếng Việt).

LƯU Ý
- Chỉ nên dùng cho danh sách của chính tài khoản bạn. Tự động hóa có thể vi phạm điều khoản Facebook và dẫn đến checkpoint; đừng chạy liên tục nhiều lần.
- Facebook đổi giao diện có thể làm lọc link cần chỉnh lại (hàm normalizeProfileUrl / findAvatar trong content.js).
