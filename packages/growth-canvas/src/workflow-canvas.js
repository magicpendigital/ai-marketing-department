export const agentRoster = Object.freeze([
  { id: "growth_orchestrator", label: "Điều phối tăng trưởng", capability: "Điều phối workflow", purpose: "Giữ đúng phạm vi task, thứ tự các cổng và ranh giới an toàn.", inputs: "Readiness, workflow đã chọn, kết quả từng bước và quyết định của chủ doanh nghiệp.", outputs: "Handoff có phạm vi, trạng thái, điểm chặn và bước tiếp theo rõ ràng.", boundary: "Không tự mở rộng phạm vi, truy cập thông tin bí mật hoặc thực hiện hành động bên ngoài." },
  { id: "research_jtbd", label: "Nghiên cứu nhu cầu", capability: "Nghiên cứu nội dung", purpose: "Tổng hợp nguồn được duyệt thành giả thuyết nhu cầu và phản đối của khách hàng.", inputs: "Nguồn công khai đã duyệt và ghi chú nghiên cứu đã khử định danh.", outputs: "Nhu cầu, phản đối, giả thuyết và mức độ tin cậy có nguồn dẫn.", boundary: "Không liên hệ người dùng, suy luận thuộc tính nhạy cảm hoặc trình bày giả thuyết như dữ kiện." },
  { id: "product_truth_claim_guard", label: "Kiểm soát sự thật sản phẩm", capability: "Quản lý sản phẩm", purpose: "Đối chiếu tuyên bố marketing với tính năng và bằng chứng hiện có.", inputs: "ProductTruth, phiên bản build, bằng chứng và bề mặt được phép.", outputs: "Danh sách claim được phép, bị chặn hoặc cần chủ sản phẩm xác nhận.", boundary: "Không tự bịa bằng chứng hay mở rộng claim đã được duyệt." },
  { id: "positioning_experiment", label: "Định vị & thử nghiệm", capability: "Quản lý sản phẩm", purpose: "Soạn giả thuyết định vị và kế hoạch thử nghiệm để chủ doanh nghiệp duyệt.", inputs: "Nghiên cứu đã duyệt, ProductTruth và mục tiêu kinh doanh.", outputs: "Giả thuyết giá trị, phương án thông điệp và kế hoạch đo lường.", boundary: "Không tự chọn audience, offer, giá hoặc tuyên bố đưa ra bên ngoài." },
  { id: "content_studio", label: "Studio nội dung", capability: "Sản xuất nội dung", purpose: "Tạo bản nháp nội dung theo brief, thương hiệu, bằng chứng và kênh được chỉ định.", inputs: "Brief, claim set, BrandPack, locale và cấu hình media.", outputs: "Concept và bộ nội dung theo từng kênh, locale, item ID.", boundary: "Không tự duyệt sản phẩm của mình hoặc biến brief media thành tệp media đã hoàn thiện." },
  { id: "independent_qa", label: "Kiểm định độc lập", capability: "Đảm bảo chất lượng", purpose: "Kiểm tra nội dung, bằng chứng, quyền, an toàn, locale và truy vết độc lập với người tạo.", inputs: "Bản nội dung đã ghép hoàn chỉnh, tệp media cuối, lint và provenance.", outputs: "Verdict theo đúng phiên bản, hash và các lỗi cần sửa.", boundary: "Không bỏ qua hard fail hoặc tự thay quyết định của chủ doanh nghiệp." },
  { id: "distribution_planner", label: "Lập kế hoạch phân phối", capability: "Vận hành thiết kế", purpose: "Chuẩn bị gói và checklist theo kênh; chưa kết nối hoặc xuất bản.", inputs: "Bản nội dung đã duyệt nội bộ và năng lực kênh được xác minh.", outputs: "Preflight checklist và execution envelope ở giai đoạn tương lai.", boundary: "Hiện chưa đăng, lên lịch, gửi, kết nối tài khoản hoặc thu biên nhận." },
  { id: "journey_measurement", label: "Đo lường hành trình", capability: "Phân tích đo lường", purpose: "Định nghĩa chỉ số funnel có mẫu số, thời gian, chủ sở hữu và guardrail rõ ràng.", inputs: "Metric map, nguồn dữ liệu đã duyệt và LearningExport tổng hợp.", outputs: "Chẩn đoán funnel, giả thuyết cải thiện và ticket nháp.", boundary: "Không phân tích hồ sơ cá nhân hoặc tự thay đổi sản phẩm/chiến dịch." },
]);

