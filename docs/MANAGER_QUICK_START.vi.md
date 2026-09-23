# Bắt đầu nhanh cho chủ doanh nghiệp và quản lý marketing

Hướng dẫn này dành cho người không viết code. Bạn trao đổi với Coding Agent bằng ngôn ngữ bình thường; Agent khởi chạy lệnh cục bộ và chuẩn bị dữ liệu tenant. Sau đó bạn dùng Canvas để xem tiến độ và duyệt nội dung.

## Mở Canvas cho business đã thiết lập

Mở project AI Marketing Department trong Coding Agent bạn đã đăng nhập, rồi gửi yêu cầu:

> Khởi chạy Local Canvas cho tenant `<slug>` trên máy này và mở trang cho tôi. Chỉ dùng workspace riêng của tenant đó. Không sửa dữ liệu hiện có, không kết nối kênh, không gửi hoặc đăng nội dung, không tạo quảng cáo và không chi tiêu. Nếu máy chủ hoặc workspace chưa sẵn sàng, hãy báo rõ điều còn thiếu và xử lý phần cài đặt cục bộ an toàn.

Thay `<slug>` bằng tên tenant mà người quản lý đã cung cấp, ví dụ `nilaza`. Mỗi Canvas chỉ đọc một tenant; muốn mở business khác thì yêu cầu Agent mở tenant đó trong một tiến trình riêng.

## Thiết lập business mới

Nếu chưa có tenant, gửi yêu cầu:

> Hãy phỏng vấn tôi từng bước để thiết lập một tenant mới trong AI Marketing Department. Hỏi về sản phẩm, đối tượng, bằng chứng cho từng tuyên bố, thương hiệu, ngôn ngữ, quyền sử dụng media, dữ liệu được phép, vai trò người duyệt, kênh và cách đo lường. Không tự suy đoán câu trả lời. Tạo workspace riêng, chạy kiểm tra readiness và dừng nếu còn thiếu bằng chứng, quyền hoặc người chịu trách nhiệm. Không yêu cầu API key của LLM; không kết nối kênh hay thực hiện hoạt động bên ngoài.

Ở alpha, cuộc phỏng vấn này diễn ra trong Coding Agent, chưa phải một wizard trực tiếp trong Canvas. Agent sẽ ghi kết quả vào tenant riêng và cho bạn kiểm tra readiness trước khi tạo task.

## Đọc và duyệt nội dung

1. Trong Canvas, mở **Nội dung** ở menu trái. Chọn trạng thái **Cần duyệt**, **Đã duyệt** hoặc **Cần sửa**; con số cạnh mỗi trạng thái cho biết có bao nhiêu hồ sơ.
2. Chọn một hồ sơ trong danh sách bên trái. Nếu nhóm đang chọn có số lượng `0`, Canvas sẽ hiện thông báo rỗng; chọn nhóm khác để tìm hồ sơ.
3. Mở **Nội dung đầy đủ** để đọc mọi biến thể và ngôn ngữ.
4. Mở **Preview theo kênh** để xem mô phỏng Facebook, Instagram, LinkedIn hoặc Blog. Chọn kênh, biến thể, ngôn ngữ và tệp media được khai báo trong task nếu có.
5. Mở **Media & nguồn** để đọc quyền sử dụng, nguồn và hướng dẫn hình ảnh; hash khớp chỉ xác nhận file không đổi kể từ QA, không tự chứng minh bản quyền. Mở **Chất lượng** để đọc QA; **Phiên bản & quyết định** để xem lịch sử.
6. Chỉ chọn **Duyệt nội bộ** hoặc **Yêu cầu sửa** sau khi xem nội dung và ghi lý do. Đây không phải quyền xuất bản.

Preview theo kênh mô phỏng vị trí copy và media để tiện đối chiếu, không cam kết giống mọi phiên bản ứng dụng của nền tảng. Nếu hồ sơ chưa đính kèm ảnh/video, Canvas sẽ nói rõ rằng chưa có tệp để xem; phần mô tả hình ảnh không phải ảnh thực.

## Khi trang hoặc hồ sơ không hiện

- Nếu toàn bộ trang không mở, yêu cầu Coding Agent khởi động lại Local Canvas cho đúng tenant rồi mở **private URL mới** mà Agent cung cấp. Máy chủ dừng hoặc khởi động lại sẽ làm phiên URL cũ hết hạn.
- Nếu trang mở nhưng danh sách trống, nhìn số đếm của ba trạng thái và chọn nhóm có hồ sơ. Hồ sơ chỉ xuất hiện sau khi Agent hoàn tất task, QA độc lập và tạo receipt hợp lệ.
- Nếu hồ sơ hiện nhưng phần chi tiết báo lỗi, tải lại trang một lần. Nếu lỗi còn, yêu cầu Agent kiểm tra trạng thái máy chủ và log; đừng gửi file tenant riêng lên repository template.

## Giới hạn hiện tại

Canvas chạy trên máy của bạn và cần một Coding Agent có quyền truy cập project cục bộ. Coding Agent vẫn chịu giới hạn gói dịch vụ, đăng nhập và mức sử dụng riêng của nó. Alpha tạo bản nháp nội bộ, xem được media đã bàn giao trong task và hỗ trợ duyệt. Canvas chưa đăng bài, gửi tin, kết nối tài khoản, tạo campaign quảng cáo hay tiêu tiền.
