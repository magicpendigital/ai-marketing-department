import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarBlank,
  CaretDown,
  ChatCircleDots,
  CheckCircle,
  Clock,
    ClipboardText,
  FileText,
  Gear,
  GitBranch,
  House,
  ImageSquare,
  Info,
  Leaf,
  Lightbulb,
  MagnifyingGlass,
  Megaphone,
  Plus,
  ShieldCheck,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  checklistForManager,
  mutationErrorMessage,
  normalizeReviewBundle,
  reviewErrorMessage,
  summarizeArtifactPreview,
  teamForManager,
} from "./review-gate.js";
import { codingAgentSchedulePrompt, mediaSkillsAuditPrompt } from "./automation-guidance.js";

const canvasCapabilitySessionKey = "growth-canvas-access-capability";
const w2AssignmentStorageKey = "growth-canvas-w2-subagents-v2";
const w2ProductionOrderStorageKey = "growth-canvas-w2-production-order-v1";

function readW2ProductionOrder() {
  if (typeof window === "undefined") return ["copy", "media"];
  try {
    const stored = JSON.parse(window.localStorage.getItem(w2ProductionOrderStorageKey) ?? "null");
    return Array.isArray(stored) && stored.length === 2 && new Set(stored).size === 2 && stored.every((item) => ["copy", "media"].includes(item)) ? stored : ["copy", "media"];
  } catch { return ["copy", "media"]; }
}

function readW2Assignment() {
  if (typeof window === "undefined") return [...defaultW2Subagents];
  try {
    const stored = JSON.parse(window.localStorage.getItem(w2AssignmentStorageKey) ?? "null");
    const allowed = new Set(defaultW2Subagents);
    const selected = Array.isArray(stored) ? [...new Set(stored.filter((item) => allowed.has(item)))] : [];
    return selected.length ? selected : [...defaultW2Subagents];
  } catch { return [...defaultW2Subagents]; }
}

function initializeCanvasAccessCapability() {
  if (typeof window === "undefined") return "";
  try {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const supplied = fragment.get("access") ?? "";
    if (supplied) {
      window.sessionStorage.setItem(canvasCapabilitySessionKey, supplied);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      return supplied;
    }
    return window.sessionStorage.getItem(canvasCapabilitySessionKey) ?? "";
  } catch {
    return "";
  }
}

const canvasAccessCapability = initializeCanvasAccessCapability();

function canvasFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (canvasAccessCapability) headers.set("X-Canvas-Capability", canvasAccessCapability);
  return fetch(path, { ...options, headers });
}
import {
  contentReviewState,
  filterContentJobs,
  listContentUnits,
  parseContentArtifacts,
  preferredContentFilter,
  qualityDimensionsForRecord,
} from "./content-review.js";
import { channelIdFrom, channelPreviewProfiles, normalizeTargetChannels, selectPreviewCopy } from "./content-preview.js";
import { agentRoster, defaultW2Subagents, subagentRoster, workerLabel, workflowCells, workflowDefinitions, workflowCellForAgent } from "./workflow-canvas.js";

const demoBootstrap = {
  jobs: [],
  organization: {
    id: "aurora-house",
    name: "Aurora House",
    owner: "Minh Anh",
    initials: "MA",
    runtimeLabel: "Chạy nội bộ (Local-only)",
  },
  campaign: {
    id: "autumn-calm-2026",
    period: "Thu 2026",
    title: "Thu 2026 – Một nhịp sống dịu hơn",
    subtitle: "Chậm lại một chút, chăm mình kỹ hơn.",
    audience: "Người đi làm, 25–40 tuổi",
    goal: "Tăng doanh số mùa thu +30%",
    channels: "Facebook, Instagram, Email",
    qualityScore: 92,
    qualityChecks: [
      "Đã kiểm chứng nguồn",
      "Phù hợp định vị thương hiệu",
      "Sẵn sàng để chủ doanh nghiệp duyệt",
    ],
  },
  workflow: [
    { id: "brief", label: "Brief", state: "complete", date: "21 thg 9" },
    { id: "research", label: "Nghiên cứu", state: "complete", date: "21 thg 9" },
    { id: "strategy", label: "Chiến lược", state: "complete", date: "22 thg 9" },
    { id: "creation", label: "Sáng tạo", state: "complete", date: "22 thg 9" },
    { id: "quality", label: "Kiểm định", state: "complete", date: "23 thg 9" },
    { id: "approval", label: "Chủ doanh nghiệp", state: "current", date: "Đang chờ phê duyệt" },
  ],
  currentTask: {
    id: "job-autumn-calm",
    status: "demo_unverified",
    stageId: "approval",
    eyebrow: "Bước hiện tại",
    title: "Chủ doanh nghiệp duyệt",
    description: "Tất cả nội dung chiến dịch đã sẵn sàng. Hãy xem xét kết quả và đưa ra quyết định cuối cùng.",
    points: [
      { label: "Nội dung đã sẵn sàng", value: "8 bài viết, 6 hình ảnh, 2 video ngắn, caption và lịch đăng cho Facebook, Instagram, Email." },
      { label: "Tại sao quan trọng", value: "Đây là điểm kiểm soát cuối trước khi triển khai. Nội dung đã qua kiểm định chất lượng và đối chiếu mục tiêu kinh doanh." },
      { label: "Bằng chứng & nguồn dữ liệu", value: "12 nguồn tham khảo, phân tích 5 đối thủ và dữ liệu sản phẩm do doanh nghiệp cung cấp." },
      { label: "Quyết định của bạn", value: "Phê duyệt để triển khai hoặc yêu cầu chỉnh sửa kèm lý do cụ thể cho đội ngũ AI." },
    ],
    preview: {
      type: "Bài viết chiến dịch",
      title: "Những ngày dịu lại, mình vẫn an yên",
      description: "Một góc nhìn nhẹ nhàng về thói quen chăm sóc bản thân giữa nhịp sống bận rộn.",
      count: "Xem tất cả 8 nội dung",
      imageUrl: "/assets/campaign-candle.png",
    },
  },
  team: [
    { initials: "QR", role: "Quality Reviewer", time: "09:14", status: "complete", detail: "Đã hoàn thành đánh giá chất lượng. Điểm: 92/100." },
    { initials: "WR", role: "Writer", time: "16:27", status: "complete", detail: "Đã tạo 8 bài viết, 6 caption và 2 email." },
    { initials: "RS", role: "Researcher", time: "13:10", status: "complete", detail: "Đã phân tích 12 nguồn uy tín và 5 đối thủ." },
    { initials: "ST", role: "Strategist", time: "10:24", status: "complete", detail: "Đã hoàn thành chiến lược và kế hoạch triển khai." },
  ],
  activity: [
    { time: "Hôm nay, 10:24", title: "Kiểm định hoàn tất", detail: "Tất cả hạng mục đều đạt yêu cầu." },
    { time: "Hôm nay, 09:41", title: "Hoàn thành sáng tạo", detail: "Đã tạo 8 bài viết, 6 hình ảnh, 2 video." },
    { time: "Hôm qua, 16:20", title: "Chiến lược được phê duyệt", detail: "Sẵn sàng chuyển sang bước sáng tạo." },
  ],
  checklist: ["Đúng định vị thương hiệu", "Thông điệp rõ ràng, tích cực", "Hình ảnh phù hợp, có quyền sử dụng", "Ngôn ngữ tự nhiên, dễ hiểu", "Phù hợp đối tượng mục tiêu", "Tối ưu cho từng kênh đăng tải", "Đã kiểm tra chính tả, ngữ pháp", "Đáp ứng tiêu chuẩn cộng đồng"].map((label, index) => ({ id: `demo-${index}`, label, status: "passed" })),
  quality: { score: 92, basis: "local_gate_completion_not_conversion_or_content_performance" },
  runtimeCapabilities: {
    defaultHandoffMode: "manual_coding_agent",
    codingAgent: { detected: false, detectionMethod: "demo_only", credentialsInspected: false, unattendedExecutionEnabled: false },
  },
};

const navigation = [
  { label: "Tổng quan", Icon: House },
  { label: "Quy trình", Icon: GitBranch },
  { label: "Nội dung", Icon: FileText },
  { label: "Chiến dịch", Icon: Megaphone },
  { label: "Học hỏi", Icon: BookOpen },
  { label: "Cài đặt", Icon: Gear },
];

const workflowIcons = [ClipboardText, MagnifyingGlass, Lightbulb, ImageSquare, ShieldCheck, UsersThree];

function unwrap(payload) {
  return payload?.data ?? payload ?? {};
}

function mergeBootstrap(payload) {
  const incoming = unwrap(payload);
  const tenant = incoming.tenant ?? {};
  const workspace = incoming.workspace ?? {};
  const tenantCampaign = tenant.campaign ?? {};
  const managerCampaign = incoming.campaign ?? {};
  const managerWorkflow = incoming.workflow ?? incoming.stages ?? demoBootstrap.workflow;
  const currentWorkflowStage = managerWorkflow.find((stage) => stage.state === "current")?.id;
  const productName = tenant.productName ?? incoming.organization?.name ?? demoBootstrap.organization.name;
  const rawCampaignValues = new Set([
    tenantCampaign.id,
    tenantCampaign.hypothesis,
    tenantCampaign.jtbd,
    tenantCampaign.primaryMetric,
    tenantCampaign.destinationId,
  ].filter(Boolean));
  const managerTitle = rawCampaignValues.has(managerCampaign.title) ? null : managerCampaign.title;
  const managerSubtitle = rawCampaignValues.has(managerCampaign.subtitle) || managerCampaign.subtitle === "Internal draft planning workspace"
    ? null
    : managerCampaign.subtitle;
  const campaignTitle = managerTitle ?? tenantCampaign.displayTitle ?? `Chiến dịch nội bộ · ${productName}`;
  const campaignSubtitle = managerSubtitle ?? tenantCampaign.displaySubtitle
    ?? "Không gian lập kế hoạch và sản xuất nội dung nội bộ.";
  return {
    ...demoBootstrap,
    ...incoming,
    organization: {
      ...demoBootstrap.organization,
      ...(incoming.organization ?? {}),
      id: tenant.tenantId ?? workspace.tenantId ?? demoBootstrap.organization.id,
      name: productName,
    },
    campaign: {
      ...demoBootstrap.campaign,
      ...managerCampaign,
      id: managerCampaign.id ?? tenantCampaign.id ?? demoBootstrap.campaign.id,
      period: localizeStatusText(managerCampaign.period ?? tenantCampaign.status ?? demoBootstrap.campaign.period),
      title: campaignTitle,
      subtitle: campaignSubtitle,
      audience: managerSafeCampaignValue(managerCampaign.audience ?? tenantCampaign.audienceSummary ?? tenant.business?.targetMarket, "Đối tượng đang chờ xác nhận"),
      goal: managerSafeCampaignValue(managerCampaign.goal ?? tenantCampaign.goalSummary, "Chỉ số chính đang chờ xác nhận"),
      channels: managerSafeCampaignValue(managerCampaign.channels ?? tenantCampaign.channelsSummary, "Chưa kết nối kênh xuất bản"),
      qualityScore: managerCampaign.qualityScore ?? incoming.quality?.score ?? demoBootstrap.campaign.qualityScore,
      qualityChecks: managerCampaign.qualityChecks ?? demoBootstrap.campaign.qualityChecks,
    },
    workflow: managerWorkflow,
    currentTask: localizeTaskPresentation({
      ...demoBootstrap.currentTask,
      ...(incoming.currentTask ?? incoming.activeJob ?? {}),
      stageId: incoming.currentTask?.stageId ?? incoming.activeJob?.stageId ?? currentWorkflowStage ?? demoBootstrap.currentTask.stageId,
    }),
    team: incoming.team ?? incoming.agents ?? demoBootstrap.team,
    activity: incoming.activity ?? incoming.recentActivity ?? demoBootstrap.activity,
    checklist: incoming.checklist ?? incoming.qualityChecklist ?? demoBootstrap.checklist,
    jobs: incoming.jobs ?? [],
    readiness: incoming.readiness ?? null,
    quality: incoming.quality ?? demoBootstrap.quality,
    runtimeCapabilities: incoming.runtimeCapabilities ?? demoBootstrap.runtimeCapabilities,
    ownerDecisionBoundary: incoming.ownerDecisionBoundary ?? workspace.ownerDecisionBoundary ?? "procedural_local_user_action_not_authenticated",
    mutationNonce: incoming.mutationNonce ?? "",
  };
}

function jobStatus(job) {
  return job?.state?.status ?? job?.status ?? "";
}

const terminalJobStatuses = new Set(["accepted_internal", "blocked", "cancelled", "failed"]);
const pollableJobStatuses = new Set(["ready_for_agent", "in_progress", "revision_requested", "awaiting_owner_decision"]);

function normalizeChecklistItem(item, index) {
  if (typeof item === "string") return { id: `item-${index}`, label: item, status: "pending" };
  const rawStatus = String(item?.status ?? item?.state ?? item?.verdict ?? "").toLowerCase();
  const status = item?.passed === true || ["passed", "complete", "completed", "done", "accepted"].includes(rawStatus)
    ? "passed"
    : item?.passed === false || ["blocked", "failed", "repair_required", "rejected"].includes(rawStatus)
      ? "blocked"
      : rawStatus === "ready"
        ? "ready"
        : "pending";
  return { id: item?.id ?? `item-${index}`, label: item?.label ?? item?.title ?? item?.requirement ?? `Mục kiểm tra ${index + 1}`, status, detail: item?.detail ?? item?.notes ?? "" };
}

function statusTone(value) {
  const status = String(value ?? "").toLowerCase();
  if (["complete", "completed", "passed", "accepted", "accepted_internal", "done"].some((token) => status.includes(token))) return "passed";
  if (["blocked", "failed", "repair", "rejected", "cancelled"].some((token) => status.includes(token))) return "blocked";
  return "pending";
}

const vietnameseStatusLabels = Object.freeze({
  ready: "Sẵn sàng",
  ready_for_agent: "Sẵn sàng chuyển giao",
  in_progress: "Đang thực hiện",
  working: "Đang thực hiện",
  review_pending: "Chờ kiểm định",
  awaiting_owner_decision: "Chờ chủ doanh nghiệp duyệt",
  accepted_internal: "Đã duyệt nội bộ",
  evidence_missing: "Thiếu nhật ký",
  "evidence not recorded": "Thiếu nhật ký",
  complete: "Hoàn thành",
  completed: "Hoàn thành",
  completed_for_review: "Hoàn tất để duyệt",
  pass: "Đạt",
  passed: "Đạt",
  not_run: "Chưa chạy",
  repair_required: "Cần chỉnh sửa",
  pending: "Đang chờ",
  revision_requested: "Cần chỉnh sửa",
  blocked: "Bị chặn",
  cancelled: "Đã hủy",
  failed: "Thất bại",
  internal_draft: "Bản nháp nội bộ",
  "internal draft": "Bản nháp nội bộ",
  defined: "Đã xác định",
  "no work order": "Chưa có phiếu công việc",
  "decision required": "Cần quyết định",
  "accepted internally": "Đã duyệt nội bộ",
  available: "Có preview",
  media_available: "Tệp media có thể xem trước",
  not_requested: "Không yêu cầu preview",
  refused_binary: "Không hiển thị tệp nhị phân",
  refused_oversize: "Tệp vượt giới hạn preview",
  refused_total_limit: "Đã đạt giới hạn preview",
  refused_sensitive_content: "Ẩn vì có nội dung nhạy cảm",
  refused_invalid_json: "JSON không hợp lệ",
  metadata_only: "Chỉ có metadata",
  unknown: "Chưa xác định",
});

