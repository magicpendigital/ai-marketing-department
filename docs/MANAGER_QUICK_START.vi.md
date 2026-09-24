# Bắt đầu nhanh cho chủ doanh nghiệp và quản lý marketing

Hướng dẫn này dành cho người không viết code. Bạn trao đổi với Coding Agent bằng ngôn ngữ bình thường; Agent khởi chạy lệnh cục bộ và chuẩn bị dữ liệu tenant. Sau đó bạn dùng Canvas để xem tiến độ và duyệt nội dung.

## Mở Canvas cho business đã thiết lập

Mở project AI Marketing Department trong Coding Agent bạn đã đăng nhập, rồi gửi yêu cầu:

> Khởi chạy Local Canvas cho tenant `<slug>` trên máy này và mở trang cho tôi. Chỉ dùng workspace riêng của tenant đó. Không sửa dữ liệu hiện có, không kết nối kênh, không gửi hoặc đăng nội dung, không tạo quảng cáo và không chi tiêu. Nếu máy chủ hoặc workspace chưa sẵn sàng, hãy báo rõ điều còn thiếu và xử lý phần cài đặt cục bộ an toàn.

Thay `<slug>` bằng tên tenant mà người quản lý đã cung cấp, ví dụ `business-a`. Mỗi Canvas chỉ đọc một tenant; muốn mở business khác thì yêu cầu Agent mở tenant đó trong một tiến trình riêng.

Canvas tạo một private URL có capability. URL này là quyền truy cập workspace cục bộ: chỉ dùng trên cùng máy và không gửi cho người khác. Nếu mở trình duyệt ngoài, dùng **Sao chép link riêng** ở header của tab Canvas đã kết nối; sao chép địa chỉ gốc sau khi trang đã mở sẽ không mang theo capability. Khởi động lại server sẽ làm link cũ hết hạn.

## Thiết lập business mới

Nếu chưa có tenant, gửi yêu cầu:

> Hãy phỏng vấn tôi từng bước để thiết lập một tenant mới trong AI Marketing Department. Hỏi về sản phẩm, đối tượng, bằng chứng cho từng tuyên bố, thương hiệu, ngôn ngữ, quyền sử dụng media, dữ liệu được phép, vai trò người duyệt, kênh và cách đo lường. Không tự suy đoán câu trả lời. Tạo workspace riêng, chạy kiểm tra readiness và dừng nếu còn thiếu bằng chứng, quyền hoặc người chịu trách nhiệm. Không yêu cầu API key của LLM; không kết nối kênh hay thực hiện hoạt động bên ngoài.

Ở alpha, cuộc phỏng vấn này diễn ra trong Coding Agent, chưa phải một wizard trực tiếp trong Canvas. Agent sẽ ghi kết quả vào tenant riêng và cho bạn kiểm tra readiness trước khi tạo task.

## Đọc và duyệt nội dung

1. Trong Canvas, mở **Nội dung** ở menu trái. Chọn trạng thái **Cần duyệt**, **Đã duyệt** hoặc **Cần sửa**; con số cạnh mỗi trạng thái cho biết có bao nhiêu hồ sơ.
2. Chọn một hồ sơ trong danh sách bên trái. Nếu nhóm đang chọn có số lượng `0`, Canvas sẽ hiện thông báo rỗng; chọn nhóm khác để tìm hồ sơ.
3. Mở **Nội dung đầy đủ** để chọn một bài và xem một locale tại một thời điểm. Campaign có thể chứa nhiều bài; ngôn ngữ bổ sung chỉ cần tạo khi brief yêu cầu.
4. Khi tạo task, chọn trước Facebook, Instagram, LinkedIn và/hoặc Blog. Mục **Bài đăng preview** chỉ hiển thị đúng các kênh đã khóa trong manifest khi tạo. Nếu chọn nhiều kênh, mỗi kênh phải có copy/media riêng và được gắn `channelId`; Canvas không mượn nội dung không gắn kênh.
5. Mở **Media cuối & nguồn** để xem trực tiếp file ảnh/video đã bàn giao và đối chiếu quyền/provenance. Nếu manifest yêu cầu media mà chưa có file thật, job phải bị chặn trước QA; prompt hay visual brief không phải ảnh/video. Hash khớp chỉ xác nhận file không đổi kể từ QA, không tự chứng minh bản quyền.
6. Chỉ chọn **Duyệt nội bộ** hoặc **Yêu cầu sửa** sau khi xem nội dung và ghi lý do. Đây không phải quyền xuất bản.

