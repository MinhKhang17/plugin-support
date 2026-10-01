# Facebook Business Contacts 1.0

## Cài đặt
1. Giải nén ZIP vào một thư mục cố định.
2. Mở `chrome://extensions`, bật **Developer mode**.
3. Chọn **Load unpacked**, chọn thư mục chứa `manifest.json`.
4. Đăng nhập Facebook bằng trình duyệt của bạn như bình thường.

## Sử dụng
1. Mở `https://www.facebook.com/profile.php?id=61590146927480&sk=following` và hiển thị danh sách **Đang theo dõi / Following**.
2. Bấm biểu tượng extension để mở tab công cụ. Chọn tab Facebook ở bước 1.
3. Bấm **Thu thập danh sách**. Công cụ đọc các tên/liên kết đang hiển thị và cuộn tối đa số lượt đã đặt. Có thể bấm lại để bổ sung các mục chưa thu được.
4. Kiểm tra danh sách, chỉ đánh dấu các **fanpage doanh nghiệp** bạn muốn xử lý. Danh sách ứng viên có thể có liên kết gợi ý ngoài Following. Extension chưa thể bảo đảm phân biệt toàn bộ các mục đó.
5. Bấm **Quét các fanpage đã chọn**. Công cụ mở lần lượt tab thông tin liên hệ, đọc nội dung công khai đang hiển thị và đóng tab do nó tạo.
6. Bấm **Xuất CSV**. Các cột là `Name,FacebookURL,Address,Phone,Email`. Thiếu thông tin thì để trống. Nhiều giá trị trong một ô ngăn bằng `;`.

## Dừng và tiếp tục
- Giữ tab công cụ mở khi chạy. Bấm Dừng để kết thúc sau thao tác đang diễn ra.
- Dữ liệu được lưu vào bộ nhớ cục bộ của extension sau mỗi trang.
- Nếu đóng tab hoặc Chrome, mở công cụ và bấm quét lại để xử lý những mục đã chọn chưa hoàn tất. Một tab Facebook do extension mở có thể còn lại nếu bạn đóng công cụ đột ngột; có thể đóng tab đó thủ công.
- Bản ghi hoàn tất không bị quét lại. Các mục lỗi hoặc chưa xác minh có thể thử lại.
- Xóa dữ liệu chỉ xóa bản lưu cục bộ của extension; không xóa file CSV đã tải xuống.

## Phạm vi và giới hạn
- Chỉ lấy liên hệ công khai của fanpage doanh nghiệp. Extension yêu cầu dòng phân loại `Page · ...` hoặc `Trang · ...` có loại hình kinh doanh hỗ trợ, chẳng hạn Dog breeder, Pet service, Store hoặc Company.
- Hồ sơ cá nhân và trang thiếu dấu hiệu phân loại được bỏ qua khi lấy liên hệ, không xuất CSV. Tên và liên kết ứng viên vẫn hiện trong bảng để bạn xem.
- Không suy đoán email, không tự vào website bên ngoài, không đọc nội dung riêng tư, không dùng API nội bộ Facebook và không vượt CAPTCHA hay giới hạn truy cập.
- Chỉ hỗ trợ tên nhãn tiếng Anh/tiếng Việt và giao diện `www.facebook.com` trên máy tính. Facebook có thể thay đổi cấu trúc giao diện; phần không đọc được sẽ trống hoặc được đánh dấu chưa xác minh.
- Tốc độ mặc định: một trang mỗi lần, tối thiểu 15 giây giữa hai lần mở trang; thời gian chờ tải tối đa 45 giây. Đây không phải bảo đảm tài khoản sẽ không bị Facebook giới hạn.
- Số điện thoại/email trên giao diện có thể đã sai hoặc lỗi thời. Hãy đối chiếu mẫu với fanpage trước khi sử dụng kết quả. Tên, địa chỉ và liên hệ của bài đăng/bình luận không được chủ động thu thập.
- File CSV bảo vệ các ô có thể bị phần mềm bảng tính hiểu là công thức bằng dấu nháy đơn đầu ô; dấu `+` của điện thoại vẫn được giữ.
- Không gửi dữ liệu ra máy chủ ngoài. Không có analytics. Các quyền chỉ gồm storage, scripting và quyền truy cập `https://www.facebook.com/*`.

## Kiểm tra
Đã có kiểm tra tự động cho URL, xuất CSV, loại bỏ số trùng và nhánh xác minh loại trang. Chưa kiểm thử trực tiếp trên phiên Facebook đăng nhập thực tế của bạn; đây là bản đầu để kiểm tra với một số fanpage trước khi chạy danh sách lớn.

Tham khảo API Chrome: https://developer.chrome.com/docs/extensions/reference/api/scripting
