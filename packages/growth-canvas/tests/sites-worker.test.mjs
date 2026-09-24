import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";
import { codingAgentSchedulePrompt, mediaSkillsAuditPrompt } from "../src/automation-guidance.js";
import {
  checklistForManager,
  mutationErrorMessage,
  normalizeReviewBundle,
  reviewErrorMessage,
  summarizeArtifactPreview,
  teamForManager,
} from "../src/review-gate.js";
import {
  contentReviewState,
  filterContentJobs,
  parseContentArtifacts,
  preferredContentFilter,
  qualityDimensionsForRecord,
} from "../src/content-review.js";

test("opens the owner gate only when every review verification is explicit", () => {
  const verified = normalizeReviewBundle({
    readyForOwnerDecision: true,
    verification: { receipt: "verified", deterministicLint: "verified", independentQa: "verified", reviewerSeparation: "verified", artifactIntegrity: "verified" },
    artifacts: [{ reference: "artifacts/draft.md", hash: "sha256:abc", bytes: 12 }],
    checklist: ["Review the draft"],
  });
  assert.equal(verified.readyForOwnerDecision, true);
  assert.deepEqual(verified.verification.flags, { receipt: true, qa: true, deterministicLint: true, reviewer: true, artifactIntegrity: true });

  const stale = normalizeReviewBundle({
    readyForOwnerDecision: true,
    verification: { receipt: "verified", deterministicLint: "verified", independentQa: "verified", reviewerSeparation: "verified", artifactIntegrity: "pending" },
  });
  assert.equal(stale.readyForOwnerDecision, false);
  assert.equal(stale.verification.flags.artifactIntegrity, false);

  const ambiguous = normalizeReviewBundle({
    readyForOwnerDecision: true,
    verification: { receipt: true, qaVerified: true, reviewerVerified: true, artifactsVerified: true },
  });
  assert.equal(ambiguous.readyForOwnerDecision, false, "aliases and truthy values must not open the exact backend gate");
});

test("shows actionable messages for duplicate jobs and preserves review-gate errors", () => {
  assert.equal(mutationErrorMessage({ status: 409, code: "duplicate_job" }), "Mã task này đã tồn tại. Hãy chọn mã khác để tạo task mới.");
  assert.equal(mutationErrorMessage({ status: 409, code: "tenant_not_ready" }), "Doanh nghiệp chưa vượt qua kiểm tra sẵn sàng để tạo task.");
  assert.match(mutationErrorMessage({ status: 409, code: "independent_qa_required" }), /kiểm định độc lập chưa đạt/i);
  assert.equal(reviewErrorMessage({ status: 404 }), "Backend chưa cung cấp gói duyệt cho task này.");
});

test("builds a concise manager preview from verified structured content", () => {
  const summary = summarizeArtifactPreview({
    readyForOwnerDecision: true,
    qa: { softScores: { jtbd_audience_relevance: 5, proof_claim_precision: 3, brand_locale_editorial_quality: 4 } },
    artifacts: [{ preview: { content: JSON.stringify({ recommendedConcept: "Khoảng lặng buổi sáng", copy: { "vi-VN": { headline: "Bắt đầu ngày mới nhẹ hơn", body: "Một lời mời chậm lại.", cta: "Xem bản nháp" } } }) } }],
  });
  assert.equal(summary.concept, "Khoảng lặng buổi sáng");
  assert.equal(summary.locale, "vi-VN");
  assert.equal(summary.headline, "Bắt đầu ngày mới nhẹ hơn");
  assert.equal(summary.cta, "Xem bản nháp");
  assert.equal(summary.qa.mean, 4);
  assert.equal(summary.qa.min, 3);
  assert.match(summary.remainingGates.join(" "), /xuất bản.*vẫn đang khóa/i);
});

test("manager preview skips work logs and uses the first structured content package", () => {
  const summary = summarizeArtifactPreview({
    readyForOwnerDecision: true,
    qa: { softScores: {} },
    artifacts: [
      { reference: "artifacts/agent-work-log.json", preview: { content: JSON.stringify({ artifactKind: "agent_work_log", steps: [] }) } },
      { reference: "artifacts/01-content.json", preview: { content: JSON.stringify({ artifactKind: "concept_copy_package", copy: { vi: { headline: "Bản nội dung đầu tiên", body: "Copy có cấu trúc", cta: "Lưu câu hỏi" } } }) } },
    ],
  });
  assert.equal(summary.headline, "Bản nội dung đầu tiên");
  assert.equal(summary.body, "Copy có cấu trúc");
});

test("resolves the recommended concept from the portable content package shape", () => {
  const summary = summarizeArtifactPreview({
    readyForOwnerDecision: true,
    qa: { softScores: { jtbd_audience_relevance: 4, proof_claim_precision: 4 } },
    artifacts: [{ preview: { content: JSON.stringify({
      copy: { vi: { headline: "Một tiêu đề", body: "Một nội dung", cta: "Xem tiếp" } },
      productionRecord: {
        concepts: [{ id: "C2_three_ways_in", name: { vi: "Ba lối vào, một khoảng mở" } }],
        recommendedCandidate: { conceptId: "C2_three_ways_in" },
      },
    }) } }],
  });
  assert.equal(summary.concept, "Ba lối vào, một khoảng mở");
  assert.equal(summary.locale, "vi");
  assert.equal(summary.headline, "Một tiêu đề");
});

