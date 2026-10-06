# Facebook Contact Collector 1.1

## Cài đặt
1. Giải nén ZIP vào một thư mục cố định.
2. Mở `chrome://extensions`, bật **Developer mode**.
3. Chọn **Load unpacked**, chọn thư mục `facebook-business-contacts` chứa `manifest.json`.
4. Đăng nhập Facebook bằng trình duyệt của bạn như bình thường.

## Hướng dẫn sử dụng

### Bước 1 — Tạo danh sách

Chọn **một** trong hai cách sau:

1. **Lấy từ Following:** mở Facebook ở danh sách **Đang theo dõi / Following**, quay lại tab công cụ, chọn đúng tab Facebook trong danh sách rồi bấm **Thu thập danh sách**. Có thể chỉnh số lượt cuộn tối đa trước khi chạy.
2. **Dán URL trực tiếp:** trong khung **Thêm đường dẫn Facebook**, dán một URL trên mỗi dòng rồi bấm **Nạp danh sách URL**. Bộ đếm ngay dưới khung cho biết số dòng URL đã nhập. Có thể dán lại nhiều lần để bổ sung danh sách.

Các URL hợp lệ được chuẩn hóa và tự loại trùng. Hỗ trợ URL dạng `https://www.facebook.com/ten-nguoi-dung` và `https://www.facebook.com/profile.php?id=123456789`. URL trực tiếp được chọn sẵn để chạy bước 2; URL không hợp lệ sẽ bị bỏ qua và số lượng sẽ hiển thị trong thông báo.

### Bước 2 — Kiểm tra và quét

1. Dùng ô lọc để tìm theo tên, URL hoặc Facebook ID; đánh dấu những mục cần lấy thông tin.
2. Bấm **Quét các mục đã chọn**. Tool mở lần lượt từng trang thông tin công khai, lấy tên, Facebook ID, website, địa chỉ, số điện thoại và email, sau đó đóng tab tạm.
3. Theo dõi trạng thái ở bảng. **Dừng** sẽ lưu kết quả hiện có sau mục đang xử lý.

### Bước 3 — Xuất kết quả

Bấm **Xuất CSV** khi có mục hoàn tất. File gồm các cột `Name,FacebookURL,FacebookID,Website,Address,Phone,Email`; trường không hiển thị công khai sẽ để trống. Nhiều giá trị trong một ô được ngăn bằng `;`.

## Dừng và tiếp tục
- Giữ tab công cụ mở khi chạy. Bấm Dừng để kết thúc sau thao tác đang diễn ra.
- Dữ liệu được lưu vào bộ nhớ cục bộ của extension sau mỗi trang.
- Nếu đóng tab hoặc Chrome, mở công cụ và bấm quét lại để xử lý những mục đã chọn chưa hoàn tất. Một tab Facebook do extension mở có thể còn lại nếu bạn đóng công cụ đột ngột; có thể đóng tab đó thủ công.
- Bản ghi hoàn tất không bị quét lại. Các mục lỗi có thể thử lại.
- Xóa dữ liệu chỉ xóa bản lưu cục bộ của extension; không xóa file CSV đã tải xuống.

## Phạm vi và giới hạn
- Lấy thông tin công khai của cả hồ sơ cá nhân lẫn Page. Extension không xác minh hoặc phân loại doanh nghiệp.
- Facebook ID được đọc từ URL hoặc dữ liệu công khai của trang khi có; trường này có thể trống nếu Facebook không hiển thị ID.
- Website được lấy từ liên kết ngoài công khai trong trang/Giới thiệu; liên kết nội bộ Facebook, Instagram, Messenger, WhatsApp và Google Maps bị bỏ qua.
- Không suy đoán email, không tự vào website bên ngoài, không đọc nội dung riêng tư, không dùng API nội bộ Facebook và không vượt CAPTCHA hay giới hạn truy cập.
- Chỉ hỗ trợ tên nhãn tiếng Anh/tiếng Việt và giao diện `www.facebook.com` trên máy tính. Facebook có thể thay đổi cấu trúc giao diện; phần không đọc được sẽ trống hoặc được đánh dấu lỗi tải.
- Tốc độ mặc định: một trang mỗi lần, tối thiểu 15 giây giữa hai lần mở trang; thời gian chờ tải tối đa 45 giây. Đây không phải bảo đảm tài khoản sẽ không bị Facebook giới hạn.
- Số điện thoại/email trên giao diện có thể đã sai hoặc lỗi thời. Hãy đối chiếu mẫu với fanpage trước khi sử dụng kết quả. Tên, địa chỉ và liên hệ của bài đăng/bình luận không được chủ động thu thập.
- File CSV bảo vệ các ô có thể bị phần mềm bảng tính hiểu là công thức bằng dấu nháy đơn đầu ô; dấu `+` của điện thoại vẫn được giữ.
- Không gửi dữ liệu ra máy chủ ngoài. Không có analytics. Các quyền chỉ gồm storage, scripting và quyền truy cập `https://www.facebook.com/*`.

## Kiểm tra
Đã có kiểm tra tự động cho URL, xuất CSV, loại bỏ số trùng và nhánh trích xuất Facebook ID. Chưa kiểm thử trực tiếp trên phiên Facebook đăng nhập thực tế của bạn; hãy kiểm tra với một vài URL trước khi chạy danh sách lớn.

Tham khảo API Chrome: https://developer.chrome.com/docs/extensions/reference/api/scripting