const vietnameseGateCopy = Object.freeze({
  readiness: ["Dữ liệu doanh nghiệp sẵn sàng", "ProductTruth, bằng chứng và ranh giới vận hành đã vượt kiểm tra cục bộ."],
  experiment: ["Giả thuyết và chỉ số chiến dịch đã rõ", "Brief nội bộ xác định điều cần thử nghiệm và cách đo lường."],
  boundary: ["Quyền thực thi bên ngoài đang khóa", "Canvas chưa được phép xuất bản, gửi nội dung, tải tệp đối tượng hoặc chi tiêu."],
  work_order: ["Phiếu công việc riêng của doanh nghiệp đã sẵn sàng", "Task được giới hạn trong không gian làm việc hiện tại."],
  independent_qa: ["Kiểm định chất lượng độc lập", "Người kiểm định độc lập kiểm tra tệp kết quả trước khi chủ doanh nghiệp quyết định."],
  owner_decision: ["Quyết định nội bộ của chủ doanh nghiệp", "Bước duyệt theo thủ tục cục bộ đã được ghi vào audit log."],
});

const vietnameseWorkflowCopy = Object.freeze({
  readiness: "Sẵn sàng dữ liệu",
  campaign: "Brief chiến dịch",
  brief: "Brief",
  research: "Nghiên cứu",
  strategy: "Chiến lược",
  creation: "Sản xuất nội dung",
  quality: "Kiểm định độc lập",
  approval: "Chủ doanh nghiệp duyệt",
});

const vietnameseRoleLabels = Object.freeze({
  content_studio: "Nhóm sản xuất nội dung",
  content_orchestrator: "Điều phối viên sản xuất nội dung",
  brief_expander: "Chuyên gia phát triển brief",
  locale_editor: "Biên tập viên bản địa hóa",
  media_asset_producer: "Nhà sản xuất media cuối",
  visual_accessibility_brief_checker: "Người kiểm định hình ảnh và khả năng tiếp cận",
  post_assembler: "Người ghép preview theo kênh",
  quality_assurance: "Người kiểm định chất lượng",
  quality_reviewer: "Người kiểm định chất lượng",
  content_authoring: "Nhóm biên soạn nội dung",
  content_research: "Chuyên gia nghiên cứu",
  workflow_orchestration: "Điều phối viên workflow",
  writer: "Chuyên gia nội dung",
  researcher: "Chuyên gia nghiên cứu",
  strategist: "Chuyên gia chiến lược",
});

const checklistPhraseTranslations = Object.freeze({
  "Confirm the tenant identity, owner and business boundary": "Xác nhận doanh nghiệp, chủ sở hữu và ranh giới vận hành",
  "Review evidence-bound ProductTruth and prohibited claims": "Đối chiếu ProductTruth, bằng chứng và các tuyên bố bị cấm",
  "Confirm the campaign hypothesis, metric and destination": "Xác nhận giả thuyết, chỉ số và đích đến của chiến dịch",
  "Create a W2 internal work order before content production": "Tạo work order W2 nội bộ trước khi sản xuất nội dung",
  "The concept answers the approved audience job": "Ý tưởng đáp ứng đúng nhu cầu người xem đã được duyệt",
  "Copy matches the BrandPack and allowed claims": "Nội dung phù hợp BrandPack và các tuyên bố được phép",
  "Required locales, rights, and accessibility are complete": "Đủ ngôn ngữ, quyền sử dụng và yêu cầu tiếp cận",
  "Deterministic lint and independent QA are attached": "Đã đính kèm kiểm tra tự động và kiểm định độc lập",
});

function localizeHandoffInstruction(value, status) {
  if (status === "awaiting_owner_decision") return "Xem bản nháp và kết quả kiểm định bên dưới, sau đó duyệt nội bộ hoặc yêu cầu chỉnh sửa.";
  if (status === "accepted_internal") return "Bản nháp đã được duyệt nội bộ; các quyền xuất bản, gửi, lên lịch và chi tiêu vẫn đang khóa.";
  const source = String(value ?? "");
  const jobId = source.match(/(?:work order|job|phiếu công việc)\s+([a-z][a-z0-9-]{2,79})/i)?.[1];
  if (status === "revision_requested") return `Mở lại ${jobId ? `phiếu ${jobId}` : "phiếu công việc"} trong Coding Agent để xử lý góp ý, rồi gửi lại kiểm định độc lập.`;
  if (["ready_for_agent", "in_progress"].includes(status)) return `${status === "ready_for_agent" ? "Mở" : "Tiếp tục"} ${jobId ? `phiếu ${jobId}` : "phiếu công việc"} trong Coding Agent; Canvas sẽ chờ kết quả nội bộ và kiểm định độc lập.`;
  return source || "Theo dõi tiến độ trong Canvas; mọi quyền thực thi bên ngoài vẫn đang khóa.";
}

function localizeStatusText(value) {
  const source = String(value ?? "").trim();
  if (!source) return "Đang chờ";
  const blockerMatch = source.match(/^(\d+)\s+blocker/i);
  if (blockerMatch) return `${blockerMatch[1]} điểm chặn`;
  const normalized = source.toLowerCase().replace(/[\s-]+/g, "_");
  return vietnameseStatusLabels[normalized] ?? vietnameseStatusLabels[source.toLowerCase()] ?? source;
}

function localizeTaskPresentation(task) {
  const titleMap = {
    "Create the first internal W2 work order": "Tạo phiếu công việc W2 nội bộ đầu tiên",
    "Resolve tenant readiness blockers": "Xử lý các điểm chặn trước khi vận hành",
  };
  const descriptionMap = {
    "The tenant boundary and campaign brief are ready for a bounded Coding Agent handoff.": "Ranh giới dữ liệu và brief chiến dịch đã sẵn sàng để chuyển giao thủ công tới Coding Agent.",
    "Complete the missing owner and evidence inputs before content production.": "Bổ sung thông tin chủ doanh nghiệp và bằng chứng còn thiếu trước khi sản xuất nội dung.",
  };
  const pointLabelMap = {
    "Campaign hypothesis": "Giả thuyết chiến dịch",
    "Manager decision": "Quyết định cần duyệt",
    "Quality status": "Trạng thái cổng kiểm soát nội bộ",
    "Execution boundary": "Ranh giới thực thi",
  };
  return {
    ...task,
    title: titleMap[task.title] ?? task.title,
    description: descriptionMap[task.description] ?? task.description,
    points: task.points?.map((point) => ({ ...point, label: pointLabelMap[point.label] ?? point.label })),
  };
}

function managerSafeCampaignValue(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const source = value.trim();
  const known = {
    "Owner review required": "Cần chủ doanh nghiệp xác nhận",
    "Primary metric pending owner review": "Chỉ số chính đang chờ xác nhận",
    "No destination connected": "Chưa kết nối kênh xuất bản",
  }[source];
  if (known) return known;
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(source)) return fallback;
  return source;
}

function localizeGateItem(item, index) {
  const localized = vietnameseGateCopy[item?.id];
  return {
    ...item,
    id: item?.id ?? `gate-${index}`,
    label: localized?.[0] ?? item?.label ?? `Gate nội bộ ${index + 1}`,
    detail: localized?.[1] ?? item?.detail ?? "",
  };
}

function localizeWorkflowStage(stage) {
  return { ...stage, label: vietnameseWorkflowCopy[stage.id] ?? stage.label, date: localizeStatusText(stage.date) };
}

function localizeTeamMember(member) {
  const roleId = String(member.id ?? member.role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const role = vietnameseRoleLabels[roleId] ?? member.role;
  const state = member.state ?? member.status ?? member.time;
  const stateLabel = localizeStatusText(state);
  const backendEnglishDetail = /Leads internal|Supports the bounded|Reviews the draft|Mapped capability|is available for the next internal work order|current state/i.test(member.detail ?? "");
  const detail = state === "evidence_missing"
    ? "Chưa có nhật ký kết quả đã xác minh cho vai trò này trong lần chạy hiện tại."
    : member.detail?.includes("validated lead receipt")
      ? "Đã có biên nhận bàn giao của Lead Agent gắn với tệp kết quả."
      : member.detail?.includes("Verified work-log entries")
        ? "Nhật ký đã xác minh gắn đầu ra của vai trò này với bộ tệp hiện tại."
        : member.detail?.includes("independently")
          ? "Thực hiện kiểm định độc lập trước bước duyệt của chủ doanh nghiệp."
          : backendEnglishDetail
            ? `${role || "Vai trò AI"} · ${stateLabel.toLowerCase()} trong phiếu công việc nội bộ hiện tại.`
            : member.detail;
  return { ...member, role, time: stateLabel, detail };
}

function localizeActivityItem(item) {
  const title = localizeStatusText(item.title);
  const detail = /Internal work order|external actions remain disabled/i.test(item.detail ?? "")
    ? "Phiếu công việc nội bộ đã được cập nhật; mọi quyền thực thi bên ngoài vẫn bị khóa."
    : item.detail;
  const parsedTime = Date.parse(item.time);
  const time = Number.isFinite(parsedTime) ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(parsedTime) : item.time;
  return { ...item, title, detail, time };
}

function localizeChecklistItem(item, index) {
  const normalized = normalizeChecklistItem(item, index);
  const translated = checklistPhraseTranslations[normalized.label];
  const isTechnicalIdentifier = /^[a-z0-9_-]+$/i.test(normalized.label) && /[_-]/.test(normalized.label);
  const isBackendEnglish = /\b(confirm|review|create|must|ensure|check|required?)\b/i.test(normalized.label);
  return {
    ...normalized,
    label: translated ?? (isTechnicalIdentifier || isBackendEnglish ? `Yêu cầu kiểm tra ${index + 1}` : normalized.label),
    detail: translated
      ? normalized.detail === "Required before the first internal content work order is accepted."
        ? "Cần hoàn tất trước khi phiếu sản xuất nội dung đầu tiên được duyệt."
        : normalized.detail?.replace(/^Review requirement for work order /, "Yêu cầu duyệt cho phiếu công việc ")
      : isTechnicalIdentifier || isBackendEnglish ? `Chi tiết kỹ thuật: ${normalized.label}${normalized.detail ? ` · ${normalized.detail}` : ""}` : normalized.detail,
  };
}

function displayValue(value) {
  if (value == null || value === "") return "Chưa có dữ liệu";
  if (Array.isArray(value)) return value.map(displayValue).join(" · ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function runtimePresentation(capabilities, connectionMode) {
  if (connectionMode === "demo") return { title: "Bản mẫu nội bộ", detail: "Không kết nối runtime; thao tác duyệt bị khóa", tone: "demo" };
  const codingAgent = capabilities?.codingAgent ?? {};
  return {
    title: codingAgent.detected ? "Đã phát hiện lệnh Coding Agent" : "Chưa phát hiện lệnh Coding Agent",
    detail: `Chuyển giao thủ công · đăng nhập chưa được kiểm tra · chạy nền ${codingAgent.unattendedExecutionEnabled ? "được bật" : "bị tắt"}`,
    tone: codingAgent.detected ? "detected" : "not-detected",
  };
}

function taskFromJob(job, fallback) {
  if (!job) return fallback;
  const state = job.state ?? job;
  const manifest = job.manifest ?? {};
  const status = jobStatus(job);
  const assignedRoles = [manifest.assignedAgentRole, ...(manifest.subagentTemplateIds ?? [])]
    .filter(Boolean)
    .map((roleId) => vietnameseRoleLabels[String(roleId).toLowerCase()] ?? String(roleId).replaceAll("_", " "));
  const stageId = status === "awaiting_owner_decision" || status === "accepted_internal"
    ? "approval"
    : status.includes("quality") || status.includes("qa")
      ? "quality"
      : status === "ready_for_agent"
        ? "creation"
        : "creation";
  return {
    ...fallback,
    id: job.jobId ?? state.jobId ?? fallback.id,
    jobId: job.jobId ?? state.jobId ?? fallback.id,
    stageId,
    status,
    eyebrow: status === "awaiting_owner_decision" ? "Đang chờ quyết định của bạn" : "Task hiện tại",
    title: state.title ?? manifest.title ?? fallback.title,
    description: state.managerTaskDescription ?? manifest.managerReview?.decisionRequest ?? manifest.taskDescription ?? fallback.description,
    handoffPrompt: job.handoff?.prompt ?? job.handoff?.nextAction ?? "",
    targetChannels: manifest.targetChannels ?? [],
    handoffMode: job.handoff?.mode ?? state.handoffMode ?? "manual_coding_agent",
    points: [
      { label: "Tóm tắt chiến dịch", value: state.campaignSummary || "Phiếu công việc đã được tạo từ dữ liệu doanh nghiệp trong không gian riêng." },
      { label: "Điều chủ doanh nghiệp cần quyết định", value: state.managerTaskDescription ?? manifest.managerReview?.decisionRequest ?? "Xem xét kết quả và quyết định bước tiếp theo." },
      { label: "Đội ngũ được giao", value: assignedRoles.join(", ") || "Coding Agent sẽ điều phối theo cấu hình vai trò của doanh nghiệp." },
      { label: "Kênh đã khóa trong task", value: (manifest.targetChannels ?? []).map((id) => channelPreviewProfiles.find((item) => item.id === id)?.label ?? id).join(", ") || "Task cũ chưa có kênh được chỉ định." },
      { label: "Bước tiếp theo", value: localizeHandoffInstruction(job.handoff?.nextAction, status) },
    ],
    preview: {
      ...fallback.preview,
      type: "Phiếu công việc nội bộ",
      title: state.title ?? fallback.preview.title,
      description: state.campaignSummary || state.managerTaskDescription || fallback.preview.description,
      count: "Xem hồ sơ task",
    },
  };
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? payload?.message ?? `Yêu cầu thất bại (${response.status})`);
    error.status = response.status;
    error.code = payload?.error?.code ?? payload?.code;
    throw error;
  }
  return payload;
}

async function postJson(path, body, mutationNonce) {
  return readJson(await canvasFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(mutationNonce ? { "X-Canvas-Nonce": mutationNonce } : {}) },
    body: JSON.stringify(body),
  }));
}

