# Thu thập liên hệ Website — 1.0.0

## Cài đặt

1. Giải nén ZIP thành một thư mục trên máy tính.
2. Mở `chrome://extensions` trong Chrome hoặc `edge://extensions` trong Edge.
3. Bật **Chế độ dành cho nhà phát triển / Developer mode**.
4. Chọn **Tải tiện ích đã giải nén / Load unpacked** và chọn thư mục `website-contact-collector` chứa `manifest.json`.
5. Bấm biểu tượng extension để mở bảng điều khiển tiếng Việt.

Không cần npm, API key hoặc máy chủ. Cần Chrome 114 trở lên hoặc Edge tương thích Manifest V3. Edge chưa được kiểm thử trực tiếp.

## Dùng với file Google Maps của bạn

1. Chọn `gmaps_dog_breeders_merged(1).csv`.
2. Kiểm tra **Cột chứa website** đang chọn `Website`.
3. Bấm **Nạp danh sách từ file**.
4. Bấm **Bắt đầu / Tiếp tục**.
5. Bấm **Xuất CSV** khi cần, kể cả chưa chạy hết.

Bộ đọc đã đối chiếu file bạn cung cấp: 882 dòng, 726 dòng có URL hợp lệ, 681 URL khác nhau, 156 dòng trống website. Các con số này mô tả đầu vào, không phải kết quả đã truy cập website. Các dòng có cùng URL sau chuẩn hóa dùng lại kết quả trong cùng lượt chạy nhưng vẫn giữ từng dòng xuất tương ứng. Hai đường dẫn khác nhau cùng tên miền chưa được tự gộp để tránh bỏ sót nội dung.

Cũng có thể dán mỗi URL trên một dòng hoặc nhập TXT. CSV dấu phẩy, dấu chấm phẩy và tab được nhận diện; dấu nháy và xuống dòng trong ô được giữ đúng.

## Luồng xử lý

- Mở URL đã nhập bằng tab trình duyệt riêng; bỏ tham số tracking thông dụng và fragment. Có thể chọn 1–12 website chạy đồng thời; mặc định 3, khuyến nghị 4–8. Mặc định nghỉ giữa các trang là 1 giây; có thể đặt 0 để chạy liên tục khi website chịu tải tốt. Nếu Chrome dùng nhiều RAM hoặc website bắt đầu chặn, giảm về 2–3.
- Khi chạy nhiều luồng, tối đa 3 worker được phép xử lý cùng một hostname để tránh dồn tải vào một website; các worker còn lại xử lý domain khác.
- **Fast mode** chỉ đọc trang hiện tại và trang gốc, bỏ qua Contact/About và Facebook để ưu tiên tốc độ. Khi Fast mode bật, timeout trang được giới hạn tối đa 5 giây và không lấy Facebook ID.
- Khi trang đã có email và điện thoại, công cụ dừng mở các trang bổ sung và không dò Facebook. Bật **Bắt buộc lấy Facebook ID** nếu vẫn cần Facebook ID trong trường hợp này.
- Nếu trang lỗi: thử bỏ query, quay về trang gốc rồi thử biến thể có/không có `www` khi phù hợp. Không xóa tùy tiện đường dẫn trước lần thử đầu.
- Cuộn đầu trang, giữa trang và cuối trang để kích hoạt nội dung tải chậm. Đọc email/số điện thoại hiển thị, `mailto:`, `tel:`, thông tin có cấu trúc của tổ chức và email công khai được Cloudflare mã hóa.
- Email/Gmail và số điện thoại luôn là hai loại dữ liệu bắt buộc cần tìm. Nếu thiếu một trong hai, công cụ đọc thêm trang gốc và các link Contact/About/Liên hệ có cùng hostname (có thể khác `www`). Tối đa 3 trang liên hệ theo mặc định, chỉnh được từ 0 đến 6.
- Ở **Nguồn mạng xã hội cần dò**, chọn **Facebook**, **Instagram** hoặc **Facebook và Instagram**. Khi còn thiếu email/Gmail hoặc số điện thoại, công cụ mở tối đa 2 hồ sơ công khai từ nguồn đã chọn để tìm dữ liệu. Instagram được ghi ở các cột `InstagramURL`, `InstagramSource` và `InstagramSearchStatus`.
- Khi chọn Facebook, công cụ tìm link Facebook từ website, bỏ các link chia sẻ bài viết và đăng nhập. Link Facebook có thể nằm trong chữ, icon/ảnh/SVG, `data-*`, `onclick`, URL chuyển hướng hoặc dữ liệu JSON/JavaScript.
- Lượt dò Facebook chạy độc lập với email/điện thoại: luôn quét trang gốc và các trang nội bộ có khả năng chứa liên kết (About, Contact, Team, Company, Social, Resources…). Điều chỉnh giới hạn 1–20 trang trong ô **Số trang dò Facebook / web**; mặc định 12. CSV ghi URL nguồn, cách phát hiện và trạng thái lượt dò Facebook.
- Thử tối đa 2 trang Facebook liên kết. Với mỗi trang: đọc trang chính, `/about/`, `/about_contact_and_basic_info/` hoặc tham số `sk` cho `profile.php`. Chỉ dừng tìm liên hệ sớm khi đã có cả email và điện thoại.
- Facebook ID được lấy theo URL numeric, đối tượng có vanity khớp tên trang hoặc metadata trang. Các trường ID chung trong script chỉ được xem là ứng viên; thử tối đa 2 ứng viên, xác minh qua chuyển hướng khớp chính xác URL trang.
- Lưu tiến độ sau từng trang đã đọc và từng dòng hoàn tất. Trường không tìm thấy giữ rỗng. Không suy đoán email từ tên công ty; Facebook ID không được chuyển thành email hay số điện thoại.

