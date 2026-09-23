import { mediaKindForArtifact } from "./content-preview.js";

const reviewStateByStatus = Object.freeze({
  awaiting_owner_decision: "pending",
  accepted_internal: "approved",
  revision_requested: "revision",
});

const copyFieldLabels = Object.freeze({
  title: "Tiêu đề nội dung",
  headline: "Tiêu đề",
  hook: "Câu mở đầu",
  body: "Nội dung",
  caption: "Caption",
  script: "Kịch bản",
  description: "Mô tả",
  cta: "Kêu gọi hành động",
  altText: "Mô tả hình ảnh",
});

const contentFieldNames = new Set(Object.keys(copyFieldLabels));
const mediaKeyPattern = /(?:visual|media|image|video|asset|footage|audio|accessibility)/i;
const sourceKeyPattern = /(?:source|evidence|provenance|rights|claimRef|license)/i;

const objectValue = (value) => value && typeof value === "object" && !Array.isArray(value);

export function contentReviewState(job) {
  const status = job?.state?.status ?? job?.status ?? "";
  return reviewStateByStatus[status] ?? null;
}

export function filterContentJobs(jobs, filter) {
  return (jobs ?? []).filter((job) => contentReviewState(job) === filter);
}

export function preferredContentFilter(jobs, current = "pending") {
  if (filterContentJobs(jobs, current).length > 0) return current;
  return ["pending", "approved", "revision"].find((filter) => filterContentJobs(jobs, filter).length > 0) ?? current;
}

function localizedName(value) {
  if (typeof value === "string") return value;
  if (!objectValue(value)) return null;
  return value.vi ?? value["vi-VN"] ?? value["en-US"] ?? value.en ?? Object.values(value).find((entry) => typeof entry === "string") ?? null;
}

function groupLabel(node, path, index) {
  if (path.length === 0) return "Nội dung chính";
  const explicit = localizedName(node?.name) ?? localizedName(node?.title) ?? node?.label ?? node?.id ?? node?.conceptId ?? node?.concept_id;
  if (explicit) return String(explicit);
  return `${path.at(-1).replaceAll(/[_-]+/g, " ")} ${index + 1}`;
}

function normalizeCopyVariants(copy) {
  if (!objectValue(copy)) return [];
  const directFields = Object.entries(copy).filter(([key, value]) => contentFieldNames.has(key) && typeof value === "string" && value.trim() !== "");
  if (directFields.length > 0) {
    return [{ locale: "Nội dung chung", fields: directFields.map(([key, value]) => ({ key, label: copyFieldLabels[key], value })) }];
  }
  return Object.entries(copy).flatMap(([locale, value]) => {
    if (!objectValue(value)) return [];
    const fields = Object.entries(value)
      .filter(([key, fieldValue]) => contentFieldNames.has(key) && typeof fieldValue === "string" && fieldValue.trim() !== "")
      .map(([key, fieldValue]) => ({ key, label: copyFieldLabels[key], value: fieldValue }));
    return fields.length > 0 ? [{ locale, fields }] : [];
  });
}

function collectCopyGroups(root) {
  const groups = [];
  const seen = new Set();
  const walk = (value, path = []) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (objectValue(value.copy)) {
      const variants = normalizeCopyVariants(value.copy);
      if (variants.length > 0) groups.push({ id: `${path.join(".") || "root"}.copy`, label: groupLabel(value, path, groups.length), variants });
    } else {
      const variants = normalizeCopyVariants(value);
      if (variants.length > 0) groups.push({ id: path.join(".") || "root", label: groupLabel(value, path, groups.length), variants });
    }
    if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, [...path, String(index + 1)]));
    else Object.entries(value).forEach(([key, entry]) => {
      if (key !== "copy" && entry && typeof entry === "object") walk(entry, [...path, key]);
    });
  };
  walk(root);
  return groups;
}

function collectMetadata(root, pattern) {
  const entries = [];
  const seen = new Set();
  const walk = (value, path = []) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, [...path, String(index + 1)]));
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      const nextPath = [...path, key];
      if (pattern.test(key) && entry != null && entry !== "") entries.push({ id: nextPath.join("."), label: key.replaceAll(/[_-]+/g, " "), path: nextPath.join(" › "), value: entry });
      if (entry && typeof entry === "object") walk(entry, nextPath);
    }
  };
  walk(root);
  const unique = new Map();
  for (const entry of entries) if (!unique.has(entry.id)) unique.set(entry.id, entry);
  return [...unique.values()];
}

export function parseContentArtifacts(contentRecord) {
  const bundle = contentRecord?.review ?? contentRecord ?? {};
  return (bundle.artifacts ?? []).map((artifact, index) => {
    const content = artifact?.preview?.content;
    let parsed = null;
    if (typeof content === "string" && /json/i.test(artifact?.preview?.mediaType ?? artifact?.mediaType ?? artifact?.reference ?? "")) {
      try { parsed = JSON.parse(content); } catch { /* The verified raw preview remains available below. */ }
    }
    const preview = artifact?.preview ?? {};
    return {
      id: artifact.reference ?? `artifact-${index + 1}`,
      reference: artifact.reference ?? `Tệp ${index + 1}`,
      hash: artifact.hash ?? artifact.currentHash ?? null,
      bytes: artifact.bytes ?? artifact.preview?.bytes ?? null,
      mediaType: preview.mediaType ?? artifact.mediaType ?? "application/octet-stream",
      previewStatus: preview.status ?? (content != null ? "available" : "metadata_only"),
      rawContent: typeof content === "string" ? content : null,
      parsed,
      copyGroups: parsed ? collectCopyGroups(parsed) : [],
      mediaMetadata: parsed ? collectMetadata(parsed, mediaKeyPattern) : [],
      sourceMetadata: parsed ? collectMetadata(parsed, sourceKeyPattern) : [],
      mediaKind: mediaKindForArtifact({ ...artifact, preview }),
    };
  });
}

export function qualityDimensionsForRecord(contentRecord) {
  const scores = contentRecord?.review?.qa?.softScores ?? contentRecord?.qa?.softScores ?? {};
  const labels = {
    jtbd_audience_relevance: "Phù hợp nhu cầu người xem",
    specific_differentiated_value: "Giá trị cụ thể và khác biệt",
    proof_claim_precision: "Bằng chứng và tuyên bố",
    brand_locale_editorial_quality: "Thương hiệu và biên tập",
    clarity_cta_destination_fit: "CTA và điểm đến",
    platform_visual_accessibility_fit: "Media và khả năng tiếp cận",
    trust_emotional_safety: "Niềm tin và an toàn cảm xúc",
    experiment_measurement_quality: "Thử nghiệm và đo lường",
    operational_traceability_reuse: "Truy vết và tái sử dụng",
  };
  return Object.entries(scores).filter(([, score]) => Number.isFinite(score)).map(([id, score]) => ({ id, label: labels[id] ?? id.replaceAll("_", " "), score }));
}