export const workflowCells = Object.freeze([
  { id: "readiness_cell", label: "Sẵn sàng & kiểm soát sự thật", leadAgent: "product_truth_claim_guard", subagents: ["evidence_reference_checker", "identity_boundary_checker", "capability_matrix_checker"] },
  { id: "research_cell", label: "Nghiên cứu khách hàng", leadAgent: "research_jtbd", subagents: ["source_register_reviewer", "jtbd_synthesizer", "research_risk_checker"] },
  { id: "content_cell", label: "Sản xuất nội dung", leadAgent: "content_studio", subagents: ["brief_expander", "locale_editor", "media_asset_producer", "visual_accessibility_brief_checker", "post_assembler"] },
  { id: "quality_cell", label: "Kiểm định độc lập", leadAgent: "independent_qa", subagents: ["claim_evidence_linter", "safety_privacy_linter", "rights_and_locale_linter"] },
  { id: "learning_cell", label: "Phân tích & học hỏi", leadAgent: "journey_measurement", subagents: ["metric_denominator_checker", "aggregate_privacy_checker", "learning_hypothesis_synthesizer"] },
]);

export const subagentRoster = Object.freeze([
  { id: "evidence_reference_checker", label: "Đối chiếu nguồn bằng chứng", purpose: "Kiểm tra mỗi tuyên bố có nguồn hiện hành và có thể truy về." },
  { id: "identity_boundary_checker", label: "Kiểm tra ranh giới dữ liệu", purpose: "Ngăn trộn dữ liệu tenant, thông tin nhạy cảm và dữ liệu ngoài phạm vi." },
  { id: "capability_matrix_checker", label: "Kiểm tra năng lực & kênh", purpose: "Đối chiếu tuyên bố và điểm đến với năng lực đã xác minh." },
  { id: "source_register_reviewer", label: "Rà soát danh mục nguồn", purpose: "Kiểm tra chất lượng, độ mới và quyền sử dụng của nguồn nghiên cứu." },
  { id: "jtbd_synthesizer", label: "Tổng hợp nhu cầu khách hàng", purpose: "Tách dữ kiện, giả định, nhu cầu và phản đối thành giả thuyết có thể kiểm tra." },
  { id: "research_risk_checker", label: "Kiểm tra rủi ro nghiên cứu", purpose: "Chặn suy diễn nhạy cảm, outreach chưa được duyệt và kết luận vượt quá dữ liệu." },
  { id: "brief_expander", label: "Mở rộng brief thành concept", purpose: "Chuyển brief được duyệt thành hướng sáng tạo có mục tiêu và cơ chế riêng." },
  { id: "locale_editor", label: "Biên tập theo ngôn ngữ", purpose: "Tạo và rà soát từng locale theo giọng thương hiệu, không dịch máy móc." },
  { id: "media_asset_producer", label: "Sản xuất tệp media cuối", purpose: "Tạo hoặc biên tập tệp ảnh/video hoàn thiện theo policy nguồn đã chọn; bàn giao file thật kèm provenance, không bàn giao prompt thay cho media." },
  { id: "visual_accessibility_brief_checker", label: "Rà soát media & accessibility", purpose: "Kiểm tra tệp cuối, crop theo kênh, quyền, provenance, caption/alt text và khả năng tiếp cận." },
  { id: "post_assembler", label: "Ghép bài preview theo kênh", purpose: "Ghép đúng copy, locale, kênh và media cuối thành bài hoàn chỉnh để lint và QA đánh giá." },
  { id: "claim_evidence_linter", label: "Rà soát tuyên bố & bằng chứng", purpose: "Phát hiện tuyên bố thiếu nguồn, lỗi thời hoặc sai phạm vi sản phẩm." },
  { id: "safety_privacy_linter", label: "Rà soát an toàn & riêng tư", purpose: "Tìm dữ liệu cá nhân, nhắm mục tiêu nhạy cảm và nội dung có hại." },
  { id: "rights_and_locale_linter", label: "Rà soát quyền & locale", purpose: "Kiểm tra quyền media, bản quyền, ngôn ngữ và yêu cầu theo thị trường." },
  { id: "metric_denominator_checker", label: "Kiểm tra mẫu số chỉ số", purpose: "Xác nhận numerator, denominator, cửa sổ thời gian và cohort nhất quán." },
  { id: "aggregate_privacy_checker", label: "Kiểm tra riêng tư dữ liệu tổng hợp", purpose: "Chặn báo cáo dưới ngưỡng hoặc có nguy cơ truy ngược cá nhân." },
  { id: "learning_hypothesis_synthesizer", label: "Tổng hợp giả thuyết cải thiện", purpose: "Đưa tín hiệu tổng hợp thành giả thuyết mới; không tự sửa sản phẩm hay nội dung." },
]);

const makeSteps = (items) => items.map(([id, label, output, worker]) => ({ id, label, output, worker }));