**Email không chỉ là Gmail:** `Email` là email ưu tiên (email cùng tên miền trước, sau đó Gmail và địa chỉ liên hệ); `Gmail` chỉ chứa địa chỉ `@gmail.com` nếu có. Một website đã có email tên miền và điện thoại được xem là đủ hai loại liên hệ. Tất cả email/số điện thoại phát hiện có trong `AllEmails` / `AllPhones`.

## Tạm dừng, xác minh và tiếp tục

- Giữ bảng điều khiển và Chrome mở. Có thể chuyển sang tab khác; tab nền có thể chạy chậm hơn do trình duyệt tiết lưu.
- **Tạm dừng** dừng việc chạy và chuyển tab thu thập về trang trắng. **Tiếp tục** sẽ chạy lại dòng đang dở; các dòng đã hoàn thành không bị nhân đôi.
- Nếu đóng hoặc tải lại bảng điều khiển, mở lại extension rồi nhấn **Tiếp tục**. Tiến độ được lưu trên máy trong `chrome.storage.local`. Không tự chạy khi khởi động Chrome.
- Mặc định gặp CAPTCHA hoặc yêu cầu Facebook đăng nhập sẽ tạm dừng và giữ nguyên trang để bạn xử lý thủ công. Sau khi xử lý, trở lại bảng điều khiển và bấm **Tiếp tục**; dòng hiện tại sẽ được thử lại từ đầu.
- **Bỏ qua dòng hiện tại** giữ lại thông tin đã tìm được và đánh dấu dòng đó đã bỏ qua. Sau đó bấm **Tiếp tục**.
- Có thể bỏ chọn tùy chọn dừng khi bị chặn để công cụ ghi chú và tiếp tục thử các URL còn lại. Không có chức năng vượt CAPTCHA hay tường đăng nhập.
- Nạp danh sách mới sẽ thay thế lượt chạy hiện tại sau hộp xác nhận. Xuất CSV trước để giữ kết quả.
- Chỉ một bảng điều khiển được phép chạy/ghi tiến độ tại một thời điểm.

## CSV đầu ra

