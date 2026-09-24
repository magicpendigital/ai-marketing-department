const unwrap = (payload) => payload?.data ?? payload ?? {};

export function reviewErrorMessage(error) {
  const code = String(error?.code ?? "");
  if (code === "decision_not_ready") return "Task chưa đến bước chủ doanh nghiệp duyệt.";
  if (code.includes("receipt")) return "Chưa có biên nhận lần chạy hợp lệ để đối chiếu kết quả.";
  if (code.includes("claim")) return "Thông tin nhận task của Coding Agent chưa hợp lệ hoặc chưa đầy đủ.";
  if (code.includes("reviewer")) return "Chưa xác minh được tính độc lập của người kiểm định.";
  if (code.includes("qa")) return "Kết quả kiểm định độc lập chưa đạt điều kiện để chủ doanh nghiệp duyệt.";
  if (code.includes("integrity") || code.includes("artifact")) return "Tệp kết quả hoặc hash hiện tại chưa khớp với bản đã được kiểm định.";
  if (error?.status === 404) return "Backend chưa cung cấp gói duyệt cho task này.";
  return "Không thể tải gói duyệt an toàn. Quyết định đã được khóa.";
}

export function mutationErrorMessage(error) {
  if (error?.status === 409 && error?.code === "duplicate_job") return "Mã task này đã tồn tại. Hãy chọn mã khác để tạo task mới.";
  if (error?.status === 409 && error?.code === "tenant_not_ready") return "Doanh nghiệp chưa vượt qua kiểm tra sẵn sàng để tạo task.";
  if (error?.status === 409) return `${reviewErrorMessage(error)} Hãy làm mới Canvas sau khi Coding Agent hoàn tất bước còn thiếu.`;
  if (error?.status === 400) return "Dữ liệu gửi lên chưa hợp lệ. Hãy kiểm tra lại nội dung và thử lại.";
  if (error?.status === 403) return "Thao tác này không nằm trong quyền được cấp cho Canvas cục bộ.";
  return "Không thể hoàn tất thao tác. Canvas đã làm mới trạng thái để tránh dùng dữ liệu cũ.";
}

export function normalizeReviewBundle(payload) {
  const bundle = unwrap(payload);
  const verification = bundle.verification ?? {};
  const flags = {
    receipt: verification.receipt === "verified",
    qa: verification.independentQa === "verified",
    deterministicLint: verification.deterministicLint === "verified",
    reviewer: verification.reviewerSeparation === "verified",
    artifactIntegrity: verification.artifactIntegrity === "verified",
  };
  const blockers = Array.isArray(verification.blockers) ? verification.blockers : Array.isArray(bundle.blockers) ? bundle.blockers : [];
  return {
    ...bundle,
    verification: { ...verification, flags, blockers },
    artifacts: Array.isArray(bundle.artifacts) ? bundle.artifacts : [],
    checklist: Array.isArray(bundle.checklist) ? bundle.checklist : [],
    readyForOwnerDecision: bundle.readyForOwnerDecision === true && Object.values(flags).every(Boolean),
  };
}

const qualityLabels = Object.freeze({
  jtbd_audience_relevance: "Phù hợp nhu cầu người xem",
  specific_differentiated_value: "Giá trị cụ thể và khác biệt",
  proof_claim_precision: "Độ chính xác của bằng chứng và tuyên bố",
  brand_locale_editorial_quality: "Thương hiệu, bản địa hóa và biên tập",
  clarity_cta_destination_fit: "Độ rõ của CTA và điểm đến",
  platform_visual_accessibility_fit: "Nền tảng, hình ảnh và khả năng tiếp cận",
  trust_emotional_safety: "Niềm tin và an toàn cảm xúc",
  experiment_measurement_quality: "Thiết kế thử nghiệm và đo lường",
  operational_traceability_reuse: "Khả năng truy vết và tái sử dụng",
});

export function summarizeQaScores(softScores) {
  const entries = Object.entries(softScores ?? {}).filter(([, value]) => Number.isFinite(value));
  if (!entries.length) return { mean: null, min: null, dimensions: [] };
  const values = entries.map(([, value]) => value);
  return {
    mean: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
    min: Math.min(...values),
    dimensions: entries.map(([id, score]) => ({ id, label: qualityLabels[id] ?? id.replaceAll("_", " "), score })),
  };
}