7. Mở **Quy trình** để xem tất cả Agents, Sub-Agents và các bước W0/W1/W2/W6. Có thể chọn lại Sub-Agent hỗ trợ cho task W2 mới; thay đổi được lưu trong trình duyệt hiện tại và được kiểm tra lại theo roster framework khi tạo phiếu.
8. Mở tab **Quy trình & kết quả** để xem đầu ra theo từng bước. Với task mới đã chọn kênh, `agent-work-log.json` phải có kết quả concept, copy, bước media policy/sản xuất và ghép preview cuối theo từng kênh; thiếu là không thể chuyển sang chờ duyệt. Nếu media bắt buộc, W2.4 cần trỏ đến file thật có chữ ký ảnh/video hợp lệ. Nhật ký không lưu chain-of-thought. Task cũ có thể thiếu log hoặc policy media và được xem là legacy.

9. Trong **Quy trình**, sơ đồ W2 hiển thị các role theo từng bước. Bấm **Vai trò chi tiết** hoặc tên Agent/Sub-Agent để xem mục tiêu, đầu vào, kết quả, phối hợp và giới hạn quyền. Kéo thả hoặc dùng nút mũi tên để đổi thứ tự ưu tiên hai nhánh Copy/Media; bước ghép, lint, QA và duyệt cuối không thể di chuyển. Thứ tự được ghi vào manifest task mới.

10. Cũng trong **Quy trình**, mở phần hướng dẫn **Lên lịch sản xuất qua Coding Agent** để sao chép prompt. Điền giờ, tần suất và múi giờ trước khi gửi. Lịch cần được xác nhận trong đúng Coding Agent; Canvas alpha không tự chạy theo lịch. Dùng mục **Kiểm tra Skills & plugins** để xác nhận kỹ năng ảnh/video có trong runtime và yêu cầu hướng dẫn cài chính thức nếu thiếu. Xem [Hướng dẫn lịch chạy và Skills media](CODING_AGENT_AUTOMATION_HANDOFF.vi.md) để biết giới hạn từng runtime.

Preview theo kênh mô phỏng vị trí copy và media để tiện đối chiếu, không cam kết giống mọi phiên bản ứng dụng của nền tảng. Một task batch có thể chứa nhiều content item nhưng alpha hiện duyệt cả task, chưa duyệt từng item độc lập. Nếu cần quyết định riêng, tạo một task cho mỗi đơn vị duyệt. **Đã duyệt** là duyệt nội bộ, chưa phải **Đã lên lịch** hoặc **Đã đăng**; chưa có connector, lịch đăng, biên nhận nền tảng hay analytics. Xem [Mô hình campaign và review từng item](CONTENT_ITEMS_AND_REVIEW.vi.md).

## Khi trang hoặc hồ sơ không hiện

- Nếu toàn bộ trang không mở, yêu cầu Coding Agent khởi động lại Local Canvas cho đúng tenant rồi mở **private URL mới** mà Agent cung cấp. Máy chủ dừng hoặc khởi động lại sẽ làm phiên URL cũ hết hạn.
- Nếu trang mở ở trạng thái **Bản mẫu nội bộ**, trình duyệt hiện tại không có capability. Quay lại tab đã kết nối, dùng **Sao chép link riêng**, rồi mở link mới ở trình duyệt ngoài trên cùng máy.
- Nếu trang thật mở nhưng danh sách trống, xem giải thích rỗng và tạo task mới nếu cần. Hồ sơ nội dung chỉ xuất hiện sau khi Agent hoàn tất task, QA độc lập và tạo receipt hợp lệ.
- Nếu hồ sơ hiện nhưng phần chi tiết báo lỗi, tải lại trang một lần. Nếu lỗi còn, yêu cầu Agent kiểm tra trạng thái máy chủ và log; đừng gửi file tenant riêng lên repository template.

## Giới hạn hiện tại

Canvas chạy trên máy của bạn và cần một Coding Agent có quyền truy cập project cục bộ. Coding Agent vẫn chịu giới hạn gói dịch vụ, đăng nhập và mức sử dụng riêng của nó. Alpha tạo bản nháp nội bộ, xem được media đã bàn giao trong task và hỗ trợ duyệt. Canvas chưa đăng bài, gửi tin, kết nối tài khoản, tạo campaign quảng cáo hay tiêu tiền.

Tạo task chỉ ghi phiếu công việc; nó không tự bật Coding Agent và không chạy theo lịch. Mở **Tổng quan** → **Sao chép hướng dẫn**, dán hướng dẫn vào phiên Coding Agent đang mở đúng project/tenant rồi chủ động gửi để bắt đầu. Xem [Vòng đời nội dung và báo cáo](CONTENT_LIFECYCLE_AND_REPORTING.vi.md) để biết dữ liệu nào alpha ghi nhận và lộ trình theo dõi bài đăng sau này.