export const workflowDefinitions = Object.freeze([
  {
    id: "W0_readiness", label: "W0 · Sẵn sàng", gate: "Chủ doanh nghiệp xác nhận sự thật sản phẩm và ranh giới dữ liệu.",
    steps: makeSteps([
      ["W0.1", "Danh tính & ranh giới dữ liệu", "Tenant boundary", "identity_boundary_checker"],
      ["W0.2", "Thương hiệu & sự thật sản phẩm", "Danh mục tuyên bố có bằng chứng", "product_truth_claim_guard"],
      ["W0.3", "Năng lực sản phẩm & kênh", "Ma trận năng lực", "capability_matrix_checker"],
      ["W0.4", "Quyền sở hữu sự kiện đo lường", "Bản đồ sự kiện hành trình", "journey_measurement"],
      ["W0.5", "Quyết định readiness", "Hồ sơ sẵn sàng hoặc danh sách chặn", "growth_orchestrator"],
    ]),
  },
  {
    id: "W1_research_to_plan", label: "W1 · Nghiên cứu & kế hoạch", gate: "Chủ doanh nghiệp duyệt phạm vi nghiên cứu, giả thuyết và chỉ số.",
    steps: makeSteps([
      ["W1.1", "Rà soát danh mục nguồn", "Nguồn và giới hạn sử dụng", "source_register_reviewer"],
      ["W1.2", "Nhu cầu, công việc & phản đối", "Giả thuyết khách hàng", "jtbd_synthesizer"],
      ["W1.3", "Giả thuyết định vị", "Giá trị và tuyên bố được phép", "positioning_experiment"],
      ["W1.4", "Brief thử nghiệm", "Brief có phiên bản", "research_jtbd"],
      ["W1.5", "Kế hoạch đo lường", "Metric, mẫu số và guardrail", "journey_measurement"],
    ]),
  },
  {
    id: "W2_content_factory", label: "W2 · Sản xuất nội dung", gate: "QA độc lập đạt và chủ doanh nghiệp duyệt từng phiên bản nội bộ.",
    steps: makeSteps([
      ["W2.1", "Chốt tuyên bố được phép", "Claim set có nguồn", "product_truth_claim_guard"],
      ["W2.2", "Phát triển concept theo kênh", "Concept riêng cho mỗi kênh đã chọn", "brief_expander"],
      ["W2.3", "Viết nội dung theo locale & kênh", "Bản copy có channelId", "locale_editor"],
      ["W2.4", "Sản xuất media hoàn thiện", "Tệp ảnh/video cuối có provenance", "media_asset_producer"],
      ["W2.5", "Ghép bài preview hoàn chỉnh", "Copy + locale + media cuối theo từng bài/kênh", "post_assembler"],
      ["W2.6", "Kiểm tra tự động tất định", "Kết quả lint và lỗi cần sửa", "deterministic_gate"],
      ["W2.7", "QA độc lập", "Verdict, điểm và bằng chứng theo phiên bản", "independent_qa"],
      ["W2.8", "Chủ doanh nghiệp quyết định", "Duyệt nội bộ, sửa hoặc chặn", "human_gate"],
    ]),
  },
  {
    id: "W6_learning_to_product", label: "W6 · Học hỏi & cải thiện", gate: "Chủ sở hữu sản phẩm duyệt giả thuyết hoặc ticket đề xuất.",
    steps: makeSteps([
      ["W6.1", "Kiểm tra dữ liệu tổng hợp", "Input đã qua ngưỡng riêng tư", "aggregate_privacy_checker"],
      ["W6.2", "Đọc funnel & chất lượng", "Chẩn đoán theo metric đã định nghĩa", "metric_denominator_checker"],
      ["W6.3", "Cập nhật giả thuyết", "Learning note có độ bất định", "learning_hypothesis_synthesizer"],
      ["W6.4", "Đề xuất ticket", "Ticket nháp có lý do và điều kiện", "journey_measurement"],
      ["W6.5", "Chủ sản phẩm phân loại", "Tiếp tục, sửa hoặc tạm dừng", "human_gate"],
    ]),
  },
]);

export const defaultW2Subagents = Object.freeze(["brief_expander", "locale_editor", "media_asset_producer", "visual_accessibility_brief_checker", "post_assembler"]);
export const workflowCellForAgent = (agentId) => workflowCells.find((cell) => cell.leadAgent === agentId || cell.subagents.includes(agentId)) ?? null;
export const workerLabel = (workerId) => agentRoster.find(({ id }) => id === workerId)?.label ?? subagentRoster.find(({ id }) => id === workerId)?.label ?? ({ deterministic_gate: "Cổng kiểm tra tự động", human_gate: "Người quản lý" })[workerId] ?? workerId;