function findLocalizedCopy(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  const copy = value.copy ?? value.localizedCopy ?? value.localized_copy;
  if (copy && typeof copy === "object") {
    const locale = ["vi-VN", "vi", "vi_VN"].find((key) => copy[key] && typeof copy[key] === "object")
      ?? Object.keys(copy).find((key) => copy[key] && typeof copy[key] === "object");
    if (locale) return { locale, ...copy[locale] };
  }
  if (value.headline || value.body || value.cta) return value;
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const found = Array.isArray(child)
        ? child.map((item) => findLocalizedCopy(item, seen)).find(Boolean)
        : findLocalizedCopy(child, seen);
      if (found) return found;
    }
  }
  return null;
}

export function summarizeArtifactPreview(bundle) {
  const parsed = [];
  for (const artifact of bundle?.artifacts ?? []) {
    const content = artifact?.preview?.content;
    if (typeof content !== "string") continue;
    try { parsed.push(JSON.parse(content)); } catch { /* Non-JSON previews stay in technical details. */ }
  }
  // A reviewed artifact set can start with agent-work-log.json or a lint record.
  // Find the first actual content package so operational evidence does not hide
  // the copy preview from the manager.
  const root = parsed.find((item) => findLocalizedCopy(item)) ?? parsed[0] ?? null;
  const copy = findLocalizedCopy(root);
  const candidate = root?.recommendedCandidate ?? root?.recommended_candidate
    ?? root?.productionRecord?.recommendedCandidate ?? root?.production_record?.recommended_candidate
    ?? root?.recommendedConcept ?? root?.recommended_concept ?? root?.recommendation ?? null;
  const candidateId = typeof candidate === "string" ? candidate : candidate?.conceptId ?? candidate?.concept_id ?? candidate?.id;
  const concepts = root?.concepts ?? root?.productionRecord?.concepts ?? root?.production_record?.concepts ?? [];
  const selectedConcept = Array.isArray(concepts)
    ? concepts.find((concept) => [concept?.id, concept?.conceptId, concept?.concept_id].includes(candidateId))
    : null;
  const localizedName = selectedConcept?.name?.vi ?? selectedConcept?.name?.["vi-VN"]
    ?? selectedConcept?.title?.vi ?? selectedConcept?.title?.["vi-VN"];
  const recommended = localizedName ?? selectedConcept?.name ?? selectedConcept?.title
    ?? (typeof candidate === "string" ? candidate : candidate?.title ?? candidate?.name)
    ?? root?.concept?.title ?? root?.title ?? root?.name ?? null;
  return {
    concept: typeof recommended === "string" ? recommended : recommended?.title ?? recommended?.name ?? null,
    locale: copy?.locale ?? null,
    headline: copy?.headline ?? null,
    body: copy?.body ?? copy?.caption ?? null,
    cta: copy?.cta ?? null,
    qa: summarizeQaScores(bundle?.qa?.softScores),
    remainingGates: bundle?.readyForOwnerDecision
      ? ["Chủ doanh nghiệp quyết định duyệt nội bộ hoặc yêu cầu chỉnh sửa.", "Quyền xuất bản, gửi, lên lịch và chi tiêu vẫn đang khóa."]
      : ["Hoàn tất các điều kiện xác minh trong gói duyệt trước khi ra quyết định."],
  };
}

export function checklistForManager(items, { awaitingOwnerDecision = false, reviewVerified = false } = {}) {
  return (items ?? []).map((item, index) => {
    const normalized = typeof item === "string" ? { id: `item-${index}`, label: item } : { ...item };
    return awaitingOwnerDecision && reviewVerified
      ? { ...normalized, status: "ready", state: "ready" }
      : normalized;
  });
}

export function teamForManager(team) {
  // Role status is evidence-driven by the backend. A verified review bundle only
  // proves that the task may be reviewed; it does not prove every assigned role
  // completed its own work.
  return team ?? [];
}
