const unwrap = (payload) => payload?.data ?? payload ?? {};

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
  const root = parsed[0] ?? null;
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

export function teamForManager(team, { awaitingOwnerDecision = false, reviewVerified = false } = {}) {
  if (!awaitingOwnerDecision || !reviewVerified) return team ?? [];
  return (team ?? []).map((member) => ({ ...member, state: "complete", status: "complete", time: "complete" }));
}