function ScoreRing({ value }) {
  const score = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` }} aria-label={`Điểm chất lượng ${score} trên 100`}>
      <div className="score-ring__inner"><strong>{score}</strong><span>/100</span></div>
    </div>
  );
}

function StatusLabel({ children, tone = "success" }) {
  return <span className={`status-label status-label--${tone}`}>{children}</span>;
}

function LoadingView() {
  return <div className="loading-view" aria-live="polite" aria-busy="true"><div className="loading-view__bar" /><div className="loading-view__grid"><div className="loading-view__block" /><div className="loading-view__block" /></div><p>Đang chuẩn bị Canvas nội bộ…</p></div>;
}

function Sidebar({ activeNav, onNavigate, runtime }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup"><span className="brand-lockup__mark"><Leaf weight="fill" /></span><div><strong>AI Marketing</strong><strong>Department</strong></div></div>
      <p className="brand-lockup__tagline">Tăng trưởng cùng AI, ngay tại máy của bạn.</p>
      <nav className="sidebar__nav" aria-label="Điều hướng chính">
        {navigation.map(({ label, Icon }) => <button className={activeNav === label ? "sidebar__nav-item is-active" : "sidebar__nav-item"} key={label} onClick={() => onNavigate(label)} type="button"><Icon size={21} weight={activeNav === label ? "fill" : "regular"} />{label}</button>)}
      </nav>
      <div className="local-note">
        <div className="local-note__title"><ShieldCheck size={24} weight="fill" /><strong>Chuyển task thủ công trên máy</strong></div>
        <p>Canvas không yêu cầu API key riêng, không kiểm tra trạng thái đăng nhập Coding Agent và không tự chạy tác vụ nền.</p>
        <span className={`runtime-status runtime-status--${runtime.tone}`}>{runtime.title}</span>
        <button className="text-button" type="button" onClick={() => onNavigate("Cài đặt")}>Tìm hiểu thêm <ArrowRight /></button>
      </div>
    </aside>
  );
}

function AppHeader({ organization, runtime, onCreate, onCopyPrivateLink }) {
  return (
    <header className="app-header">
      <button className="workspace-switcher" type="button" aria-label="Chọn doanh nghiệp"><span className="workspace-switcher__avatar">{organization.name?.charAt(0) ?? "A"}</span><span>{organization.name}</span><CaretDown className="workspace-switcher__chevron" /></button>
      <div className={`runtime-pill runtime-pill--${runtime.tone}`} title={runtime.detail}><span className="runtime-pill__dot" /><span><strong>{runtime.title}</strong><small>{runtime.detail}</small></span></div>
      <div className="app-header__spacer" />
      <span className="header-date"><CalendarBlank size={19} />Thứ Tư, 23 tháng 9, 2026</span>
      {onCopyPrivateLink && <button className="secondary-button secondary-button--compact private-link-button" type="button" title="Sao chép link riêng có quyền truy cập local; chỉ dùng trên máy này" onClick={onCopyPrivateLink}><ClipboardText />Sao chép link riêng</button>}
      <button className="secondary-button secondary-button--compact" type="button" onClick={onCreate}><Plus weight="bold" />Tạo task</button>
      <div className="owner-profile"><span className="owner-profile__avatar">{organization.initials}</span><span><small>Chào bạn,</small><strong>{organization.owner}</strong></span></div>
    </header>
  );
}

function CampaignHeader({ campaign, quality }) {
  const gates = (quality?.gates ?? campaign.qualityGates ?? campaign.qualityChecks ?? []).map((item, index) => localizeGateItem(typeof item === "string" ? { label: item, state: "passed" } : item, index));
  return (
    <section className="campaign-header">
      <div className="campaign-header__copy">
        <p className="breadcrumb">Chiến dịch&nbsp; / &nbsp;{campaign.period}</p>
        <h1 title={campaign.title}>{campaign.title}</h1><p className="campaign-subtitle" title={campaign.subtitle}>{campaign.subtitle}</p>
        <div className="campaign-facts"><div><span>Đối tượng</span><strong>{campaign.audience}</strong></div><div><span>Mục tiêu</span><strong>{campaign.goal}</strong></div><div><span>Kênh triển khai</span><strong>{campaign.channels}</strong></div></div>
      </div>
      <div className="quality-summary">
        <div className="section-title-row"><h2>Hoàn thành cổng kiểm soát nội bộ <Info size={16} /></h2><span className="context-label">Tiến độ</span></div>
        <div className="quality-summary__body"><ScoreRing value={campaign.qualityScore} /><ul className="quality-summary__checks">{gates.slice(0, 4).map((item) => { const tone = statusTone(item.state); const Icon = tone === "passed" ? CheckCircle : tone === "blocked" ? WarningCircle : Clock; return <li className={`quality-gate quality-gate--${tone}`} key={item.id} title={item.detail}><Icon size={18} weight="fill" /><span>{item.label}</span></li>; })}</ul></div>
        <p className="quality-summary__disclaimer">Điểm này đo {quality?.scoreBasis === "local_gate_completion" || quality?.basis === "local_gate_completion_not_conversion_or_content_performance" ? "mức hoàn thành cổng kiểm soát cục bộ" : "mức sẵn sàng nội bộ"}; không phải hiệu quả chuyển đổi hoặc chất lượng nội dung sau xuất bản.</p>
      </div>
    </section>
  );
}

function Workflow({ stages, selectedStage, onSelect, onOpenWorkflow }) {
  return (
    <section className="workflow-section">
      <div className="section-heading"><div><h2>Quy trình chiến dịch</h2><p>Từ brief đến bản nháp nội bộ. Coding Agent thực hiện theo từng bước; chủ doanh nghiệp duyệt tại các điểm quyết định.</p></div><button className="text-button" type="button" onClick={onOpenWorkflow}>Xem Agents & quy trình <ArrowRight /></button></div>
      <ol className="workflow-track">{stages.map((rawStage, index) => { const stage = localizeWorkflowStage(rawStage); const Icon = workflowIcons[index] ?? ClipboardText; return <li key={stage.id} className={`workflow-step workflow-step--${stage.state} ${selectedStage === stage.id ? "is-selected" : ""}`}><button type="button" onClick={() => onSelect(stage.id)} aria-current={stage.state === "current" ? "step" : undefined}><span className="workflow-step__number"><Icon size={22} weight="bold" /></span><strong>{stage.label}</strong><span className="workflow-step__state">{stage.state === "complete" ? "Hoàn thành" : stage.state === "current" ? "Đang xử lý" : "Chưa bắt đầu"}</span><small>{stage.date}</small></button></li>; })}</ol>
    </section>
  );
}

function VerificationRow({ label, passed }) {
  return <li className={passed ? "is-passed" : "is-pending"}>{passed ? <CheckCircle weight="fill" /> : <Clock weight="fill" />}<span>{label}</span><strong>{passed ? "Đã xác minh" : "Chưa xác minh"}</strong></li>;
}

function managerQaNote(qa) {
  if (qa.verdict === "pass") return "Kiểm định độc lập đã xác nhận bản nháp đạt ngưỡng nội bộ và sẵn sàng để chủ doanh nghiệp xem xét.";
  if (qa.verdict === "revise" || qa.verdict === "repair_required") return "Người kiểm định đề nghị chỉnh sửa trước khi chủ doanh nghiệp quyết định.";
  return /^[\x00-\x7F]*$/.test(String(qa.notes ?? ""))
    ? "Ghi chú đầy đủ của người kiểm định nằm trong phần chi tiết kỹ thuật."
    : displayValue(qa.notes);
}

function ManagerArtifactPreview({ summary }) {
  const hasCopy = summary.concept || summary.headline || summary.body || summary.cta;
  return <section className="manager-artifact-preview"><div className="section-title-row"><div><span className="review-bundle__eyebrow">Bản xem nhanh cho người duyệt</span><h3>Nội dung được đề xuất</h3></div>{summary.locale && <span className="context-label">{summary.locale}</span>}</div>{hasCopy ? <div className="manager-copy-card">{summary.concept && <p><strong>Ý tưởng đề xuất</strong>{summary.concept}</p>}{summary.headline && <p><strong>Tiêu đề</strong>{summary.headline}</p>}{summary.body && <p><strong>Nội dung</strong>{summary.body}</p>}{summary.cta && <p><strong>Kêu gọi hành động</strong>{summary.cta}</p>}</div> : <p className="artifact-card__empty">Tệp đã được xác minh nhưng chưa có nội dung JSON có cấu trúc để tạo bản xem nhanh.</p>}<div className="manager-review-facts"><div><span>Điểm QA trung bình</span><strong>{summary.qa.mean ?? "—"}/5</strong></div><div><span>Điểm QA thấp nhất</span><strong>{summary.qa.min ?? "—"}/5</strong></div></div><div className="remaining-gates"><strong>Điều kiện còn lại</strong><ul>{summary.remainingGates.map((gate) => <li key={gate}>{gate}</li>)}</ul></div></section>;
}

function ReviewBundlePanel({ review, taskStatus }) {
  if (taskStatus === "accepted_internal" && review.status !== "ready") {
    return <section className="review-bundle review-bundle--verified"><div className="review-bundle__header"><div><span className="review-bundle__eyebrow">Quyết định đã ghi nhận</span><h3>Nội dung đã được duyệt nội bộ</h3></div><StatusLabel tone="success">Đã duyệt nội bộ</StatusLabel></div><p>Mở hồ sơ task trong mục Nội dung để xem toàn bộ bản đã duyệt, media và nguồn, điểm chất lượng cùng lịch sử quyết định. Quyết định này không cấp quyền xuất bản, gửi, lên lịch, tạo campaign, tải audience hoặc chi tiêu.</p></section>;
  }
  if (review.status === "loading") return <section className="review-bundle review-bundle--loading" aria-live="polite"><div className="review-bundle__loading" /><p>Đang tải và kiểm tra gói duyệt hiện tại…</p></section>;
  if (review.status !== "ready") {
    return <section className="review-bundle review-bundle--blocked"><div className="review-bundle__header"><div><span className="review-bundle__eyebrow">Gói duyệt an toàn</span><h3>Chưa thể xác minh nội dung để duyệt</h3></div><StatusLabel tone="current">Đã khóa quyết định</StatusLabel></div><p>{review.error ?? "Tệp kết quả, kiểm định độc lập và biên nhận lần chạy chưa sẵn sàng hoặc chưa được xác minh."}</p></section>;
  }

  const bundle = review.data;
  const flags = bundle.verification?.flags ?? {};
  const qa = bundle.qa ?? {};
  const reviewer = qa.reviewer?.role ?? qa.reviewer?.name ?? qa.reviewer ?? qa.reviewerRole ?? "Chưa xác định";
  const receipt = bundle.receipt ?? {};
  const artifacts = bundle.artifacts ?? [];
  const reviewChecklist = (bundle.checklist ?? []).map(localizeChecklistItem);
  const artifactSummary = summarizeArtifactPreview(bundle);
  const evidenceEntries = Array.isArray(bundle.evidence)
    ? bundle.evidence.map((value, index) => [`Bằng chứng ${index + 1}`, value])
    : Object.entries(bundle.evidence ?? {});
  const receiptRows = [["Kết quả", localizeStatusText(receipt.outcome)], ["Bắt đầu", receipt.startedAt], ["Hoàn tất", receipt.finishedAt]].filter(([, value]) => value != null && value !== "");

  return (
    <section className={`review-bundle ${bundle.readyForOwnerDecision ? "review-bundle--verified" : "review-bundle--blocked"}`}>
      <div className="review-bundle__header"><div><span className="review-bundle__eyebrow">Gói duyệt an toàn</span><h3>{bundle.readyForOwnerDecision ? "Tệp kết quả và kiểm định độc lập đã được xác minh" : "Gói duyệt chưa vượt qua mọi điều kiện"}</h3></div><StatusLabel tone={bundle.readyForOwnerDecision ? "success" : "current"}>{bundle.readyForOwnerDecision ? "Sẵn sàng để xem xét" : "Quyết định bị khóa"}</StatusLabel></div>
      <ul className="verification-grid"><VerificationRow label="Biên nhận lần chạy" passed={flags.receipt} /><VerificationRow label="Kiểm tra tất định của framework" passed={flags.deterministicLint} /><VerificationRow label="Kiểm định độc lập" passed={flags.qa} /><VerificationRow label="Người kiểm định độc lập" passed={flags.reviewer} /><VerificationRow label="Hash tệp kết quả hiện tại" passed={flags.artifactIntegrity} /></ul>
      {bundle.verification?.blockers?.length > 0 && <div className="review-blockers"><strong>Điều kiện còn thiếu</strong><ul>{bundle.verification.blockers.map((blocker, index) => <li key={`${displayValue(blocker)}-${index}`}>{displayValue(blocker)}</li>)}</ul></div>}

      <div className="review-details-grid">
        <article className="review-detail-card"><span>Kiểm định độc lập</span><h4>Người kiểm định độc lập</h4><dl><div><dt>Kết luận</dt><dd>{localizeStatusText(qa.verdict ?? qa.status)}</dd></div><div><dt>Tóm tắt</dt><dd>{managerQaNote(qa)}</dd></div></dl></article>
        <article className="review-detail-card"><span>Nhóm sản xuất</span><h4>Đã bàn giao bản nháp</h4><dl>{receiptRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}<div><dt>Phân tách nhiệm vụ</dt><dd>Nhóm sản xuất không tự chấm QA; trạng thái kỹ thuật <code>not_run</code> ở biên nhận là đúng quy trình. Kết luận chất lượng do người kiểm định độc lập ở bên trái cung cấp.</dd></div></dl></article>
        <article className="review-detail-card"><span>Bằng chứng</span><h4>{evidenceEntries.length} nhóm tham chiếu</h4><p className="review-detail-card__summary">Biên nhận, QA độc lập, vai trò kiểm định và hash tệp đều đã được xác minh. Chi tiết đầy đủ nằm bên dưới.</p></article>
      </div>

      <ManagerArtifactPreview summary={artifactSummary} />

      {reviewChecklist.length > 0 && <div className="review-checklist"><div className="section-title-row"><h3>Tiêu chí chủ doanh nghiệp cần đối chiếu</h3><span className="context-label">{reviewChecklist.length} mục</span></div><ul>{reviewChecklist.map((item) => <li key={item.id}><ClipboardText size={18} /><span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span></li>)}</ul></div>}

      <details className="technical-details"><summary>Chi tiết kỹ thuật và dữ liệu gốc</summary><div className="technical-details__body"><dl className="technical-evidence"><div><dt>Vai trò kiểm định</dt><dd><code>{displayValue(reviewer)}</code></dd></div><div><dt>Vai trò sản xuất</dt><dd><code>{displayValue(receipt.agentRole)}</code></dd></div><div><dt>Trạng thái gate trong biên nhận</dt><dd><code>{displayValue(receipt.qualityGateStatus)}</code></dd></div><div><dt>Ghi chú QA gốc</dt><dd>{displayValue(qa.notes)}</dd></div>{evidenceEntries.map(([label, value], index) => <div key={`${label}-${index}`}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}</dl><div className="artifact-section"><div className="section-title-row"><h3>Tệp kết quả đã xác minh</h3><span className="context-label">{artifacts.length} tệp</span></div>{artifacts.length ? <div className="artifact-list">{artifacts.map((artifact, index) => { const preview = artifact.preview ?? {}; const hash = artifact.hash ?? artifact.currentHash; return <article className="artifact-card" key={artifact.reference ?? `artifact-${index}`}><div className="artifact-card__header"><div><FileText size={19} /><strong>{artifact.reference ?? `Tệp kết quả ${index + 1}`}</strong></div><StatusLabel tone={preview.status === "available" || preview.content != null ? "success" : "current"}>{localizeStatusText(preview.status ?? "metadata only")}</StatusLabel></div><dl className="artifact-meta"><div><dt>Hash hiện tại</dt><dd><code>{displayValue(hash)}</code></dd></div><div><dt>Kích thước</dt><dd>{artifact.bytes != null ? `${artifact.bytes} byte` : "Chưa có"}</dd></div><div><dt>Loại dữ liệu</dt><dd>{preview.mediaType ?? artifact.mediaType ?? "Chưa xác định"}</dd></div></dl>{preview.content != null ? <pre className="artifact-preview">{displayValue(preview.content)}</pre> : <p className="artifact-card__empty">Backend không cung cấp bản xem trước an toàn cho tệp này.</p>}</article>; })}</div> : <p className="artifact-card__empty">Không có tệp kết quả đã xác minh trong gói duyệt.</p>}</div></div></details>
    </section>
  );
}

function TaskReview({ task, busy, onDecision, review, onCopyHandoff, onOpenContent, allowHandoff, ownerDecisionBoundary }) {
  const canDecide = task.status === "awaiting_owner_decision" && review.status === "ready" && review.data?.readyForOwnerDecision === true;
  const acceptedInternal = task.status === "accepted_internal";
  const showHandoff = allowHandoff && ["ready_for_agent", "in_progress", "revision_requested"].includes(task.status) && Boolean(task.handoffPrompt);
  return (
    <section className="task-card">
      <div className="task-card__main"><StatusLabel tone="current">{task.eyebrow ?? "Task hiện tại"}</StatusLabel><h2>{task.title}</h2><p className="task-card__description">{task.description}</p>
        <dl className="task-points">{(task.points ?? demoBootstrap.currentTask.points).map((point, index) => <div key={`${point.label}-${index}`}><dt><span className="task-points__icon">{index === 0 ? <ImageSquare /> : index === 1 ? <Lightbulb /> : index === 2 ? <ShieldCheck /> : <Info />}</span>{point.label}</dt><dd>{point.value}</dd></div>)}</dl>
      </div>
      <aside className="content-preview"><img src={task.preview?.imageUrl ?? "/assets/campaign-candle.png"} alt="Ảnh xem trước cho nội dung chiến dịch" /><span>{task.preview?.type}</span><h3>{task.preview?.title}</h3><p>{task.preview?.description}</p><button className="text-button" type="button" onClick={onOpenContent}>{task.preview?.count ?? "Xem nội dung"} <ArrowRight /></button></aside>
      {showHandoff && <section className="handoff-card"><div><span>Chuyển task thủ công</span><h3>Gửi phiếu công việc này cho Coding Agent</h3><p>Canvas chưa kiểm tra đăng nhập và không tự khởi chạy Coding Agent. Sao chép hướng dẫn do backend tạo rồi gửi trong Coding Agent bạn đang dùng.</p></div><button className="secondary-button" type="button" onClick={() => onCopyHandoff(task.handoffPrompt)}><ClipboardText size={18} />Sao chép hướng dẫn</button></section>}
      <ReviewBundlePanel review={review} taskStatus={task.status} />
      {!canDecide && !acceptedInternal && <p className="task-card__guard"><Info size={17} />Quyết định của chủ doanh nghiệp sẽ mở sau khi Coding Agent hoàn thành task và người kiểm định độc lập gửi kết quả để duyệt.</p>}
      <p className="owner-identity-note"><ShieldCheck size={17} />Bản alpha ghi nhận quyền duyệt của chủ doanh nghiệp theo thủ tục cục bộ ({ownerDecisionBoundary === "procedural_local_user_action_not_authenticated" ? "chưa xác thực danh tính" : "theo cấu hình cục bộ"}). Canvas chưa xác minh sự hiện diện của người dùng bằng tài khoản hệ điều hành hoặc WebAuthn.</p>
      <div className="task-card__actions"><button className="secondary-button" type="button" disabled={busy || !canDecide} onClick={() => onDecision("revise")}><ChatCircleDots />Yêu cầu chỉnh sửa</button><button className="primary-button" type="button" disabled={busy || !canDecide} onClick={() => onDecision("accept")}><CheckCircle weight="fill" />{busy ? "Đang xử lý…" : acceptedInternal ? "Đã duyệt nội bộ" : canDecide ? "Mở để phê duyệt" : "Chưa đến bước duyệt"}</button></div>
    </section>
  );
}

function TeamPanel({ team, activity, onOpenWorkflow }) {
  const localizedTeam = team.map(localizeTeamMember);
  const localizedActivity = activity.map(localizeActivityItem);
  return (
    <section className="side-panel team-panel">
      <div className="section-heading section-heading--tight"><div><h2>Đội ngũ được phân công</h2><p>{localizedTeam.length} vai trò trong phiếu công việc hiện tại.</p></div></div>
      <ul className="team-list">{localizedTeam.map((member) => { const tone = statusTone(member.state ?? member.status ?? member.time); const StateIcon = tone === "passed" ? CheckCircle : tone === "blocked" ? WarningCircle : Clock; return <li key={member.id ?? member.role} className={`team-list__item team-list__item--${tone}`}><StateIcon className="team-list__state" size={22} weight="fill" /><span className="team-list__avatar">{member.initials}</span><div><strong>{member.role}</strong><p>{member.detail}</p></div><time>{member.time}</time></li>; })}</ul>
      <button className="team-panel__workflow-link" type="button" onClick={onOpenWorkflow}>Xem toàn bộ {agentRoster.length} Agents và {subagentRoster.length} Sub-Agents <ArrowRight size={15} /></button>
      <div className="activity-block"><div className="section-title-row"><h3>Hoạt động gần đây</h3><button className="text-button" type="button">Xem tất cả <ArrowRight /></button></div><ol className="activity-list">{localizedActivity.map((item, index) => <li key={`${item.title}-${index}`}><time>{item.time}</time><div><strong>{item.title}</strong><p>{item.detail}</p></div></li>)}</ol></div>
    </section>
  );
}

function ChecklistPanel({ items }) {
  const checklist = items.map(localizeChecklistItem);
  const passed = checklist.filter((item) => item.status === "passed").length;
  const ready = checklist.filter((item) => item.status === "ready").length;
  const allReadyForReview = ready === checklist.length && checklist.length > 0;
  const badge = allReadyForReview ? `${ready}/${checklist.length} sẵn sàng đối chiếu` : `${passed}/${checklist.length} đạt`;
  return <section className="side-panel checklist-panel"><div className="section-title-row"><h2>Danh sách kiểm tra thương hiệu & chất lượng</h2><StatusLabel tone={passed === checklist.length && checklist.length > 0 ? "success" : "current"}>{badge}</StatusLabel></div><ul>{checklist.map((item) => { const Icon = item.status === "passed" || item.status === "ready" ? CheckCircle : item.status === "blocked" ? WarningCircle : Clock; return <li key={item.id} className={`checklist-item checklist-item--${item.status}`}><Icon size={20} weight={item.status === "ready" ? "regular" : "fill"} /><span><strong>{item.label}</strong>{item.status === "ready" && <small>Đã có đủ bằng chứng để chủ doanh nghiệp đối chiếu; chưa phải phê duyệt xuất bản.</small>}{item.detail && <small>{item.detail}</small>}</span></li>; })}</ul></section>;
}

const contentFilterOptions = [
  { id: "pending", label: "Cần duyệt" },
  { id: "approved", label: "Đã duyệt" },
  { id: "revision", label: "Cần sửa" },
  { id: "published", label: "Đã đăng", disabled: true },
];

const contentStatusCopy = Object.freeze({
  pending: { label: "Cần duyệt", tone: "current" },
  approved: { label: "Đã duyệt nội bộ", tone: "success" },
  revision: { label: "Cần chỉnh sửa", tone: "blocked" },
  published: { label: "Đã đăng trên kênh", tone: "success" },
});

const eventLabels = Object.freeze({
  "job.created": "Tạo phiếu công việc",
  "agent.claimed": "Coding Agent nhận task",
  "agent.revision_claimed": "Bắt đầu vòng chỉnh sửa",
  "agent.expired_claim_reclaimed": "Khôi phục task hết hạn",
  "qa.verdict_recorded": "Ghi nhận kiểm định độc lập",
  "agent.completed": "Hoàn tất bản sản xuất",
  "owner.decision_recorded": "Chủ doanh nghiệp đưa ra quyết định",
});

function formatManagerDate(value) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return value || "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(parsed);
}

function ContentStateLabel({ state }) {
  const presentation = contentStatusCopy[state] ?? { label: "Đang xử lý", tone: "current" };
  return <StatusLabel tone={presentation.tone}>{presentation.label}</StatusLabel>;
}

function ReadableMetadata({ entries, empty }) {
  if (!entries.length) return <p className="content-record__empty-note">{empty}</p>;
  return <div className="metadata-stack">{entries.map((entry) => <article className="metadata-card" key={entry.id}><span>{entry.path}</span>{typeof entry.value === "string" ? <p>{entry.value}</p> : <pre>{JSON.stringify(entry.value, null, 2)}</pre>}</article>)}</div>;
}

function FullContentPanel({ record }) {
  const artifacts = parseContentArtifacts(record);
  const items = listContentUnits(record);
  const itemsKey = items.map((item) => item.id).join("|");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [locale, setLocale] = useState("");
  useEffect(() => { if (!items.some((item) => item.id === selectedItemId)) setSelectedItemId(items[0]?.id ?? ""); }, [itemsKey, selectedItemId]);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0] ?? null;
  const selectedVariant = selectedItem?.variants.find((variant) => variant.locale === locale) ?? selectedItem?.variants[0] ?? null;
  useEffect(() => { if (!selectedItem?.variants.some((variant) => variant.locale === locale)) setLocale(selectedItem?.variants[0]?.locale ?? ""); }, [selectedItemId, selectedItem?.variants.map((variant) => variant.locale).join("|"), locale]);
  if (!artifacts.length) return <div className="content-record__empty"><FileText size={34} /><h3>Chưa có tệp nội dung để hiển thị</h3><p>Task này chưa bàn giao tệp kết quả đã được kiểm định.</p></div>;
  if (!selectedItem) return <div className="content-record__empty"><FileText size={34} /><h3>Chưa có bài nội dung để liệt kê</h3><p>Các tệp thô vẫn có thể xem trong phần bằng chứng kỹ thuật.</p>{artifacts.map((artifact) => <details className="raw-artifact-details" key={artifact.id}><summary>{artifact.reference}</summary>{artifact.rawContent && <pre>{artifact.rawContent}</pre>}</details>)}</div>;
  const channelLabel = channelPreviewProfiles.find(({ id }) => id === selectedItem.channelId)?.label ?? "Chưa gắn kênh";
  const sourceArtifact = artifacts.find((artifact) => artifact.id === selectedItem.artifactId);
  return <div className="content-unit-browser"><header className="content-unit-browser__intro"><div><span className="review-bundle__eyebrow">Campaign là nhóm công việc</span><h3>{items.length} bài theo kênh</h3><p>Chọn một bài bên trái. Locale là các biến thể của cùng bài; mỗi locale xem riêng để tránh lặp dài.</p></div><StatusLabel tone="current">{items.length} bài trong lô</StatusLabel></header><div className="content-unit-browser__grid"><nav className="content-unit-browser__list" aria-label="Chọn nội dung trong campaign">{items.map((item, index) => { const label = channelPreviewProfiles.find(({ id }) => id === item.channelId)?.label ?? "Chưa gắn kênh"; return <button key={item.id} type="button" className={item.id === selectedItem.id ? "is-selected" : ""} onClick={() => setSelectedItemId(item.id)}><span>{String(index + 1).padStart(2, "0")} · {label}</span><strong>{item.title}</strong><small>{item.variants.length} locale</small></button>; })}</nav><article className="content-unit-browser__detail"><header><div><span className="review-bundle__eyebrow">{channelLabel}</span><h3>{selectedItem.title}</h3></div>{selectedItem.variants.length > 1 && <label><span>Ngôn ngữ</span><select aria-label="Ngôn ngữ nội dung đầy đủ" value={selectedVariant?.locale ?? ""} onChange={(event) => setLocale(event.target.value)}>{selectedItem.variants.map((variant) => <option key={variant.locale} value={variant.locale}>{variant.locale}</option>)}</select></label>}</header><div className="locale-copy"><strong>{selectedVariant?.locale}</strong><dl>{selectedVariant?.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></div>{selectedItem.mediaArtifacts.map((asset) => <VerifiedMediaPreview key={asset.id} jobId={record.jobId} artifact={asset} altText={selectedVariant?.fields.find((field) => field.key === "altText")?.value} />)}<details className="raw-artifact-details"><summary>Dữ liệu gốc và thông tin toàn vẹn</summary><dl><div><dt>Loại dữ liệu</dt><dd>{sourceArtifact?.mediaType ?? "Chưa có"}</dd></div><div><dt>Kích thước</dt><dd>{sourceArtifact?.bytes == null ? "Chưa có" : `${sourceArtifact.bytes} byte`}</dd></div><div><dt>Hash</dt><dd><code>{sourceArtifact?.hash || "Chưa có"}</code></dd></div></dl>{sourceArtifact?.parsed && <pre>{JSON.stringify(sourceArtifact.parsed, null, 2)}</pre>}</details></article></div></div>;
}

function VerifiedMediaPreview({ jobId, artifact, altText }) {
  const [resource, setResource] = useState({ status: "loading", url: "", error: "" });
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    let cancelled = false;
    setPlaybackError("");
    setResource({ status: "loading", url: "", error: "" });
    const query = new URLSearchParams({ reference: artifact.reference });
    canvasFetch(`/api/jobs/${encodeURIComponent(jobId)}/media-preview?${query.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          let detail = "Không thể tải media đã kiểm định.";
          try { detail = (await response.json())?.error?.message ?? detail; } catch { /* Keep the safe fallback. */ }
          throw new Error(detail);
        }
        const mediaType = response.headers.get("Content-Type")?.split(";")[0] ?? "";
        const integrityHash = response.headers.get("X-Canvas-Artifact-SHA256");
        if (mediaType !== artifact.mediaType || integrityHash !== artifact.hash) throw new Error("Tệp media trả về không khớp hash đã kiểm định.");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResource({ status: "ready", url: objectUrl, error: "" });
      })
      .catch((error) => {
        if (cancelled || error.name === "AbortError") return;
        setResource({ status: "error", url: "", error: error.message });
      });
    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact.hash, artifact.mediaType, artifact.reference, jobId]);

  if (resource.status === "loading") return <div className="channel-preview-media-state" role="status">Đang tải tệp media đã kiểm định…</div>;
  if (resource.status !== "ready") return <div className="channel-preview-media-state channel-preview-media-state--error" role="alert">{resource.error || "Không thể xem tệp media."}</div>;
  return <figure className={`channel-preview-media channel-preview-media--${artifact.mediaKind}`}>
    {artifact.mediaKind === "video"
      ? <video src={resource.url} controls preload="metadata" aria-label={altText || `Video ${artifact.reference}`} onError={() => setPlaybackError("Trình duyệt này không phát được codec video trong tệp.")} />
      : <img src={resource.url} alt={altText || `Ảnh ${artifact.reference}`} onError={() => setPlaybackError("Trình duyệt không giải mã được tệp ảnh này.")} />}
    {playbackError && <p className="channel-preview-media__error" role="alert">{playbackError}</p>}
    <figcaption><strong>{artifact.mediaKind === "video" ? "Video đính kèm" : "Ảnh đính kèm"}</strong><span>{artifact.reference.split("/").at(-1)}</span><small>Tệp khớp hash của hồ sơ; preview không tự xác nhận bản quyền hoặc nguồn media.</small></figcaption>
  </figure>;
}

