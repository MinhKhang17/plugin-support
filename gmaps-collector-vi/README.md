# Google Maps Collector (tiếng Việt)

Tiện ích Chrome Manifest V3 tìm kiếm một từ khóa tại nhiều khu vực, tự cuộn danh sách kết quả và lưu dữ liệu theo từng khu vực.

## Cài đặt

1. Giải nén gói công cụ vào một thư mục.
2. Mở `chrome://extensions` trong Chrome và bật **Chế độ dành cho nhà phát triển**.
3. Chọn **Tải tiện ích đã giải nén** và chọn thư mục chứa `manifest.json`.
4. Mở tiện ích trên một trang bất kỳ. Nếu tab hiện tại không phải Google Maps, công cụ sẽ tự mở Google Maps khi bắt đầu.

## Sử dụng

1. Nhập một từ khóa, ví dụ `nha khoa`.
2. Dán các khu vực, phân tách bằng dấu phẩy hoặc xuống dòng; hoặc chọn tệp CSV.
3. Nhấn **Bắt đầu cào**. Công cụ lần lượt tìm `từ khóa + khu vực` và tự chuyển sang khu vực tiếp theo.
4. Mở tiện ích trong lúc chạy để theo dõi tiến độ. Đóng popup không làm dừng lượt cào.
5. Xuất CSV tổng hợp bằng nút phía trên hoặc xuất CSV riêng ở từng dòng khu vực.

Khi cào, tiện ích tự thêm `?hl=en` vào URL Google Maps để giao diện và dữ liệu nguồn được hiển thị bằng tiếng Anh.

### Định dạng CSV xuất

CSV xuất ra có đúng thứ tự cột sau:

```csv
Keyword,Area,Name,Rating,ReviewCount,Category,Address,OpenStatus,Phone,Website,GoogleMapsURL,CollectedAt
```

### Định dạng CSV khu vực

Mỗi hàng chứa một khu vực. Công cụ nhận cột đầu tiên, hoặc ưu tiên cột có tiêu đề `Khu vực`, `Area`, `Region` hay `Location`.

```csv
Khu vực
Cần Thơ
Vĩnh Long
Trà Vinh
```

## Ghi chú

- Tối đa 200 khu vực trong một lượt chạy. Lượt cào có thể mất thời gian tùy lượng kết quả và tốc độ tải của Google Maps.
- Dữ liệu thu thập được lưu trong bộ nhớ tiện ích để có thể tiếp tục theo dõi khi đóng popup. Nút **Dừng** giữ lại dữ liệu đã có.
- Cách Google Maps hiển thị kết quả có thể thay đổi; một số trường thông tin có thể trống nếu không xuất hiện trong thẻ kết quả.
