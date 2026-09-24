export const codingAgentSchedulePrompt = `Hãy kiểm tra trước liệu Coding Agent và gói đăng nhập hiện tại có chức năng Scheduled/Automation được nhà cung cấp hỗ trợ và dùng được trong workspace này không. Báo tên sản phẩm, cách xác nhận trạng thái đăng nhập/quyền sử dụng, phạm vi dữ liệu được đọc/ghi và giới hạn sử dụng; không yêu cầu hay lưu API key.

Nếu native scheduler được hỗ trợ, hãy chuẩn bị automation cho AI Marketing Department của tenant hiện tại theo thông tin chủ workspace đã điền: tần suất [TẦN SUẤT], giờ chạy [GIỜ], múi giờ [MÚI GIỜ], kênh [KÊNH], số bản nháp mỗi lần [SỐ LƯỢNG]. Nếu còn placeholder hoặc không xác minh được timezone/quyền chạy, hỏi tôi và dừng trước khi lưu lịch.

Mỗi lượt chỉ được đọc ProductTruth, BrandPack, brief và task thuộc đúng tenant; tạo bản nháp nội bộ có provenance, media brief, accessibility và nhật ký kết quả theo vai trò trong workspace riêng. Dùng idempotency để không tạo task trùng, kiểm tra trạng thái queue trước khi bắt đầu, dừng khi thiếu bằng chứng/brief/quyền media/skill bắt buộc hoặc có rủi ro riêng tư. Tạo báo cáo ngắn nêu task, tệp bàn giao, vai trò/kết quả, lỗi, mức sử dụng nếu runtime cung cấp và bước cần manager quyết định.

Không đăng bài, gửi tin, liên hệ khách hàng, kết nối tài khoản, tạo/quản lý campaign quảng cáo, tải audience hay chi tiêu. Không tự cài scheduler hệ điều hành, cron, GitHub Actions, plugin hoặc skill làm phương án thay thế. Nếu Coding Agent không có lịch native được xác minh, trả về hướng dẫn chuyển giao thủ công và nêu rõ điều kiện còn thiếu; không dùng API key/provider billing thay subscription.`;

export const mediaSkillsAuditPrompt = `Trước khi sản xuất media cho tenant hiện tại, kiểm tra skill/plugin và công cụ thực sự có trong Coding Agent này. Lập bảng khả năng: tạo/chỉnh sửa ảnh, video/motion graphics, caption/subtitle/accessibility, kiểm tra brand. Chỉ gọi kỹ năng đã xác nhận có thể dùng; không giả định plugin từ một Coding Agent khác cũng có ở đây.

Nếu thiếu kỹ năng bắt buộc, tìm nguồn cài chính thức và phiên bản tương thích; báo tên chính xác, quyền truy cập, chi phí/API hoặc subscription riêng nếu có. Dừng để chủ workspace xác nhận trước khi cài hoặc tải mã. Không yêu cầu dán secret/API key vào Canvas hay repository.

Với ảnh thực, yêu cầu chủ workspace cung cấp ảnh họ sở hữu/được cấp phép và ghi nguồn/quyền. Có thể đề xuất crop, ánh sáng, bố cục, typography và lớp thiết kế theo BrandPack nhưng phải giữ nguyên nội dung thực, không generative thay thế hoặc làm sai sự thật. Với ảnh/video tạo bằng AI, chỉ thực hiện khi brief cho phép và gắn nhãn provenance. Với video, kiểm tra quyền footage, âm thanh, phụ đề, alt/caption và định dạng kênh. Nếu không có input/quyền/skill phù hợp, đánh dấu bị chặn và nêu rõ tệp cần người dùng cung cấp; tuyệt đối không giả lập rằng đã tạo media.

Chỉ tạo và lưu bản nháp vào workspace tenant hiện tại. Không đăng, gửi, tải lên tài khoản nền tảng, dùng ảnh khách hàng/ảnh cá nhân hoặc chi tiêu.`;