| Cột | Ý nghĩa |
| --- | --- |
| SourceRow | Số dòng nguồn, tính cả hàng tiêu đề nếu CSV có tiêu đề |
| Name, Area | Tên và khu vực từ CSV đầu vào nếu có |
| Website | Địa chỉ website đầu vào |
| ResolvedURL | Trang truy cập thành công đầu tiên sau xử lý URL |
| Email, Gmail, Phone | Email ưu tiên, Gmail nếu có, điện thoại ưu tiên |
| AllEmails, AllPhones | Mọi giá trị phát hiện, cách nhau bằng dấu chấm phẩy |
| Address | Địa chỉ đường phố trích xuất từ website (ví dụ: `123 Country Road`, `12400 Hwy 71 W, Suite 200`) |
| City | Thành phố trích xuất từ website (ví dụ: `Austin`, `Dallas`) |
| State | Bang chuẩn hóa mã 2 chữ cái (ví dụ: `TX`, `CA`, `FL`) hoặc tỉnh bang Canada |
| ZipCode | Mã ZIP / bưu chính (ví dụ: `78738`, `75201-1234`) |
| Country | Quốc gia (`US`, `CA`) |
| AddressSource | URL trang nơi trích xuất được địa chỉ |
| FacebookURL | Link Facebook được phát hiện / đã thử |
| FacebookID | ID xác định được; có thể có nhiều ID nếu thử nhiều trang |
| FacebookIDStatus | Căn cứ nhận diện ID |
| FacebookIDCandidates | Ứng viên chưa được xác minh, không phải ID kết luận |
| EmailSource, PhoneSource | URL nơi tìm được email/điện thoại ưu tiên |
| Status, Notes | Trạng thái và ghi chú lỗi / thử lại |

CSV giữ mọi dòng đầu vào, kể cả URL trống và dòng chưa xử lý. Các cột khác của CSV nguồn không được đưa vào CSV liên hệ; file đầu vào không bị thay đổi. File xuất UTF-8 có BOM. Giá trị có thể bị Excel hiểu thành công thức được thêm dấu nháy đơn bảo vệ, bao gồm số điện thoại bắt đầu bằng `+`.

## Phạm vi và giới hạn

Không thể bảo đảm tìm được mọi email hay số điện thoại: thông tin có thể không công khai, nằm trong ảnh, iframe, nội dung cần thao tác đặc biệt hoặc sau đăng nhập. Phiên bản này không OCR ảnh, không tự tìm tên doanh nghiệp trên Google/Facebook khi website không có link, không bấm gửi form, không tự liên hệ với cơ sở và không vượt trang bảo vệ. Giới hạn số trang giúp tránh một website giữ hàng đợi vô thời hạn.

Thông tin trích xuất là dữ liệu ứng viên từ nguồn công khai, cần kiểm tra URL nguồn khi sử dụng. Trang Facebook có thể đổi giao diện hoặc có link đến một đối tác; ID từ metadata/vanity có căn cứ nhưng không được coi là bảo đảm tuyệt đối về quyền sở hữu doanh nghiệp. Không dùng các ID tài khoản đang đăng nhập làm kết quả.

Extension cần quyền đọc website HTTP/HTTPS để xử lý danh sách tên miền bất kỳ. Nó chỉ chèn mã đọc vào tab thu thập do nó tạo khi bạn bấm chạy. Dữ liệu và tiến độ lưu cục bộ; không có API riêng nhận dữ liệu, không gửi email/tin nhắn. Truy cập website/Facebook vẫn dùng mạng và phiên trình duyệt bình thường của bạn.

## Kiểm thử

Đã kiểm thử tự động phần đọc CSV, chuẩn hóa URL, khôi phục trang gốc, điều phối sang Facebook khi thiếu từng trường, lưu/tiếp tục, URL trùng và logic ID bằng fixture/mô phỏng. Hàm trích xuất được kiểm tra trên DOM mô phỏng. Chưa kiểm thử end-to-end bằng extension cài thật trên Chrome hoặc Facebook/website thật trong môi trường thực hiện này (không có binary trình duyệt).

Nên thử 3–5 website trước khi chạy toàn bộ. Kiểm tra EmailSource/PhoneSource và trường FacebookIDStatus. Nếu trang bị chặn, làm theo hướng dẫn tạm dừng phía trên.

Để chạy bộ kiểm thử trên máy có Node.js 20+: `node --test tests/*.test.mjs`. Không cần cài dependency.

## Ghi chú kỹ thuật

Luồng Facebook ID tham khảo mã `popup.js` trong `facebook_id_finder_extension.rar` do bạn cung cấp. Đã loại bỏ cách lấy một ID bất kỳ từ script và cách so sánh URL bằng `includes`, vì có thể nhận nhầm trang hoặc ID phiên đăng nhập. Bảng điều khiển giữ bộ điều phối hoạt động; service worker chỉ mở/focus bảng điều khiển, tránh phụ thuộc bộ đếm giờ dài trong service worker.

Tài liệu nền tảng: https://developer.chrome.com/docs/extensions/reference/api/scripting và https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
