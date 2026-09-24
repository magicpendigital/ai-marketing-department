# Vòng đời nội dung và báo cáo

Trạng thái **Đã duyệt nội bộ** chỉ xác nhận một phiên bản đã vượt qua kiểm định và người quản lý chấp nhận để tiếp tục. Nó không có nghĩa bài đã được đăng, lịch đã được đặt hoặc nền tảng đã tiếp nhận bài.

## Canvas alpha đang lưu gì

Alpha quản lý phiếu công việc nội bộ: task, workflow, attempt/version, artifact cùng hash, verdict QA, quyết định và lý do của người quản lý, cùng nhật ký hoạt động. Task mới lưu các kênh được chỉ định ngay trong manifest. Nếu manifest cũ không có `targetChannels`, Canvas không suy đoán kênh khi preview.

Alpha chưa kết nối tài khoản nền tảng, chưa có hàng đợi xuất bản, lịch, post ID/URL/biên nhận, trạng thái đăng thực tế hoặc analytics. Vì vậy filter **Đã đăng** đang bị khóa; không được biến nội dung đã duyệt nội bộ thành bài đã đăng giả định.

## Vòng đời cần có trước khi bật publishing

Mỗi phiên bản nội dung cần được đóng dấu với `contentVersionId`/hash, ngôn ngữ, `channelId`, định dạng, hash media, CTA/điểm đến và kết quả QA. Phê duyệt ràng buộc với đúng bộ giá trị này; thay đổi copy, media, URL, kênh hoặc locale phải tạo phiên bản mới và quay lại QA/duyệt.

Sau duyệt nội bộ, một **execution envelope** riêng cho từng kênh cần có chủ tài khoản, tài khoản/đích đến đã xác minh, timezone, lịch đăng, quyền, idempotency key, retry limit, kill switch, chính sách gỡ bài và người duyệt hành động bên ngoài. Trạng thái nên tách riêng khỏi quyết định nội dung:

`internal_approved → scheduled → publishing → published | partially_failed | failed → withdrawn/archived`

Mỗi `published` chỉ hợp lệ khi lưu biên nhận từ nền tảng: provider/channel, account/destination ID đã che bớt, post ID, URL, thời gian nền tảng trả về, phiên bản/hash đã đăng và kết quả từng media. Lỗi timeout không đồng nghĩa đăng thất bại; hệ thống cần truy vấn đối soát trước khi retry để tránh đăng trùng. Thao tác gỡ hoặc sửa bài cũng là action có biên nhận, không xóa dấu vết bài cũ.

**Lộ trình đề xuất:** giai đoạn đầu nhập CSV/biên nhận thủ công và đối soát bởi người quản lý; sau đó tích hợp từng connector chính thức với scope nhỏ, quyền thu hồi, preflight, retry/idempotency và receipt; chỉ sau khi kiểm thử trên staging mới xem xét bật lịch tự động. Bật API connector hay lên lịch tự động không nằm trong alpha và phải có cổng duyệt riêng.

## Báo cáo sau đăng

Tách báo cáo thành ba lớp để không nhầm điểm chất lượng nội dung với hiệu quả kinh doanh:

1. **Vận hành & tuân thủ:** số bài theo trạng thái; tỷ lệ đăng thành công/lỗi theo kênh; thời gian chờ; retry; phiên bản, người duyệt, lý do, biên nhận và các asset còn thiếu.
2. **Chất lượng trước đăng:** QA hard-fail, điểm theo rubric, tỷ lệ đạt lần đầu, số vòng sửa, lý do sửa theo bước/role, thời gian từ brief đến duyệt. Đây là cách đánh giá công việc của từng Agent/Sub-Agent; dùng nhật ký `agent-work-log.json` (kết quả, đầu vào/đầu ra, thời gian, mã vấn đề), không thu chain-of-thought.
3. **Hiệu quả sau đăng:** impression/reach, engagement, click, lượt vào landing/store, signup, activation, retention và cost/spend nếu là quảng cáo có quyền. Mỗi metric phải có nguồn, tử số/mẫu số, cửa sổ thời gian, timezone, attribution model, cohort, owner và điều kiện consent. Phân biệt organic với paid và báo rõ dữ liệu còn thiếu.

Báo cáo theo cấp campaign → channel → post/content version → audience cohort đã được phép. So sánh trước/sau và biến thể chỉ khi có thiết kế thử nghiệm đủ điều kiện; không kết luận nhân quả từ lượt xem đơn thuần. Dùng UTM/deep link hoặc sự kiện do business sở hữu để nối lượt click đến đăng ký/kích hoạt. Chỉ đưa số liệu đủ ngưỡng, đã giảm định danh vào workflow học hỏi W6.

Với tenant có nội dung nhạy cảm như Tarot, journal, birth chart hoặc hội thoại riêng, không dùng lượt xem hay chủ đề cá nhân để tạo hồ sơ nhạy cảm hoặc nhắm quảng cáo. Chỉ dùng cohort tổng hợp được cho phép; tách dữ liệu vận hành marketing khỏi nội dung riêng tư.

## Kiểm soát quyền và quyết định

- Duyệt nội bộ, duyệt xuất bản, quyền chi tiêu và phê duyệt thay đổi sản phẩm là các quyền khác nhau.
- Owner duyệt phải nhìn thấy đúng bài text + media, channel, locale, destination, CTA/link, thời gian, account, QA và quyền sử dụng trước khi cho phép gửi ra ngoài.
- Có dry-run, giới hạn số bài/chi phí, retry budget, log append-only, revoke credential, kill switch và quy trình xử lý bài đăng sai.
- Dùng Coding Agent subscription cho nội dung không làm phát sinh quyền đăng. Muốn agent tự chạy theo lịch cần một runtime được hỗ trợ chính thức có xác thực, hàng đợi, lease, giám sát và giới hạn sử dụng; không giả định browser/subscription có thể điều khiển headless.

## Quyết định hiện tại

Trong phiên bản alpha: duy trì duyệt nội bộ và báo cáo QA/workflow; thu thập biên nhận và metrics bằng tay trong thử nghiệm nếu cần, ngoài Canvas; chưa bật publishing, scheduler, ads setup hoặc tự động tối ưu quảng cáo. Phát triển connector sau khi hai business pilot xác nhận giá trị, nguồn dữ liệu và yêu cầu tài khoản.
