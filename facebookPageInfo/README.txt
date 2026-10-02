FB Page Info Scraper v2.2
=========================

SỬA LỖI v2.2
- Không còn tự mở / quét trang cá nhân của bạn.
  Nguyên nhân cũ: URL About bị tạo sai (vd. facebook.com/about) → FB redirect về profile mình.
- Chỉ mở link có username hoặc profile.php?id= hợp lệ.
- Sau mỗi lần load / chuyển About: kiểm tra URL còn đúng trang đích; nếu redirect → bỏ qua.
- 5 luồng (worker) độc lập thật sự: mỗi luồng tự nhận URL, mở tab riêng, cào, đóng tab.
  Mutex in-memory tránh 2 luồng lấy cùng 1 link.

CÀI ĐẶT
1. chrome://extensions → gỡ bản cũ (hoặc Reload).
2. Load unpacked → chọn thư mục này.
3. Đăng nhập Facebook trên Chrome.

SỬ DỤNG
1. Dán list link (mỗi dòng 1 link trang/fanpage).
2. Chọn "5 tab" → Bắt đầu.
3. 5 tab mở song song, độc lập. Có thể đóng popup.
4. Xuất CSV bất cứ lúc nào.

LƯU Ý
- Không dán link trang chủ facebook.com hoặc /home — tool sẽ bỏ qua.
- 5 luồng nhanh nhưng dễ checkpoint hơn → chia 100–200 link/lần.
- Contact chỉ lấy khi trang TỰ CÔNG KHAI (không click nút Liên hệ).
