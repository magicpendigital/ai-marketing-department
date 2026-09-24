# Hướng dẫn lịch chạy và Skills media cho Coding Agent

Tài liệu này hướng dẫn chủ workspace tạo lịch sản xuất bản nháp qua Coding Agent mà họ đã đăng nhập. Canvas hiện chỉ tạo task, handoff và hồ sơ duyệt cục bộ; nó chưa có scheduler, background queue hay connector để tự đánh thức Coding Agent. Copy prompt không tự tạo lịch và không cấp quyền xuất bản.

## Kiểm tra khả năng trước khi lên lịch

Không giả định mọi Coding Agent đều có Scheduled native hoặc mọi gói đều cho phép chạy nền qua subscription:

| Runtime | Điều có thể xác nhận từ tài liệu chính thức | Cách dùng trong alpha |
| --- | --- | --- |
| Codex app | OpenAI mô tả Automations chạy theo lịch do người dùng định nghĩa và kết quả đưa vào review queue. Tính năng/giới hạn vẫn phải được kiểm tra trong đúng bản app và tài khoản. | Có thể dùng prompt dưới đây để yêu cầu Codex kiểm tra và hướng dẫn tạo automation; người dùng xác nhận lịch tại Codex. |
| Claude Code | Claude Code GitHub Action có thể dùng `on.schedule`, nhưng hướng dẫn chính thức yêu cầu cấu hình API/provider credentials và GitHub Actions; đây không phải mặc định là lượt chạy dùng subscription Claude Code. | Không chọn làm đường mặc định nếu mục tiêu là không phát sinh API billing. Dừng và nêu chi phí/quyền trước khi đề xuất. |
| Gemini CLI | Tài liệu CLI mô tả tự động hóa qua shell và một Task Tracker thử nghiệm; không xác nhận một scheduler định kỳ native tương đương Codex Automations. | Không tự tạo cron/Task Scheduler. Chỉ bàn phương án khác sau khi chủ workspace xem xét xác thực, quyền và chi phí. |

Nguồn: [OpenAI Codex Automations](https://openai.com/index/introducing-the-codex-app/), [Claude Code GitHub Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions), [Gemini CLI shell commands](https://geminicli.com/docs/cli/tutorials/shell-commands/), [Gemini CLI task tools](https://geminicli.com/docs/reference/tools/).

## Prompt lên lịch sản xuất

Mở **Quy trình** → **Lên lịch sản xuất qua Coding Agent** → **Sao chép prompt thiết lập lịch**. Điền tần suất, giờ, múi giờ, kênh và số lượng bản nháp trước khi gửi vào Coding Agent. Prompt yêu cầu runtime xác minh capability/login trước; nếu thiếu dữ liệu hoặc khả năng được hỗ trợ, nó phải hỏi/dừng thay vì tự tạo lịch thay thế.

Lịch chỉ được tạo nội dung nội bộ vào workspace đúng tenant, có work log, nguồn, ProductTruth, provenance media, QA và báo cáo. Tác vụ không được đăng/gửi nội dung, tải audience, tạo campaign quảng cáo, kết nối tài khoản hoặc chi tiêu. Một automation theo lịch cũng vẫn chịu quota/usage, giới hạn gói, login và điều khoản của Coding Agent.

## Prompt kiểm tra Skills và plugin media

Mở **Quy trình** → **Kiểm tra Skills & plugins** → **Sao chép prompt kiểm tra media**. Coding Agent phải xác minh skill thực sự có trong runtime hiện tại; không lấy danh sách plugin của môi trường khác làm bằng chứng.

Nếu thiếu công cụ, prompt yêu cầu nêu skill/plugin chính xác, nguồn cài chính thức, quyền, phiên bản và chi phí/API phụ nếu có. Chủ workspace xem thông tin rồi quyết định cài. Với ảnh chụp thực tế, người dùng cung cấp tệp có quyền sử dụng; có thể thiết kế/crop/điều chỉnh trình bày nhưng giữ nguyên sự thật trong ảnh. Ảnh/video sinh bằng AI chỉ dùng khi brief cho phép và cần lưu nguồn/provenance; media thiếu quyền hoặc công cụ phải dừng và báo blocker, không giả lập đầu ra.

## Ranh giới đang vận hành

Automation do người dùng cấu hình trong sản phẩm Coding Agent là lịch của runtime đó, không phải lịch của Canvas. Canvas chưa nghe sự kiện task mới và chưa có queue chạy ngầm. Vì vậy khi một task mới xuất hiện, quy trình hiện tại là mở Dashboard và gửi handoff prompt thủ công; sau này cần một connector/runtime adapter được kiểm tra quyền, idempotency, log và cách thu hồi trước khi tự khởi chạy.