test("owner review readiness does not promote every assigned role to complete", () => {
  const checklist = checklistForManager(["Review draft", "Confirm claims"], { awaitingOwnerDecision: true, reviewVerified: true });
  assert.deepEqual(checklist.map(({ status }) => status), ["ready", "ready"]);
  assert.equal(checklist.some(({ status }) => status === "passed"), false);

  const team = teamForManager([
    { id: "content_studio", state: "complete", evidenceRole: "lead" },
    { id: "brief_expander", state: "evidence_missing", evidenceRole: "subagent" },
    { id: "tenant-independent-qa", state: "complete", evidenceRole: "quality_assurance" },
  ], { awaitingOwnerDecision: true, reviewVerified: true });
  assert.deepEqual(team.map(({ state }) => state), ["complete", "evidence_missing", "complete"]);
});

test("automation guidance stays subscription-aware and requires truthful media provenance", () => {
  assert.match(codingAgentSchedulePrompt, /verify|xác nhận/i);
  assert.match(codingAgentSchedulePrompt, /múi giờ/i);
  assert.match(codingAgentSchedulePrompt, /không dùng API key/i);
  assert.match(codingAgentSchedulePrompt, /Không đăng bài/);
  assert.match(mediaSkillsAuditPrompt, /kiểm tra skill\/plugin/i);
  assert.match(mediaSkillsAuditPrompt, /chủ workspace xác nhận/i);
  assert.match(mediaSkillsAuditPrompt, /giữ nguyên nội dung thực/i);
  assert.match(mediaSkillsAuditPrompt, /Không đăng/);
});

test("organizes content records into manager review filters", () => {
  const jobs = [
    { jobId: "waiting", state: { status: "awaiting_owner_decision" } },
    { jobId: "approved", state: { status: "accepted_internal" } },
    { jobId: "revision", state: { status: "revision_requested" } },
    { jobId: "working", state: { status: "in_progress" } },
  ];
  assert.equal(contentReviewState(jobs[0]), "pending");
  assert.deepEqual(filterContentJobs(jobs, "approved").map(({ jobId }) => jobId), ["approved"]);
  assert.equal(preferredContentFilter(jobs, "pending"), "pending");
  assert.equal(preferredContentFilter(jobs.slice(1), "pending"), "approved");
  assert.equal(contentReviewState(jobs[3]), null);
});

test("extracts every localized copy option plus media and source metadata", () => {
  const parsed = parseContentArtifacts({
    review: {
      artifacts: [{
        reference: "content-drafts/package.json",
        hash: "sha256:abc",
        bytes: 300,
        preview: {
          status: "available",
          mediaType: "application/json",
          content: JSON.stringify({
            copy: { vi: { headline: "Nội dung chính", body: "Bản đầy đủ", cta: "Xem" } },
            visualBrief: { source: "owned-photo-library", mediaType: "photography", accessibility: { altTextRequired: true } },
            productionRecord: {
              concepts: [
                { id: "c1", name: { vi: { vi: "Phương án một", "en-US": "Option one" } }, copy: { vi: { headline: "Một", caption: "Caption một" } } },
                { id: "c2", name: { vi: "Phương án hai" }, copy: { vi: { headline: "Hai", caption: "Caption hai" } } },
              ],
              rightsAndProvenance: { rightsStatus: "approved", sourceRegisterRefs: ["owned-photo-library"] },
            },
          }),
        },
      }],
    },
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].copyGroups.length, 3);
  assert.deepEqual(parsed[0].copyGroups.map(({ label }) => label), ["Nội dung chính", "Phương án một", "Phương án hai"]);
  assert.ok(parsed[0].mediaMetadata.some(({ path }) => /visualBrief/.test(path)));
  assert.ok(parsed[0].sourceMetadata.some(({ path }) => /rightsAndProvenance/.test(path)));
});

test("formats quality dimensions for the manager workspace", () => {
  const dimensions = qualityDimensionsForRecord({ review: { qa: { softScores: { jtbd_audience_relevance: 5, proof_claim_precision: 3 } } } });
  assert.deepEqual(dimensions.map(({ score }) => score), [5, 3]);
  assert.match(dimensions[0].label, /nhu cầu người xem/i);
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("ships the fail-closed owner review bundle gate", async () => {
  const assetsDirectory = new URL("../dist/client/assets/", import.meta.url);
  const entries = await readdir(assetsDirectory);
  const scriptName = entries.find((entry) => entry.endsWith(".js"));
  assert.ok(scriptName, "built client JavaScript must exist");
  const client = await readFile(new URL(scriptName, assetsDirectory), "utf8");

  assert.match(client, /\/review-bundle/);
  assert.match(client, /readyForOwnerDecision/);
  assert.match(client, /artifactIntegrity/);
  assert.match(client, /\/decision/);
  assert.match(client, /Đã khóa quyết định/);
  assert.match(client, /Nhóm sản xuất không tự chấm QA/);
  assert.match(client, /sẵn sàng đối chiếu/);
  assert.doesNotMatch(client, /actorRole:\"owner\"/);
});
