# AKC Marketplace VI/ZH — phiên bản 1.5.0

## Thông số cố định

| Thông số | Giá trị |
|---|---|
| Số trang đồng thời | 1 |
| Nghỉ giữa các trang | Ít nhất 2 giây, tính từ lúc xử lý trang trước xong |
| Kích thước đợt | 20 trang xử lý thành công |
| Nghỉ sau mỗi đợt | Ít nhất 10 giây, thay cho 2 giây tại ranh giới đợt |
| Phạm vi bộ đếm | Tổng trang danh sách + trang cơ sở; không đặt lại khi đổi giai đoạn |
| Chờ tải trang | Tối đa 90 giây |
| Chờ trích xuất | Tối đa 90 giây sau khi tải trang |
| Chờ render React | 2 giây khi phần tử dữ liệu đã xuất hiện; 4 giây dự phòng khi chưa xuất hiện |
| Chạy thử | 3 trang danh sách đầu và các trang cơ sở tìm được từ đó; KHÔNG phải 3 trang tổng cộng |
| Chạy toàn bộ mặc định | Trang danh sách 1–740 và các trang cơ sở tìm được; nếu AKC hiển thị trang cuối trong pagination thì tự dừng sớm tại trang đó; URL/XPath có thể chỉnh |
| Ngôn ngữ | Tiếng Việt / 中文, ghi nhớ lựa chọn |

Thời gian xử lý thực tế được cộng thêm vào thời gian nghỉ. Máy ngủ, trình duyệt đóng hoặc lịch đánh thức của Chrome có thể làm thời gian nghỉ dài hơn. Hẹn giờ dùng mốc thời gian đã lưu để không chạy sớm hơn mốc đã đặt.

## Tự tạm dừng

- HTTP 403 từ tài liệu chính hoặc yêu cầu XHR/fetch đến marketplace.akc.org của tab do tiện ích tạo.
- Nhận diện thông báo xác minh/chặn hoặc iframe CAPTCHA đang hiển thị bằng kiểm tra nội dung trang. Đây là nhận diện theo dấu hiệu, không bảo đảm phát hiện mọi cơ chế chặn.
- Phát hiện CAPTCHA/chặn truy cập rõ ràng.

Tiện ích giữ vị trí trang chưa hoàn tất và tự thử lại tối đa 4 lần cho timeout, lỗi trích xuất, trang thông tin rỗng và worker bị gián đoạn, với thời gian chờ tăng dần. HTTP 429 sẽ tự tiếp tục sau Retry-After (hoặc 5 phút nếu máy chủ không gửi Retry-After). Trang danh sách rỗng được coi là bình thường. Sau 4 lần thất bại, URL được ghi là bỏ qua để lượt cào còn lại tiếp tục. HTTP 403 và CAPTCHA vẫn cần kiểm tra thủ công. Thời hạn Retry-After đã ghi nhận được giữ riêng, không bị xóa bởi nút Đặt lại.

Khi bấm Tạm dừng lúc đang xử lý, tab hiện tại có thể mất thêm thời gian để kết thúc; trang chưa được ghi nhận sẽ được thử lại khi tiếp tục. Bấm Chạy thử / Chạy toàn bộ bắt đầu lượt mới và xóa kết quả lượt trước; hãy xuất dữ liệu trước. Đặt lại xóa tiến độ và kết quả.

## Cài đặt

1. Giải nén ZIP vào một thư mục cố định.
2. Mở chrome://extensions, bật Developer mode (Chế độ dành cho nhà phát triển).
3. Nếu cài song song với bản cũ, tắt bản cũ trước để tránh hai tiện ích chạy cùng lúc.
4. Chọn Load unpacked (Tải tiện ích đã giải nén), chọn thư mục AKC_Marketplace_VI_ZH_1_2 chứa manifest.json.
5. Mở tiện ích, chọn Tiếng Việt / 中文. Kiểm tra khung thông số và URL/XPath trước khi bắt đầu.

Cài từ thư mục mới tạo tiện ích có kho dữ liệu riêng. Để cập nhật và giữ tiến độ bản cũ: sao lưu thư mục cũ và xuất CSV, chép các tệp mới đè vào đúng thư mục đang được Chrome nạp rồi bấm Reload. Chỉ cập nhật khi đã tạm dừng.

## Quyền và phạm vi

Quyền webRequest mới chỉ quan sát phản hồi trên marketplace.akc.org để nhận diện 403/429 và Retry-After; không sửa hoặc vượt qua phản hồi. Không đổi IP, không giả mạo dấu vân tay, không giải CAPTCHA tự động. Các thông số là giới hạn tải của tiện ích, không phải hạn mức được AKC chấp thuận hoặc cam kết không bị chặn.

Giao diện điều khiển có hai ngôn ngữ. Dữ liệu trích xuất giữ nguyên ngôn ngữ nguồn; tiêu đề CSV/HTML kế thừa bản gốc tiếng Trung.

## Facebook

Trình trích xuất Facebook nhận cả liên kết chữ, liên kết chỉ có icon/ảnh/SVG, thuộc tính `data-*`, `onclick`, URL chuyển hướng có Facebook trong query string và URL trong dữ liệu JSON/JavaScript. Các URL chia sẻ Facebook được bỏ qua để tránh ghi nhầm thay cho trang Facebook của cơ sở.

## Kiểm tra đã thực hiện

Kiểm tra cú pháp JavaScript và mô phỏng Chrome API: lịch nghỉ 15/120 giây, ranh giới đợt 20 trang, đếm xuyên hai giai đoạn, dừng 403/429, giữ Retry-After sau Đặt lại, dừng khi phát hiện CAPTCHA hoặc không có dữ liệu, khởi tạo giao diện và lưu/chuyển Việt–Trung. Chưa chạy thu thập thực tế trên AKC hoặc kiểm chứng mọi tình huống vòng đời Chrome.

---

# 中文说明

- 同时处理1页；每页处理完成后等待至少15秒。
- 每成功处理20页等待至少120秒；此等待替代普通15秒等待。列表页与机构页统一计数。
- 页面加载和数据提取分别限时90秒。
- 小批量测试：前3个列表页及其发现的机构页；不是总共3页。
- 默认全量：列表第1–740页及发现的机构页。
- 403或验证码/拦截提示时暂停，保留未完成页面的位置。
- 超时、空机构页和中断会以退避方式自动重试最多4次；429遵守Retry-After后自动继续。空列表页视为正常；连续失败4次的URL会记录为跳过，后续采集继续。
- 弹窗显示参数、已处理页数、倒计时及暂停原因。语言选择会保存。
- 解压后在chrome://extensions开启开发者模式，点击“加载已解压的扩展程序”，选择包含manifest.json的目录。请先停用旧版本，避免同时运行。
- 新目录安装不会自动迁移旧进度。更新原目录前请暂停并导出数据。
- 浏览器休眠或调度延迟可能延长等待。处理中断后会暂停以供检查。
- 验证码检测属于启发式识别，不能识别所有拦截方式。这些参数不是AKC官方许可限额，也不保证不会被封锁。
- 保留原始导出表头（中文）及源数据语言。已通过模拟测试，尚未在AKC网站实测。
- Facebook 提取兼容纯图标/图片/SVG 链接、`data-*`、`onclick`、重定向参数及 JSON/JavaScript 中的链接；会忽略 Facebook 分享窗口链接，避免误采。
