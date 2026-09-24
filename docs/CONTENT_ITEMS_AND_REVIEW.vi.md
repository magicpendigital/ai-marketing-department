# Mô hình campaign, content item và review

## Quy ước vận hành

Campaign/task là nhóm công việc để quản lý mục tiêu và ngân sách thời gian; nó không nên là một đơn vị duyệt lớn. Đơn vị nội dung cần lưu và review độc lập là một bài cho một kênh, một locale và một format. Mỗi lần sửa copy hoặc media tạo một phiên bản mới.

```text
Campaign
└── Content item (channel + locale + format)
    └── Content version (copy hash + final-media hash[] + provenance)
        ├── Deterministic lint
        ├── Independent QA bound to that exact version
        └── Owner decision bound to that exact version
```

Một chủ đề có thể được phân phối trên nhiều kênh hoặc locale. Những biến thể đó cần ID và preview riêng; không được coi cùng một bài Facebook và LinkedIn là cùng một approval unit. Bài dịch sang tiếng Anh cũng là deliverable riêng khi nó nhắm tới một thị trường khác, dù có thể giữ quan hệ `translationOf` với bài gốc. Mỗi bài khác nhau phải có `contentItemId`; các bản dịch của cùng bài dùng chung ID nhưng locale là trường riêng.

## Ngôn ngữ và số lượng nội dung

- Mặc định tạo locale chính mà tenant đã chọn cho thị trường của task; chỉ thêm locale khi campaign thực sự nhắm tới locale đó hoặc chủ sở hữu chọn rõ trong brief.
- Mỗi preview chỉ hiển thị một bài, một kênh và một locale tại một thời điểm. Người duyệt có thể đổi locale để đối chiếu; không trình bày hai bản dịch nối tiếp trên mọi màn hình.
- Sản xuất 10 bài trong một lượt là phù hợp khi đó là batch đã được đặt hàng. Chúng nên nằm dưới cùng campaign nhưng xuất hiện thành 10 thẻ, có bộ lọc kênh/ngôn ngữ/trạng thái, không thành một văn bản dài duy nhất.
- Không mặc định rằng số lượng bài lớn đồng nghĩa với chất lượng hoặc phù hợp. Manager có thể tạo batch nhỏ để hiệu chỉnh giọng và format trước khi mở rộng.

## Media và cổng đánh giá

Nếu content item yêu cầu media, W2 phải bàn giao file ảnh/video hoàn chỉnh, có thể xem được, gắn đúng channel/item và nằm trong tập artifact được hash. Lưu dưới `media/<channelId>/<contentItemId>/`; bản locale khác nhau của cùng bài có thể dùng chung media nếu nội dung hình ảnh thực sự giống nhau. `visualBrief`, prompt, storyboard, ghi chú sản xuất và mô tả ảnh không thay thế file đó. Tệp cuối, copy, locale, quyền/provenance và preview kết hợp phải có trước lint; sau lint mới tới QA độc lập, rồi manager review.

Nếu format được chủ sở hữu xác định là text-only, manifest phải ghi `not_required`. Khi media là `required`, hard gate kiểm tra ở mỗi kênh có file PNG/JPEG/WebP/MP4/WebM thật với chữ ký byte tương ứng và tệp nằm trong output của bước W2.4. Tệp hỏng, sai đuôi hoặc chỉ có prompt/brief bị chặn. File hash được bind vào QA và nội dung duyệt.

Ảnh/video do tenant cung cấp vẫn cần provenance và quyền sử dụng. Có thể chỉnh sửa bố cục, crop, ánh sáng, caption hoặc typography khi policy cho phép; không được làm sai nội dung thực. Media generative chỉ dùng khi brief và tenant policy cho phép.

## Duyệt, lịch đăng và báo cáo

Owner decision nên được ghi theo `contentItemId + channel + locale + contentVersionId`, kèm người quyết định, thời gian, lý do và hash của copy cùng mọi file media. Thay đổi một thành phần sau approval làm phiên bản cũ hết hiệu lực; item đó quay lại QA/review, không làm mất trạng thái của các item khác trong campaign.

Lịch đăng cũng thuộc từng item/phiên bản. Người quản lý có thể chọn nhiều item để nhập ngày/giờ hàng loạt, nhưng hệ thống cần lưu một execution envelope riêng cho mỗi item: đích đến, timezone, thời điểm dự kiến, approval hash, người có quyền kênh, idempotency key, retry/rollback path và receipt. Chỉ receipt từ nền tảng mới chuyển trạng thái thành `published`; đã duyệt hoặc đã lên lịch không được báo cáo như đã đăng. Báo cáo sau đăng phải phân biệt reach, engagement, click, activation/conversion và chi phí theo metric có định nghĩa/mẫu số, kèm nguồn dữ liệu và cửa sổ thời gian.

Trạng thái đề xuất: `draft → media_pending → ready_for_lint → qa_pending → owner_review → approved_internal → scheduled → published` cùng nhánh `blocked`, `revision_requested`, `rejected`, `schedule_failed` và `publish_failed`. Một item có thể dừng/chạy lại độc lập; trạng thái campaign chỉ là tổng hợp.

## Giới hạn alpha hiện tại

Canvas có thể xem các copy group/channel/locale trong preview và lưu quyết định ở **cấp work order/task**. UI chỉ gắn media vào đúng bài khi có `contentItemId` khớp; nếu cùng kênh có nhiều bài mà file media chỉ mang `channelId`, Canvas sẽ không đoán hoặc gắn chung media. Backend hiện vẫn chỉ hard-gate tối thiểu một file cuối cho mỗi kênh, chưa chứng minh đủ file cho mọi `contentItemId`. Canvas cũng chưa có approval riêng cho từng bài, queue lịch đăng, tích hợp kênh, publish receipt hay analytics. Vì vậy:

- Nếu một campaign có nhiều bài nhưng cần quyết định riêng, hãy tạo một task cho mỗi đơn vị duyệt trong alpha. Có thể giữ chung campaign name/summary để phân nhóm thủ công.
- Nếu dùng một task batch hiện tại, nút duyệt áp dụng cho toàn bộ artifact set/hash của task; không giả định đó là duyệt riêng bài đang hiển thị.
- Không dùng trạng thái nội bộ `approved_internal` để tuyên bố nội dung đã được lên lịch hoặc đăng.

Trước khi triển khai approval cấp item hoặc scheduling, cần migration có phiên bản cho content item, decision ledger, media bindings và per-item execution receipts; không sửa manifest/artifact cũ tại chỗ.