function ChannelPreviewPanel({ record, brandName }) {
  const artifacts = parseContentArtifacts(record);
  const contentUnits = listContentUnits(record);
  const targetChannels = normalizeTargetChannels(record.targetChannels);
  const [requestedChannelId, setRequestedChannelId] = useState(targetChannels[0] ?? "");
  const channelId = targetChannels.includes(requestedChannelId) ? requestedChannelId : targetChannels[0] ?? "";
  const textArtifacts = artifacts.filter((artifact) => artifact.copyGroups.length > 0);
  const channelCopyGroups = textArtifacts.flatMap((artifact) => artifact.copyGroups
    .filter((group) => channelId && (group.channelId === channelId || (!group.channelId && targetChannels.length === 1)))
    .map((group) => ({
    id: `${artifact.id}::${group.id}`,
    artifact,
    group,
    label: `${group.label} · ${artifact.reference.split("/").at(-1)}`,
  })));
  const copyChoices = channelCopyGroups;
  const mediaArtifacts = artifacts.filter((artifact) => artifact.mediaKind && artifact.previewStatus === "media_available")
    .filter((artifact) => channelId && (artifact.channelId === channelId || (targetChannels.length === 1 && !artifact.channelId)));
  const [copyChoiceId, setCopyChoiceId] = useState("");
  const [mediaId, setMediaId] = useState("");
  const [locale, setLocale] = useState("vi");
  const choicesKey = copyChoices.map((choice) => choice.id).join("|");
  const mediaKey = mediaArtifacts.map((asset) => asset.id).join("|");
  useEffect(() => {
    if (!copyChoices.some((choice) => choice.id === copyChoiceId)) setCopyChoiceId(copyChoices[0]?.id ?? "");
  }, [choicesKey, copyChoiceId]);
  useEffect(() => {
    if (!mediaArtifacts.some((asset) => asset.id === mediaId)) setMediaId(mediaArtifacts.length === 1 ? mediaArtifacts[0].id : "");
  }, [mediaKey, mediaId]);

  const profile = channelPreviewProfiles.find((item) => item.id === channelId) ?? channelPreviewProfiles[0];
  const selectedChoice = copyChoices.find((choice) => choice.id === copyChoiceId) ?? copyChoices[0] ?? null;
  const copy = selectedChoice ? selectPreviewCopy([selectedChoice.group], selectedChoice.group.id, locale) : selectPreviewCopy([], "", "");
  const mediaArtifact = mediaArtifacts.find((artifact) => artifact.id === mediaId) ?? null;
  const visualBrief = textArtifacts.map((artifact) => artifact.parsed?.visualBrief).find(Boolean);
  const localeOptions = selectedChoice?.group.variants.map((variant) => variant.locale) ?? [];
  const compactBrandName = String(brandName || "Thương hiệu").trim();
  const declaredChannelName = profile.label;
  const initials = compactBrandName.slice(0, 1).toLocaleUpperCase("vi-VN");
  const mediaView = mediaArtifact
    ? <VerifiedMediaPreview jobId={record.jobId} artifact={mediaArtifact} altText={copy.altText || visualBrief?.accessibility?.altText} />
    : <div className="channel-preview-media-state channel-preview-media-state--empty"><ImageSquare size={22} /><strong>Task chưa có tệp ảnh hoặc video được khai báo.</strong><p>{copy.altText ? `Mô tả media hiện có: ${copy.altText}` : visualBrief ? `Đã có hướng dẫn hình ảnh (${visualBrief.rightsStatus ?? "chưa ghi nhận quyền"}), nhưng chưa có tệp media để dựng preview.` : "Hãy đính kèm tệp media vào cùng task để xem bản kết hợp hoàn chỉnh."}</p></div>;
  const contentText = <div className="channel-preview-copy">
    {copy.headline && <h3>{copy.headline}</h3>}
    {copy.body && <p>{copy.body}</p>}
    {copy.caption && <p>{copy.caption}</p>}
  </div>;
  const action = copy.cta ? <div className="channel-preview-cta" aria-label={`Kêu gọi hành động: ${copy.cta}`}>{copy.cta}<small>CTA mô phỏng · chưa có liên kết đích</small></div> : null;

  if (!targetChannels.length) return <section className="channel-preview-panel" aria-label="Preview nội dung theo kênh"><div className="channel-preview-empty channel-preview-empty--unassigned"><WarningCircle size={24} /><strong>Task này chưa được chỉ định kênh lúc tạo.</strong><p>Để tránh duyệt nhầm định dạng, Canvas không tự chọn Facebook, Instagram, LinkedIn hoặc Blog. Hãy tạo task mới và chọn kênh ngay trong brief.</p></div></section>;

  return <section className="channel-preview-panel" aria-label="Preview nội dung theo kênh">
    <div className="channel-preview-panel__intro"><div><span className="review-bundle__eyebrow">Bản mô phỏng để duyệt</span><h3>Bài đăng hoàn chỉnh · {targetChannels.length > 1 ? "nhiều kênh được chỉ định" : profile.label}</h3><p>Campaign đang nhóm {contentUnits.length || "các"} bài nội dung. Chọn từng bài, kênh và locale để xem một preview hoàn chỉnh; không dồn nhiều ngôn ngữ vào cùng một màn hình.</p>{contentUnits.length > 1 && <p className="content-review-scope-note">Trong alpha, quyết định hiện ghi nhận ở cấp task/campaign và áp dụng toàn bộ gói. Duyệt riêng từng content item (kênh + locale + phiên bản media) cần API approval cấp item, hiện chưa có.</p>}</div><span className="channel-preview-badge">Không xuất bản</span></div>
    <div className="channel-preview-toolbar">
      {targetChannels.length > 1 ? <label><span>Kênh đã chỉ định</span><select aria-label="Kênh đã chỉ định" value={channelId} onChange={(event) => setRequestedChannelId(event.target.value)}>{targetChannels.map((id) => { const item = channelPreviewProfiles.find((profileItem) => profileItem.id === id); return <option key={id} value={id}>{item.label} · {item.surface}</option>; })}</select></label> : <div className="channel-preview-fixed-channel"><span>Kênh đã chỉ định</span><strong>{profile.label} · {profile.surface}</strong></div>}
      <label><span>Bài trong campaign</span><select aria-label="Bài trong campaign" value={selectedChoice?.id ?? ""} onChange={(event) => setCopyChoiceId(event.target.value)} disabled={!copyChoices.length}>{copyChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
      <label><span>Ngôn ngữ</span><select aria-label="Ngôn ngữ preview" value={copy.locale} onChange={(event) => setLocale(event.target.value)} disabled={!localeOptions.length}>{localeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label><span>Media đính kèm</span><select aria-label="Media đính kèm" value={mediaArtifact?.id ?? ""} onChange={(event) => setMediaId(event.target.value)}><option value="">Chưa chọn media</option>{mediaArtifacts.map((item) => <option key={item.id} value={item.id}>{item.mediaKind === "video" ? "Video" : "Ảnh"} · {item.reference.split("/").at(-1)}</option>)}</select></label>
    </div>
    <p className="channel-preview-disclaimer"><Info size={16} />Preview đang hiển thị đúng kênh {declaredChannelName} đã được chỉ định lúc tạo task. Nội dung thiếu channelId sẽ không được tái sử dụng giữa nhiều kênh. Giao diện mô phỏng không thay thế preflight trên tài khoản đích và không xuất bản.</p>
    <div className="channel-preview-stage">
      {!copy.group ? <div className="channel-preview-empty"><WarningCircle size={22} /><strong>Chưa có bản copy riêng cho {declaredChannelName}.</strong><p>Task đang duyệt sẽ không mượn nội dung của kênh khác. Coding Agent cần tạo một biến thể có channelId: {channelId}.</p></div> : profile.editorial ? <article className="channel-preview-post channel-preview-post--blog">
        <div className="channel-preview-blog-meta">{compactBrandName} <span>·</span> Bài viết xem trước <span>·</span> {copy.locale}</div>
        <h2>{copy.headline || "Bài viết chưa có tiêu đề"}</h2>
        {copy.caption && <p className="channel-preview-blog-dek">{copy.caption}</p>}
        {mediaView}
        {copy.body && <p className="channel-preview-blog-body">{copy.body}</p>}
        {action}
      </article> : <article className={`channel-preview-post channel-preview-post--${profile.id}`}>
        <header className="channel-preview-post__header"><span className="channel-preview-avatar" aria-hidden="true">{initials}</span><div><strong>{compactBrandName}</strong><span>{profile.surface} · Bản nháp nội bộ</span></div><span className="channel-preview-post__menu" aria-hidden="true">•••</span></header>
        {profile.mediaPlacement === "before-copy" && mediaView}
        {contentText}
        {profile.mediaPlacement === "after-copy" && mediaView}
        {action}
        <div className="channel-preview-post__engagement" aria-hidden="true">Thích　·　Bình luận　·　Chia sẻ <span>Phần giao diện tương tác chỉ để mô phỏng</span></div>
      </article>}
    </div>
    <p className="channel-preview-footnote">Preview dùng đúng nội dung và tệp trong hồ sơ đang duyệt. Hash chỉ xác nhận tệp khớp hồ sơ; hãy đối chiếu nguồn, quyền sử dụng và provenance trong tab Media cuối & nguồn. Tỷ lệ ảnh chỉ mô phỏng crop, không sửa tệp gốc hay quyết định nội bộ.</p>
  </section>;
}

function MediaSourcePanel({ record }) {
  const artifacts = parseContentArtifacts(record);
  const finalMedia = artifacts.filter((artifact) => artifact.mediaKind && artifact.previewStatus === "media_available");
  const mediaEntries = artifacts.flatMap((artifact) => artifact.mediaMetadata.map((entry) => ({ ...entry, id: `${artifact.id}-${entry.id}` })));
  const sourceEntries = artifacts.flatMap((artifact) => artifact.sourceMetadata.map((entry) => ({ ...entry, id: `${artifact.id}-${entry.id}` })));
  return <div className="media-source-workspace"><section className="final-media-deliverables"><div className="content-tab-heading"><ImageSquare size={22} /><div><h3>Tệp media cuối được bàn giao</h3><p>Chỉ tệp ảnh/video thật đã được hash-verify mới xuất hiện ở đây. Prompt và visual brief không phải media.</p></div><StatusLabel tone={finalMedia.length ? "success" : "blocked"}>{finalMedia.length ? `${finalMedia.length} tệp` : "Thiếu tệp cuối"}</StatusLabel></div>{finalMedia.length ? <div className="final-media-deliverables__grid">{finalMedia.map((asset) => <VerifiedMediaPreview key={asset.id} jobId={record.jobId} artifact={asset} altText="Tệp media trong gói đã kiểm định" />)}</div> : <div className="channel-preview-media-state channel-preview-media-state--empty"><ImageSquare size={20} /><strong>Chưa có ảnh/video cuối.</strong><p>Nếu media được chọn là bắt buộc, gói phải dừng trước đánh giá cho tới khi Coding Agent bàn giao file thật có chữ ký định dạng hợp lệ.</p></div>}</section><div className="media-source-grid"><section><div className="content-tab-heading"><ShieldCheck size={22} /><div><h3>Nguồn, quyền sử dụng và provenance</h3><p>Đối chiếu nguồn, quyền, giấy phép và bằng chứng trước khi duyệt.</p></div></div><ReadableMetadata entries={sourceEntries} empty="Gói hiện tại chưa khai báo nguồn hoặc quyền sử dụng có cấu trúc." /></section><section><details className="media-technical-details"><summary>Brief hình ảnh, accessibility và metadata kỹ thuật</summary><p>Đây là hướng dẫn và hồ sơ hỗ trợ sản xuất; không thay thế tệp media cuối.</p><ReadableMetadata entries={mediaEntries} empty="Gói hiện tại chưa khai báo metadata media có cấu trúc." /></details></section></div></div>;
}

function QualityEvidencePanel({ record }) {
  const dimensions = qualityDimensionsForRecord(record);
  const review = record.review ?? {};
  const qa = review.qa ?? {};
  return <div className="quality-evidence"><section className="quality-evidence__summary"><div><span>Kết luận kiểm định</span><strong>{localizeStatusText(qa.verdict)}</strong></div><div><span>Người kiểm định</span><strong>{vietnameseRoleLabels[qa.reviewerRole] ?? qa.reviewerRole ?? "Chưa có"}</strong></div><div><span>Phiên bản rubric</span><strong>{qa.rubricVersion ?? "Chưa có"}</strong></div><div><span>Provenance</span><strong>{qa.provenanceComplete ? "Đầy đủ cho vòng hiện tại" : "Chưa đầy đủ"}</strong></div></section><section className="score-dimensions"><div className="content-tab-heading"><ShieldCheck size={22} /><div><h3>Điểm theo từng tiêu chí</h3><p>Điểm QA nội bộ từ 1–5; đây không phải dữ liệu hiệu quả sau xuất bản.</p></div></div>{dimensions.length ? <ul>{dimensions.map((dimension) => <li key={dimension.id}><span>{dimension.label}</span><div><i style={{ width: `${dimension.score * 20}%` }} /><strong>{dimension.score}/5</strong></div></li>)}</ul> : <p className="content-record__empty-note">Chưa có điểm QA có cấu trúc.</p>}</section><section className="qa-notes"><h3>Ghi chú kiểm định</h3><p>{qa.notes || "Người kiểm định chưa thêm ghi chú."}</p></section><section className="review-checklist content-review-checklist"><h3>Checklist dùng khi duyệt</h3><ul>{(review.checklist ?? []).map((item, index) => { const normalized = localizeChecklistItem(item, index); return <li key={normalized.id}><CheckCircle size={18} /><span><strong>{normalized.label}</strong>{normalized.detail && <small>{normalized.detail}</small>}</span></li>; })}</ul></section></div>;
}

function VersionHistoryPanel({ record }) {
  const versions = record.versions ?? [];
  const decisions = record.decisionHistory ?? [];
  const activity = record.activity ?? [];
  return <div className="history-grid"><section><div className="content-tab-heading"><GitBranch size={22} /><div><h3>Phiên bản sản xuất</h3><p>Mỗi attempt của Coding Agent được giữ thành một mốc truy vết riêng.</p></div></div>{versions.length ? <ol className="version-list">{versions.map((version) => <li key={version.attemptId} className={version.isCurrent ? "is-current" : ""}><span>V{version.number}</span><div><strong>{version.attemptId}</strong><p>{version.completedAt ? `Hoàn tất ${formatManagerDate(version.completedAt)}` : `Bắt đầu ${formatManagerDate(version.startedAt)}`}</p><small>QA: {localizeStatusText(version.qaVerdict)}{version.ownerDecision ? ` · Quyết định: ${version.ownerDecision === "accept" ? "Duyệt nội bộ" : "Yêu cầu sửa"}` : ""}</small></div>{version.isCurrent && <StatusLabel tone="current">Hiện tại</StatusLabel>}</li>)}</ol> : <p className="content-record__empty-note">Chưa có phiên bản được ghi nhận.</p>}</section><section><div className="content-tab-heading"><ClipboardText size={22} /><div><h3>Lịch sử quyết định</h3><p>Lý do duyệt hoặc yêu cầu sửa được giữ lại để các vòng sau hiểu đúng ý chủ doanh nghiệp.</p></div></div>{decisions.length ? <ol className="decision-history">{decisions.map((item, index) => <li key={`${item.decidedAt}-${index}`}><span>{item.decision === "accept" ? <CheckCircle weight="fill" /> : <WarningCircle weight="fill" />}</span><div><strong>{item.decision === "accept" ? "Đã duyệt nội bộ" : item.decision === "revise" ? "Yêu cầu chỉnh sửa" : "Đã chặn"}</strong><time>{formatManagerDate(item.decidedAt)}</time><p>{item.reason || "Không có lý do được ghi lại."}</p></div></li>)}</ol> : <p className="content-record__empty-note">Chưa có quyết định của chủ doanh nghiệp.</p>}</section><section className="history-activity"><details><summary>Nhật ký workflow ({activity.length} sự kiện)</summary><ol>{activity.map((item, index) => <li key={`${item.occurredAt}-${index}`}><time>{formatManagerDate(item.occurredAt)}</time><strong>{eventLabels[item.eventType] ?? item.eventType}</strong><span>{item.actorRole}{item.attemptId ? ` · ${item.attemptId}` : ""}</span></li>)}</ol></details></section></div>;
}

function AgentWorkLogPanel({ record }) {
  const artifact = parseContentArtifacts(record).find((item) => item.parsed?.artifactKind === "agent_work_log");
  const workLog = artifact?.parsed;
  const matchingAttempt = !record.review?.receipt?.attemptId || workLog?.attemptId === record.review.receipt.attemptId;
  if (!workLog || !Array.isArray(workLog.steps) || workLog.steps.length === 0 || !matchingAttempt) return <section className="agent-work-log"><div className="content-tab-heading"><GitBranch size={22} /><div><h3>Kết quả theo từng công đoạn</h3><p>Theo dõi kết quả bàn giao để đánh giá chất lượng từng vai trò.</p></div></div><div className="agent-work-log__empty"><Info size={22} /><div><strong>Task này chưa có nhật ký công đoạn.</strong><p>Các task cũ chỉ có artifact tổng, QA và sự kiện vòng đời. Task mới sẽ yêu cầu Coding Agent gửi agent-work-log.json để quản lý xem đầu vào/đầu ra, người phụ trách, thời lượng và lỗi từng bước. Không lưu chain-of-thought.</p></div></div></section>;
  return <section className="agent-work-log"><div className="content-tab-heading"><GitBranch size={22} /><div><h3>Kết quả theo từng công đoạn</h3><p>Lần chạy {workLog.attemptId} · {workLog.steps.length} bước được ghi nhận · kết quả đã gắn với bộ artifact được QA.</p></div></div><ol className="agent-work-log__steps">{workLog.steps.map((item, index) => { const tone = item.status === "complete" ? "success" : item.status === "blocked" ? "blocked" : "current"; const channel = channelPreviewProfiles.find(({ id }) => id === item.channelId)?.label; return <li key={`${item.stepId}-${item.workerId}-${item.channelId ?? "all"}-${index}`}><span className="agent-work-log__index">{String(index + 1).padStart(2, "0")}</span><div><div className="agent-work-log__meta"><strong>{item.stepId} · {item.label}</strong><StatusLabel tone={tone}>{item.status === "complete" ? "Hoàn tất" : item.status === "blocked" ? "Bị chặn" : item.status === "revise" ? "Cần sửa" : "Bỏ qua"}</StatusLabel></div><p>{item.summary}</p><small>{workerLabel(item.workerId)}{channel ? ` · ${channel}` : " · áp dụng chung"} · {formatManagerDate(item.startedAt)} → {formatManagerDate(item.finishedAt)}</small>{(item.inputReferences?.length > 0 || item.outputReferences?.length > 0) && <dl><div><dt>Đầu vào</dt><dd>{item.inputReferences?.join(" · ") || "Không ghi nhận"}</dd></div><div><dt>Đầu ra</dt><dd>{item.outputReferences?.join(" · ") || "Không có tệp bàn giao"}</dd></div></dl>}{item.issueCodes?.length > 0 && <p className="agent-work-log__issues">Mã vấn đề: {item.issueCodes.join(", ")}</p>}</div></li>; })}</ol></section>;
}

function ContentRecordDetail({ selectedJob, recordState, onDecision, brandName }) {
  const [tab, setTab] = useState("content");
  const jobId = selectedJob?.jobId ?? selectedJob?.state?.jobId;
  useEffect(() => setTab(contentReviewState(selectedJob) === "pending" ? "preview" : "content"), [jobId]);
  if (!selectedJob) return <section className="content-record content-record--empty"><div className="content-record__empty"><FileText size={38} /><h2>Chưa có nội dung trong nhóm này</h2><p>Chọn một trạng thái khác hoặc tạo task sản xuất nội dung mới.</p></div></section>;
  if (recordState.status === "loading") return <section className="content-record content-record--loading" aria-busy="true"><div /><div /><div /></section>;
  if (recordState.status !== "ready") return <section className="content-record content-record--empty"><div className="content-record__empty"><WarningCircle size={38} /><h2>Không thể mở hồ sơ nội dung</h2><p>{recordState.error || "Gói nội dung chưa sẵn sàng để hiển thị."}</p></div></section>;
  const record = recordState.data;
  const reviewState = contentReviewState(selectedJob);
  const canDecide = reviewState === "pending" && record.review?.readyForOwnerDecision === true;
  const tabs = [{ id: "preview", label: "Bài đăng preview" }, { id: "content", label: "Nội dung đầy đủ" }, { id: "process", label: "Quy trình & kết quả" }, { id: "media", label: "Media cuối & nguồn" }, { id: "quality", label: "Chất lượng" }, { id: "history", label: "Phiên bản & quyết định" }];
  return <section className="content-record"><header className="content-record__header"><div><div className="content-record__status"><ContentStateLabel state={reviewState} /><span>Cập nhật {formatManagerDate(record.updatedAt)}</span></div><h2>{record.title}</h2><p>{record.campaignSummary || record.managerTaskDescription}</p></div>{canDecide && <div className="content-record__actions"><button className="secondary-button" type="button" onClick={() => onDecision("revise", jobId)}>Yêu cầu sửa</button><button className="primary-button" type="button" onClick={() => onDecision("accept", jobId)}>Duyệt nội bộ</button></div>}</header><nav className="content-record__tabs" aria-label="Chi tiết hồ sơ nội dung">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} type="button" onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="content-record__body">{tab === "content" && <FullContentPanel record={record} />}{tab === "preview" && <ChannelPreviewPanel record={record} brandName={brandName} />}{tab === "process" && <AgentWorkLogPanel record={record} />}{tab === "media" && <MediaSourcePanel record={record} />}{tab === "quality" && <QualityEvidencePanel record={record} />}{tab === "history" && <VersionHistoryPanel record={record} />}</div><p className="content-record__boundary"><ShieldCheck size={17} />Duyệt nội bộ không cấp quyền xuất bản, gửi, lên lịch, tạo campaign, tải audience hoặc chi tiêu.</p></section>;
}

function ContentWorkspace({ jobs, filter, onFilter, selectedJobId, onSelectJob, recordState, onDecision, brandName, connectionMode, onCreateTask }) {
  const contentJobs = Array.isArray(jobs) ? jobs : [];
  const visibleJobs = filterContentJobs(contentJobs, filter);
  const selectedJob = visibleJobs.find((job) => (job.jobId ?? job.state?.jobId) === selectedJobId) ?? visibleJobs[0] ?? null;
  return <main className="content-workspace"><header className="content-workspace__header"><div><p className="breadcrumb">Thư viện nội dung&nbsp; / &nbsp;Hồ sơ nội bộ</p><h1>Nội dung & duyệt</h1><p>Đọc bài hoàn chỉnh theo kênh, xem media, kết quả từng bước và QA trước quyết định cuối.</p></div><div className="content-workspace__summary"><strong>{contentJobs.filter((job) => contentReviewState(job)).length}</strong><span>hồ sơ nội bộ</span></div></header>
    {connectionMode === "demo" && <section className="content-connection-notice" role="alert"><WarningCircle size={23} /><div><strong>Trình duyệt này chưa kết nối workspace thật.</strong><p>Bạn đang thấy bản mẫu nên danh sách task trống và nút duyệt bị khóa. Quay về tab Codex, chọn <b>Sao chép link riêng</b>, rồi mở link đó trong trình duyệt ngoài. Link cấp quyền local và chỉ nên dùng trên cùng máy.</p></div></section>}
    <section className="content-lifecycle-note"><div><span className="review-bundle__eyebrow">Theo dõi và báo cáo</span><strong>Duyệt nội bộ không đồng nghĩa đã đăng.</strong><p>Alpha hiện lưu phiên bản, người duyệt, lý do, kênh đã chỉ định và kết quả QA. Chưa có kết nối xuất bản, biên nhận từ nền tảng hoặc số liệu reach/click/conversion. Chi tiết trạng thái và báo cáo đề xuất nằm trong vòng đời nội dung.</p></div><StatusLabel tone="current">Xuất bản & analytics chưa kết nối</StatusLabel></section>
    <nav className="content-filters" aria-label="Lọc nội dung theo trạng thái">{contentFilterOptions.map((item) => { const count = filterContentJobs(jobs, item.id).length; return <button type="button" key={item.id} disabled={item.disabled} title={item.disabled ? "Chưa kết nối publishing receipt; chưa có trạng thái đã đăng đáng tin cậy." : undefined} className={`${filter === item.id ? "is-active" : ""} ${item.disabled ? "is-disabled" : ""}`} onClick={() => !item.disabled && onFilter(item.id)}><span>{item.label}{item.disabled && <small>Chưa kết nối</small>}</span><strong>{count}</strong></button>; })}</nav>
    <div className="content-workspace__grid"><aside className="content-library"><div className="content-library__heading"><h2>{contentStatusCopy[filter]?.label}</h2><span>{visibleJobs.length} hồ sơ</span></div>{visibleJobs.length ? <ul>{visibleJobs.map((job) => { const state = job.state ?? job; const id = job.jobId ?? state.jobId; const selected = id === selectedJob?.jobId || id === selectedJob?.state?.jobId; return <li key={id}><button className={selected ? "is-selected" : ""} type="button" onClick={() => onSelectJob(id)}><div><ContentStateLabel state={contentReviewState(job)} /><time>{formatManagerDate(state.updatedAt)}</time></div><strong>{state.title || id}</strong><p>{state.campaignSummary || state.managerTaskDescription || "Hồ sơ nội dung nội bộ"}</p><span>Xem nội dung chi tiết <ArrowRight /></span></button></li>; })}</ul> : <div className="content-library__empty"><FileText size={28} /><p>{filter === "published" ? "Chưa có bài đã đăng: nền tảng chưa gửi biên nhận xuất bản vào Canvas." : "Không có hồ sơ ở trạng thái này."}</p>{filter !== "published" && connectionMode === "connected" && <button className="text-button" type="button" onClick={onCreateTask}>Tạo task nội dung <ArrowRight /></button>}</div>}</aside><ContentRecordDetail selectedJob={selectedJob} recordState={recordState} onDecision={onDecision} brandName={brandName} /></div></main>;
}

function PlaceholderModule({ name, onBack }) {
  return <section className="placeholder-module"><StatusLabel tone="current">Không gian thử nghiệm</StatusLabel><h1>{name}</h1><p>Khu vực này sẽ dùng chung dữ liệu chiến dịch, lịch sử quyết định và kết quả từ Coding Agent. Bản thử nghiệm hiện ưu tiên luồng Tổng quan và duyệt task của chủ doanh nghiệp.</p><button className="primary-button" type="button" onClick={onBack}>Quay lại Tổng quan</button></section>;
}

function WorkflowCanvas({ connectionMode, assignedSubagents, onToggleSubagent, onCreateTask, onCopyAutomationPrompt }) {
  const [workflowId, setWorkflowId] = useState("W2_content_factory");
  const workflow = workflowDefinitions.find((item) => item.id === workflowId) ?? workflowDefinitions[2];
  const [selectedStepId, setSelectedStepId] = useState(workflow.steps[0].id);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draggedBranch, setDraggedBranch] = useState("");
  const [productionOrder, setProductionOrder] = useState(readW2ProductionOrder);
  useEffect(() => setSelectedStepId(workflow.steps[0].id), [workflowId]);
  const step = workflow.steps.find((item) => item.id === selectedStepId) ?? workflow.steps[0];
  const worker = agentRoster.find(({ id }) => id === step.worker) ?? subagentRoster.find(({ id }) => id === step.worker) ?? null;
  const selectedCell = workflowCells.find((item) => item.leadAgent === step.worker || item.subagents.includes(step.worker));
  const contentCell = workflowCells.find((item) => item.id === "content_cell");
  useEffect(() => { try { window.localStorage.setItem(w2ProductionOrderStorageKey, JSON.stringify(productionOrder)); } catch { /* The manifest still records the selected order when the job is created. */ } }, [productionOrder]);
  const productionSteps = productionOrder.map((branch) => workflow.steps.find((item) => item.id === (branch === "copy" ? "W2.3" : "W2.4"))).filter(Boolean);
  const orderedSteps = workflow.id === "W2_content_factory"
    ? [...workflow.steps.filter((item) => !["W2.3", "W2.4"].includes(item.id)).flatMap((item) => item.id === "W2.5" ? [...productionSteps, item] : [item])]
    : workflow.steps;
  const reorderProduction = (source, target) => {
    if (!source || !target || source === target) return;
    const current = [...productionOrder];
    const sourceIndex = current.indexOf(source);
    const targetIndex = current.indexOf(target);
    [current[sourceIndex], current[targetIndex]] = [current[targetIndex], current[sourceIndex]];
    setProductionOrder(current);
  };
  const moveProductionBranch = (branch, direction) => {
    const current = [...productionOrder];
    const index = current.indexOf(branch);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= current.length) return;
    [current[index], current[targetIndex]] = [current[targetIndex], current[index]];
    setProductionOrder(current);
  };
  const selectedRole = agentRoster.find(({ id }) => id === selectedRoleId) ?? subagentRoster.find(({ id }) => id === selectedRoleId) ?? null;
  const selectedRoleCell = workflowCells.find((item) => item.leadAgent === selectedRoleId || item.subagents.includes(selectedRoleId));

  return <main className="workflow-canvas">
    <header className="workflow-canvas__header"><div><p className="breadcrumb">Điều hành AI&nbsp; / &nbsp;Mô hình quy trình</p><h1>Agents, Sub-Agents & quy trình làm việc</h1><p>Xem ai làm gì, kết quả bàn giao ở đâu và cổng nào cần quản lý quyết định. Sơ đồ mô phỏng cấu hình framework; trạng thái chạy thực tế lấy từ task.</p></div><button className="primary-button" type="button" onClick={onCreateTask}><Plus weight="bold" />Tạo task W2</button></header>
    <div className={`workflow-canvas__runtime workflow-canvas__runtime--${connectionMode}`}><Info size={19} /><span>{connectionMode === "connected" ? "Canvas đang kết nối với workspace cục bộ. Task mới lưu kênh, chính sách media, đội ngũ và độ ưu tiên copy/media vào manifest bất biến." : "Đang xem bản mẫu. Có thể xem sơ đồ, nhưng cần mở private URL để tạo task thật trong workspace."}</span></div>
    <nav className="workflow-selector" aria-label="Chọn workflow">{workflowDefinitions.map((item) => <button key={item.id} type="button" className={item.id === workflowId ? "is-active" : ""} onClick={() => setWorkflowId(item.id)}><span>{item.label}</span><small>{item.id === "W2_content_factory" ? "Có thể tạo task trong alpha" : "Xem mô phỏng"}</small></button>)}</nav>
    <section className="workflow-canvas__process">
      <div className="workflow-canvas__process-header"><div><span className="context-label">{workflow.id}</span><h2>{workflow.label}</h2><p>{workflow.gate}</p></div><StatusLabel tone={workflow.id === "W2_content_factory" ? "success" : "current"}>{workflow.id === "W2_content_factory" ? "Đang hỗ trợ" : "Mô phỏng topology"}</StatusLabel></div>
      {workflow.id === "W2_content_factory" && <div className="workflow-assignment-editor"><div><h3>Đội sản xuất task mới</h3><p>Lead Agent được framework khóa theo năng lực. Chọn Sub-Agent hỗ trợ; lựa chọn sẽ được lưu vào phiếu W2 tiếp theo.</p><div className="workflow-assignment-editor__lead"><span>Lead Agent</span><strong>{workerLabel(contentCell.leadAgent)}</strong><small>Không thể thay lead bằng vai trò không có năng lực sản xuất nội dung.</small></div></div><fieldset><legend>Sub-Agents tham gia</legend>{contentCell.subagents.map((id) => { const item = subagentRoster.find((agent) => agent.id === id); return <label key={id} className="workflow-assignment-option"><input type="checkbox" checked={assignedSubagents.includes(id)} onChange={() => onToggleSubagent(id)} /><span><strong>{item.label}</strong><small>{item.purpose}</small></span></label>; })}<small className="workflow-assignment-editor__hint">Cấu hình được lưu trên trình duyệt này; khi tạo task, backend xác minh lại roster được phép.</small></fieldset></div>}
      {workflow.id === "W2_content_factory" && <p className="workflow-canvas__drag-note">Kéo thả hoặc dùng mũi tên để đổi độ ưu tiên hai nhánh độc lập: copy và media. Cả hai phải xong trước khi ghép preview; lint, QA và duyệt cuối luôn khóa thứ tự.</p>}
      <ol className="workflow-canvas__track" aria-label={`Các bước trong ${workflow.label}`}>{orderedSteps.map((item, index) => { const branch = item.id === "W2.3" ? "copy" : item.id === "W2.4" ? "media" : ""; const stepCell = workflowCells.find((cell) => cell.leadAgent === item.worker || cell.subagents.includes(item.worker)); return <li key={item.id} className={`${item.id === step.id ? "is-selected" : ""} ${branch ? "is-draggable" : "is-locked"}`} draggable={Boolean(branch)} onDragStart={(event) => { if (branch) { setDraggedBranch(branch); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", branch); } }} onDragOver={(event) => { if (branch) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain") || draggedBranch; reorderProduction(source, branch); setDraggedBranch(""); }} onDragEnd={() => setDraggedBranch("")}><div className="workflow-canvas__node"><button className="workflow-canvas__node-select" type="button" onClick={() => setSelectedStepId(item.id)} aria-current={item.id === step.id ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")} · {item.id}</span><strong>{item.label}</strong><small>{workerLabel(item.worker)}</small></button><button className="workflow-canvas__role-link" type="button" onClick={() => setSelectedRoleId(item.worker)}>Vai trò chi tiết</button>{branch && <div className="workflow-canvas__move-controls"><button type="button" aria-label="Đưa bước lên trước" onClick={() => moveProductionBranch(branch, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="Đưa bước xuống sau" onClick={() => moveProductionBranch(branch, 1)}><ArrowDown size={14} /></button><span>Kéo để sắp xếp</span></div>}<div className="workflow-canvas__node-team"><small>Phối hợp trong nhóm</small>{(stepCell?.subagents ?? []).map((id) => { const subagent = subagentRoster.find((agent) => agent.id === id); return <button key={id} type="button" onClick={() => setSelectedRoleId(id)}>{subagent?.label ?? id}</button>; })}</div></div></li>; })}</ol>
      <article className="workflow-step-detail"><div className="workflow-step-detail__number">{step.id}</div><div><span className="review-bundle__eyebrow">Ai chịu trách nhiệm</span><h3>{worker?.label ?? workerLabel(step.worker)}</h3><p>{worker?.purpose ?? (step.worker === "deterministic_gate" ? "Framework tự động kiểm tra hợp đồng, hash và các hard-fail; không dùng điểm này làm hiệu quả marketing." : "Người chịu trách nhiệm đưa ra quyết định cuối cùng tại cổng này." )}</p><dl><div><dt>Kết quả của bước</dt><dd>{step.output}</dd></div><div><dt>Liên kết đội</dt><dd>{selectedCell ? `${selectedCell.label}: ${workerLabel(selectedCell.leadAgent)} phối hợp cùng ${selectedCell.subagents.map(workerLabel).join(", ")}.` : "Cổng framework hoặc người quản lý độc lập với nhóm sản xuất."}</dd></div><div><dt>Cổng duyệt</dt><dd>{workflow.gate}</dd></div></dl></div></article>
      {selectedRole && <aside className="workflow-role-detail"><div><span className="review-bundle__eyebrow">Hồ sơ vai trò · {agentRoster.some(({ id }) => id === selectedRoleId) ? "Agent" : "Sub-Agent"}</span><h3>{selectedRole.label}</h3><p>{selectedRole.purpose}</p></div><dl><div><dt>Đầu vào</dt><dd>{selectedRole.inputs ?? "Nhận đúng dữ liệu tối thiểu do bước trước bàn giao; không truy cập dữ liệu ngoài phạm vi task."}</dd></div><div><dt>Kết quả bàn giao</dt><dd>{selectedRole.outputs ?? workflow.steps.find((item) => item.worker === selectedRoleId)?.output ?? "Một kết quả kiểm tra/đề xuất hẹp gắn với artifact của workflow."}</dd></div><div><dt>Giới hạn quyền</dt><dd>{selectedRole.boundary ?? "Không tự phê duyệt, xuất bản, gửi, lên lịch, truy cập credential hoặc chi tiêu."}</dd></div><div><dt>Nhóm phối hợp</dt><dd>{selectedRoleCell ? `${selectedRoleCell.label} · Lead ${workerLabel(selectedRoleCell.leadAgent)} · ${selectedRoleCell.subagents.length} Sub-Agent.` : "Làm việc theo vai trò được khai báo trong workflow này."}</dd></div></dl></aside>}
    </section>
    <section className="workflow-roster"><div className="workflow-roster__heading"><div><span className="review-bundle__eyebrow">Đội ngũ framework</span><h2>Toàn bộ Agents và Sub-Agents</h2><p>Agent là vai trò chịu trách nhiệm. Sub-Agent xử lý một nhiệm vụ hẹp và trả về kết quả kiểm tra/đề xuất cho Agent chính.</p></div><span className="context-label">{agentRoster.length} Agents · {subagentRoster.length} Sub-Agents</span></div>
      <div className="workflow-agent-grid">{agentRoster.map((agent) => <article className="workflow-agent-card" key={agent.id} role="button" tabIndex={0} onClick={() => setSelectedRoleId(agent.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedRoleId(agent.id); }}><div><span>{agent.capability}</span><strong>{agent.label}</strong></div><p>{agent.purpose}</p><code>{agent.id}</code></article>)}</div>
      <div className="workflow-cell-grid">{workflowCells.map((cell) => { const lead = agentRoster.find((agent) => agent.id === cell.leadAgent); return <article className="workflow-cell-card" key={cell.id}><header><span>Nhóm quy trình</span><h3>{cell.label}</h3></header><div className="workflow-cell-card__lead"><strong>Lead · {lead?.label ?? cell.leadAgent}</strong><small>{lead?.purpose}</small></div><ul>{cell.subagents.map((id) => { const agent = subagentRoster.find((item) => item.id === id); const editable = cell.id === "content_cell" && workflow.id === "W2_content_factory"; return <li key={id} className={editable && assignedSubagents.includes(id) ? "is-assigned" : ""}><span className="workflow-cell-card__dot" /><div><strong>{agent?.label ?? id}</strong><small>{agent?.purpose}</small></div><code>{editable ? assignedSubagents.includes(id) ? "Đã chọn" : "Tùy chọn" : "Theo topology"}</code></li>; })}</ul><small className="workflow-cell-card__footnote">{cell.id === "quality_cell" ? "Được ánh xạ vào tenant và phải độc lập với Agent tạo nội dung." : "Sub-Agent tạo kết quả hỗ trợ; không tự duyệt, xuất bản hoặc chi tiêu."}</small></article>; })}</div>
    </section>
    <section className="workflow-automation-guidance"><article><div><span className="review-bundle__eyebrow">Hướng dẫn cho Supervisor</span><h2>Lên lịch sản xuất qua Coding Agent</h2><p>Canvas hiện tạo task và handoff; nó chưa tự lên lịch hay đánh thức Agent. Prompt yêu cầu Coding Agent tự xác nhận Scheduled/Automation, trạng thái đăng nhập, phạm vi workspace và giới hạn gói.</p><p className="workflow-automation-guidance__note">Không phải Coding Agent nào cũng có lịch native dùng subscription. Nếu chưa xác minh được, Agent phải dừng ở hướng dẫn thủ công; không tự cài cron/GitHub Actions hoặc yêu cầu API key thay thế.</p><button className="secondary-button" type="button" onClick={() => onCopyAutomationPrompt("schedule")}>Sao chép prompt thiết lập lịch</button></div></article><article><div><span className="review-bundle__eyebrow">Sẵn sàng xử lý media</span><h2>Kiểm tra Skills & plugins</h2><p>Trước khi giao ảnh hoặc video, Coding Agent cần xác nhận công cụ thực sự có trong môi trường này. Nếu thiếu, prompt yêu cầu tìm nguồn cài chính thức, nêu quyền/chi phí rồi chờ chủ workspace xác nhận.</p><p className="workflow-automation-guidance__note">Ảnh thực cần file có quyền sử dụng. Có thể chỉnh crop, ánh sáng, bố cục hoặc typography theo brief nhưng không được thay đổi sự thật của ảnh bằng generative AI.</p><button className="secondary-button" type="button" onClick={() => onCopyAutomationPrompt("media")}>Sao chép prompt kiểm tra media</button></div></article></section>
    <aside className="workflow-canvas__boundary"><ShieldCheck size={20} /><p><strong>Điểm quan trọng về vận hành:</strong> Coding Agent thực hiện công việc sau khi người dùng gửi handoff thủ công. W3 phân phối, W4 xuất bản và W5 quảng cáo trả phí vẫn là các workflow chưa triển khai.</p></aside>
  </main>;
}

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal__header"><h2 id="modal-title">{title}</h2><button className="modal__close" type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button></div>{children}</section></div>;
}

function DecisionModal({ decision, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState("");
  const isRevision = decision === "revise";
  return <Modal title={isRevision ? "Yêu cầu chỉnh sửa" : "Phê duyệt task"} onClose={onClose}><p className="modal__intro">{isRevision ? "Mô tả điều cần thay đổi để đội ngũ AI xử lý chính xác." : "Xác nhận nội dung đáp ứng mục tiêu và ghi lại lý do để duy trì lịch sử quyết định minh bạch."}</p><label className="field-label" htmlFor="decision-reason">Lý do quyết định (bắt buộc)</label><textarea id="decision-reason" rows="5" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isRevision ? "Ví dụ: Điều chỉnh thông điệp mở đầu để gần với nhóm khách hàng mới…" : "Ví dụ: Nội dung đáp ứng định vị, mục tiêu và tiêu chuẩn chất lượng đã thống nhất…"} /><div className="modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Quay lại</button><button className="primary-button" type="button" disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())}>{busy ? "Đang ghi nhận…" : isRevision ? "Gửi yêu cầu" : "Xác nhận phê duyệt"}</button></div></Modal>;
}

function CreateTaskModal({ busy, onClose, onSubmit, subagentTemplateIds }) {
  const [form, setForm] = useState({ jobId: `campaign-${new Date().toISOString().slice(0, 10)}`, title: "", campaignSummary: "", managerTaskDescription: "", workflowId: "W2_content_factory", targetChannels: [], mediaDeliveryRequirement: "required", w2ProductionOrder: readW2ProductionOrder() });
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggleChannel = (channelId) => setForm((current) => ({ ...current, targetChannels: current.targetChannels.includes(channelId) ? current.targetChannels.filter((id) => id !== channelId) : [...current.targetChannels, channelId] }));
  return <Modal title="Tạo task sản xuất nội dung" onClose={onClose}><p className="modal__intro">Chọn kênh, chính sách media và mục tiêu ngay tại đây. Kênh cùng yêu cầu media sẽ được khóa trong manifest của task.</p><div className="form-grid"><label><span>Mã task</span><input value={form.jobId} onChange={update("jobId")} required /></label><label><span>Tên task / campaign</span><input value={form.title} onChange={update("title")} placeholder="Bài giới thiệu trải nghiệm mới" required /></label><fieldset className="form-grid__wide task-channel-picker"><legend>Kênh cần sản xuất <small>(chọn ít nhất một)</small></legend><div>{channelPreviewProfiles.map((channel) => <label key={channel.id}><input type="checkbox" checked={form.targetChannels.includes(channel.id)} onChange={() => toggleChannel(channel.id)} /><span><strong>{channel.label}</strong><small>{channel.surface}</small></span></label>)}</div><p>Mỗi kênh tạo một gói preview riêng. Không tự thêm kênh ngoài danh sách đã chọn.</p></fieldset><fieldset className="form-grid__wide task-media-policy"><legend>Media cho từng kênh trong task</legend><label><input type="radio" name="mediaDeliveryRequirement" value="required" checked={form.mediaDeliveryRequirement === "required"} onChange={update("mediaDeliveryRequirement")} /><span><strong>Cần ảnh/video hoàn thiện (khuyến nghị)</strong><small>Task bị chặn trước QA nếu thiếu tệp media thật; prompt, storyboard và visual brief không được tính.</small></span></label><label><input type="radio" name="mediaDeliveryRequirement" value="not_required" checked={form.mediaDeliveryRequirement === "not_required"} onChange={update("mediaDeliveryRequirement")} /><span><strong>Text-only, không cần media</strong><small>Chọn rõ khi format/kênh không cần ảnh hoặc video.</small></span></label></fieldset><label className="form-grid__wide"><span>Tóm tắt campaign</span><textarea rows="3" value={form.campaignSummary} onChange={update("campaignSummary")} placeholder="Mục tiêu, đối tượng, insight, sản phẩm và kết quả mong đợi…" /></label><label className="form-grid__wide"><span>Yêu cầu và tiêu chí duyệt</span><textarea rows="4" value={form.managerTaskDescription} onChange={update("managerTaskDescription")} placeholder="Mô tả nội dung cần tạo, số lượng bài, locale, tiêu chí chất lượng và loại media mong muốn…" required /></label><div className="form-grid__wide task-agent-assignment"><strong>Đội sản xuất: Studio nội dung</strong><span>{subagentTemplateIds.map(workerLabel).join(" · ") || "Không có Sub-Agent hỗ trợ"}</span><small>Thứ tự ưu tiên: {form.w2ProductionOrder.map((branch) => branch === "copy" ? "Copy" : "Media").join(" → ")}. Kết quả cuối cùng phải ghép đủ bài trước lint và QA.</small></div></div><div className="modal__actions"><button className="secondary-button" type="button" onClick={onClose}>Hủy</button><button className="primary-button" type="button" disabled={busy || !form.jobId.trim() || !form.title.trim() || !form.managerTaskDescription.trim() || form.targetChannels.length === 0} onClick={() => onSubmit({ ...form, subagentTemplateIds })}>{busy ? "Đang tạo…" : "Tạo task"}</button></div></Modal>;
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return <div className={`toast toast--${toast.tone ?? "success"}`} role="status"><span>{toast.tone === "error" ? <WarningCircle size={22} weight="fill" /> : <CheckCircle size={22} weight="fill" />}</span><div><strong>{toast.title}</strong><p>{toast.message}</p></div><button type="button" onClick={onDismiss} aria-label="Đóng thông báo"><X /></button></div>;
}

export function App() {
  const [data, setData] = useState(demoBootstrap);
  const [loading, setLoading] = useState(true);
  const [connectionMode, setConnectionMode] = useState("connected");
  const [review, setReview] = useState({ status: "idle", data: null, error: "" });
  const [activeNav, setActiveNav] = useState("Tổng quan");
  const [selectedStage, setSelectedStage] = useState("approval");
  const [contentFilter, setContentFilter] = useState("pending");
  const [selectedContentJobId, setSelectedContentJobId] = useState("");
  const [contentRecord, setContentRecord] = useState({ status: "idle", data: null, error: "" });
  const [decision, setDecision] = useState(null);
  const [decisionJobId, setDecisionJobId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [assignedSubagents, setAssignedSubagents] = useState(readW2Assignment);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const refreshControllerRef = useRef(null);
  const refreshSequenceRef = useRef(0);
  const preferredJobIdRef = useRef("");
  const contentFilterInitializedRef = useRef(false);

  const refreshDashboard = useCallback(async ({ initial = false, notifyOnError = false } = {}) => {
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    const sequence = ++refreshSequenceRef.current;
    if (initial) setLoading(true);
    else setReview((current) => ({ ...current, status: "loading", error: "" }));

    try {
      const [bootstrapResult, jobsResult] = await Promise.allSettled([
        canvasFetch("/api/bootstrap", { signal: controller.signal }).then(readJson),
        canvasFetch("/api/jobs", { signal: controller.signal }).then(readJson),
      ]);
      if (bootstrapResult.status !== "fulfilled") throw bootstrapResult.reason;
      const merged = mergeBootstrap(bootstrapResult.value);
      const jobsPayload = jobsResult.status === "fulfilled" ? unwrap(jobsResult.value) : {};
      const endpointJobs = Array.isArray(jobsPayload) ? jobsPayload : jobsPayload.jobs ?? [];
      const jobs = endpointJobs.length ? endpointJobs : merged.jobs;
      let preferredJob = preferredJobIdRef.current
        ? jobs.find((job) => (job.jobId ?? job.state?.jobId) === preferredJobIdRef.current)
        : null;
      if (preferredJob && terminalJobStatuses.has(jobStatus(preferredJob))) {
        preferredJobIdRef.current = "";
        preferredJob = null;
      }
      const activeJob = preferredJob
        ?? jobs.find((job) => jobStatus(job) === "awaiting_owner_decision")
        ?? jobs.find((job) => !terminalJobStatuses.has(jobStatus(job)))
        ?? jobs[0];
      const currentTask = taskFromJob(activeJob, merged.currentTask);
      let nextReview = { status: "unavailable", data: null, error: "Chưa có phiếu công việc để tạo gói duyệt đã xác minh." };
      if (activeJob?.jobId) {
        try {
          const reviewPayload = await canvasFetch(`/api/jobs/${encodeURIComponent(activeJob.jobId)}/review-bundle`, { signal: controller.signal }).then(readJson);
          nextReview = { status: "ready", data: normalizeReviewBundle(reviewPayload), error: "" };
        } catch (error) {
          if (error.name === "AbortError") throw error;
          nextReview = { status: error.status === 404 || error.status === 409 ? "unavailable" : "error", data: null, error: reviewErrorMessage(error) };
        }
      }
      if (sequence !== refreshSequenceRef.current) return;
      setData({ ...merged, jobs, currentTask });
      setReview(nextReview);
      setSelectedStage(currentTask.stageId ?? "approval");
      setConnectionMode("connected");
    } catch (error) {
      if (error.name === "AbortError" || sequence !== refreshSequenceRef.current) return;
      if (initial) {
        setData(demoBootstrap);
        setConnectionMode("demo");
        setReview({ status: "unavailable", data: null, error: "Dữ liệu bản mẫu không phải gói duyệt đã xác minh." });
        setToast({ tone: "info", title: "Đang dùng dữ liệu bản mẫu", message: "Local API chưa phản hồi. Quyền duyệt của chủ doanh nghiệp bị khóa trong chế độ này." });
      } else {
        setReview({ status: "error", data: null, error: "Không thể làm mới gói duyệt; quyết định đã được khóa để tránh dùng dữ liệu cũ." });
        if (notifyOnError) setToast({ tone: "error", title: "Không thể làm mới Canvas", message: mutationErrorMessage(error) });
      }
    } finally {
      if (sequence === refreshSequenceRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboard({ initial: true });
    return () => refreshControllerRef.current?.abort();
  }, [refreshDashboard]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshDashboard({ notifyOnError: false });
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshDashboard]);

  useEffect(() => {
    const status = data.currentTask?.status;
    const jobId = data.currentTask?.jobId ?? data.currentTask?.id;
    if (connectionMode !== "connected" || !jobId || !pollableJobStatuses.has(status)) return undefined;
    let polls = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (polls >= 12) {
        window.clearInterval(timer);
        return;
      }
      polls += 1;
      refreshDashboard({ notifyOnError: false });
    }, 8000);
    return () => window.clearInterval(timer);
  }, [connectionMode, data.currentTask?.id, data.currentTask?.jobId, data.currentTask?.status, refreshDashboard]);

  useEffect(() => {
    if (activeNav !== "Nội dung") {
      contentFilterInitializedRef.current = false;
      return;
    }
    if (!contentFilterInitializedRef.current) {
      contentFilterInitializedRef.current = true;
      const nextFilter = preferredContentFilter(data.jobs, contentFilter);
      if (nextFilter !== contentFilter) {
        setContentFilter(nextFilter);
        return;
      }
    }
    const candidates = filterContentJobs(data.jobs, contentFilter);
    const selectedExists = candidates.some((job) => (job.jobId ?? job.state?.jobId) === selectedContentJobId);
    if (!selectedExists) setSelectedContentJobId(candidates[0]?.jobId ?? candidates[0]?.state?.jobId ?? "");
  }, [activeNav, contentFilter, data.jobs, selectedContentJobId]);

  useEffect(() => {
    if (activeNav !== "Nội dung" || !selectedContentJobId) {
      if (activeNav === "Nội dung") setContentRecord({ status: "idle", data: null, error: "" });
      return undefined;
    }
    const controller = new AbortController();
    setContentRecord((current) => ({ ...current, status: "loading", error: "" }));
    canvasFetch(`/api/jobs/${encodeURIComponent(selectedContentJobId)}/content-record`, { signal: controller.signal })
      .then(readJson)
      .then((payload) => {
        const incoming = unwrap(payload);
        setContentRecord({ status: "ready", data: { ...incoming, review: normalizeReviewBundle(incoming.review) }, error: "" });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setContentRecord({ status: "error", data: null, error: reviewErrorMessage(error) });
      });
    return () => controller.abort();
  }, [activeNav, data.jobs, selectedContentJobId]);

  const visibleTask = useMemo(() => {
    const stage = data.workflow.find((item) => item.id === selectedStage);
    if (!stage || stage.id === data.currentTask.stageId || stage.state === "current") return data.currentTask;
    return { ...data.currentTask, status: "stage_reference", eyebrow: stage.state === "complete" ? "Bước đã hoàn thành" : "Bước sắp tới", title: stage.label, description: stage.state === "complete" ? `Đội ngũ AI đã hoàn tất bước ${stage.label.toLowerCase()} và lưu đầy đủ kết quả, nguồn dữ liệu cùng lịch sử kiểm định.` : `Bước ${stage.label.toLowerCase()} sẽ bắt đầu sau khi các điều kiện trước đó được đáp ứng.` };
  }, [data, selectedStage]);

  const runtime = useMemo(() => runtimePresentation(data.runtimeCapabilities, connectionMode), [data.runtimeCapabilities, connectionMode]);
  const ownerReviewVerified = data.currentTask?.status === "awaiting_owner_decision" && review.status === "ready" && review.data?.readyForOwnerDecision === true;
  const effectiveChecklist = checklistForManager(review.data?.checklist?.length ? review.data.checklist : data.checklist, {
    awaitingOwnerDecision: data.currentTask?.status === "awaiting_owner_decision",
    reviewVerified: ownerReviewVerified,
  });
  const effectiveTeam = teamForManager(data.team, {
    awaitingOwnerDecision: data.currentTask?.status === "awaiting_owner_decision",
    reviewVerified: ownerReviewVerified,
  });

  const openDecision = (type, jobId) => {
    setDecision(type);
    setDecisionJobId(jobId || data.currentTask?.jobId || data.currentTask?.id || "");
  };

  const submitDecision = async (reason) => {
    const targetReview = decisionJobId && decisionJobId === selectedContentJobId && contentRecord.status === "ready"
      ? { status: "ready", data: contentRecord.data?.review }
      : review;
    if (targetReview.status !== "ready" || targetReview.data?.readyForOwnerDecision !== true) {
      setToast({ tone: "error", title: "Quyết định đang bị khóa", message: "Hãy chờ gói duyệt, kiểm định độc lập và hash tệp kết quả được xác minh lại." });
      return;
    }
    setBusy(true);
    const jobId = decisionJobId || data.currentTask.jobId || data.currentTask.id;
    try {
      await postJson(`/api/jobs/${encodeURIComponent(jobId)}/decision`, { decision, reason }, data.mutationNonce);
      await refreshDashboard({ notifyOnError: true });
      setDecision(null);
      setDecisionJobId("");
      setToast({ title: decision === "accept" ? "Đã phê duyệt" : "Đã gửi yêu cầu chỉnh sửa", message: decision === "accept" ? "Quyết định đã được ghi vào phiếu công việc và sẵn sàng cho bước tiếp theo." : "Đội ngũ AI sẽ dùng ghi chú này trong vòng xử lý kế tiếp." });
    } catch (error) {
      await refreshDashboard({ notifyOnError: false });
      setToast({ tone: "error", title: "Chưa thể lưu quyết định", message: mutationErrorMessage(error) });
    }
    finally { setBusy(false); }
  };

  const createTask = async (form) => {
    setBusy(true);
    try {
      let createdJob;
      if (connectionMode === "connected") {
        preferredJobIdRef.current = form.jobId;
        createdJob = await postJson("/api/jobs", form, data.mutationNonce);
        await refreshDashboard({ notifyOnError: true });
        const createdTask = taskFromJob(createdJob, data.currentTask);
        setData((current) => ({
          ...current,
          jobs: [createdJob, ...(current.jobs ?? []).filter((job) => (job.jobId ?? job.state?.jobId) !== form.jobId)],
          currentTask: createdTask,
        }));
        setReview({ status: "unavailable", data: null, error: "Phiếu công việc mới đang chờ Coding Agent hoàn tất và gửi gói duyệt đã xác minh." });
        setSelectedStage(createdTask.stageId);
      }
      else {
        await new Promise((resolve) => setTimeout(resolve, 450));
        const createdAt = new Date().toISOString();
        createdJob = {
          jobId: form.jobId,
          state: { ...form, status: "ready_for_agent", createdAt, updatedAt: createdAt },
          manifest: { assignedAgentRole: "content_studio", subagentTemplateIds: form.subagentTemplateIds, targetChannels: form.targetChannels, mediaDeliveryRequirement: form.mediaDeliveryRequirement, w2ProductionOrder: form.w2ProductionOrder },
          handoff: { nextAction: `Mở Coding Agent, sao chép hướng dẫn đầy đủ từ phần task để bắt đầu phiếu ${form.jobId}.` },
        };
      }
      if (connectionMode !== "connected") {
        const currentTask = taskFromJob(createdJob, data.currentTask);
        setData((current) => ({ ...current, jobs: [createdJob, ...(current.jobs ?? []).filter((job) => (job.jobId ?? job.state?.jobId) !== form.jobId)], currentTask }));
        setReview({ status: "unavailable", data: null, error: "Phiếu công việc bản mẫu chưa có biên nhận lần chạy hoặc kiểm định độc lập." });
        setSelectedStage(currentTask.stageId);
      }
      setActiveNav("Tổng quan");
      setShowCreate(false); setToast({ title: "Đã tạo phiếu công việc", message: "Task mới đã sẵn sàng để Coding Agent tiếp nhận trong không gian nội bộ." });
    } catch (error) {
      if (connectionMode === "connected") await refreshDashboard({ notifyOnError: false });
      setToast({ tone: "error", title: "Không thể tạo task", message: mutationErrorMessage(error) });
    }
    finally { setBusy(false); }
  };

  const copyHandoffPrompt = async (prompt) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Trình duyệt không cấp quyền truy cập clipboard.");
      await navigator.clipboard.writeText(prompt);
      setToast({ title: "Đã sao chép hướng dẫn", message: "Mở Coding Agent, dán hướng dẫn và chủ động bắt đầu phiếu công việc. Canvas không kiểm tra trạng thái đăng nhập." });
    } catch (error) {
      setToast({ tone: "error", title: "Không thể sao chép hướng dẫn", message: error.message });
    }
  };

  const copyAutomationPrompt = async (kind) => copyHandoffPrompt(kind === "schedule" ? codingAgentSchedulePrompt : mediaSkillsAuditPrompt);

  const toggleAssignedSubagent = (subagentId) => {
    setAssignedSubagents((current) => {
      const next = current.includes(subagentId) ? current.filter((id) => id !== subagentId) : [...current, subagentId];
      if (next.length === 0) {
        setToast({ tone: "info", title: "Cần giữ ít nhất một Sub-Agent", message: "Hãy chọn ít nhất một vai trò hỗ trợ để review nội dung theo luồng W2." });
        return current;
      }
      try { window.localStorage.setItem(w2AssignmentStorageKey, JSON.stringify(next)); }
      catch { setToast({ tone: "error", title: "Không lưu được cấu hình", message: "Trình duyệt từ chối local storage; thay đổi chỉ còn trong phiên hiện tại." }); }
      return next;
    });
  };

  const copyPrivateCanvasLink = async () => {
    if (!canvasAccessCapability) {
      setToast({ tone: "error", title: "Không có private link trong phiên này", message: "Khởi chạy lại Canvas bằng Coding Agent để nhận link mới." });
      return;
    }
    const accepted = window.confirm("Private link chứa quyền truy cập workspace marketing trên máy này. Chỉ mở trong trình duyệt trên cùng máy và không gửi cho người khác. Sao chép link?");
    if (!accepted) return;
    try {
      const privateUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#access=${encodeURIComponent(canvasAccessCapability)}`;
      await navigator.clipboard.writeText(privateUrl);
      setToast({ title: "Đã sao chép private link", message: "Mở link này trong trình duyệt trên cùng máy. Khởi động lại server sẽ làm link hết hạn." });
    } catch (error) {
      setToast({ tone: "error", title: "Không thể sao chép private link", message: error.message || "Trình duyệt không cấp quyền clipboard." });
    }
  };

  if (loading) return <LoadingView />;
  return <div className="canvas-shell"><Sidebar activeNav={activeNav} onNavigate={setActiveNav} runtime={runtime} /><div className="canvas-app"><AppHeader organization={data.organization} runtime={runtime} onCreate={() => setShowCreate(true)} onCopyPrivateLink={connectionMode === "connected" && canvasAccessCapability ? copyPrivateCanvasLink : null} />{activeNav === "Tổng quan" ? <main className="dashboard"><div className="dashboard__primary"><CampaignHeader campaign={data.campaign} quality={data.quality} /><Workflow stages={data.workflow} selectedStage={selectedStage} onSelect={setSelectedStage} onOpenWorkflow={() => setActiveNav("Quy trình")} /><TaskReview task={visibleTask} busy={busy} onDecision={(type) => openDecision(type, data.currentTask?.jobId ?? data.currentTask?.id)} review={review} onCopyHandoff={copyHandoffPrompt} onOpenContent={() => { setSelectedContentJobId(data.currentTask?.jobId ?? data.currentTask?.id ?? ""); setActiveNav("Nội dung"); }} allowHandoff={connectionMode === "connected"} ownerDecisionBoundary={data.ownerDecisionBoundary} /></div><aside className="dashboard__rail"><TeamPanel team={effectiveTeam} activity={data.activity} onOpenWorkflow={() => setActiveNav("Quy trình")} /><ChecklistPanel items={effectiveChecklist} /></aside></main> : activeNav === "Quy trình" ? <WorkflowCanvas connectionMode={connectionMode} assignedSubagents={assignedSubagents} onToggleSubagent={toggleAssignedSubagent} onCreateTask={() => setShowCreate(true)} onCopyAutomationPrompt={copyAutomationPrompt} /> : activeNav === "Nội dung" ? <ContentWorkspace jobs={data.jobs} filter={contentFilter} onFilter={setContentFilter} selectedJobId={selectedContentJobId} onSelectJob={setSelectedContentJobId} recordState={contentRecord} onDecision={openDecision} brandName={data.organization?.name} connectionMode={connectionMode} onCreateTask={() => setShowCreate(true)} /> : <main className="dashboard dashboard--placeholder"><PlaceholderModule name={activeNav} onBack={() => setActiveNav("Tổng quan")} /></main>}</div>{decision && <DecisionModal decision={decision} busy={busy} onClose={() => { setDecision(null); setDecisionJobId(""); }} onSubmit={submitDecision} />}{showCreate && <CreateTaskModal busy={busy} onClose={() => setShowCreate(false)} subagentTemplateIds={assignedSubagents} onSubmit={createTask} />}<Toast toast={toast} onDismiss={() => setToast(null)} /></div>;
}
