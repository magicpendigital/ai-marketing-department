import assert from "node:assert/strict";
import test from "node:test";

import { channelIdFrom, channelPreviewProfiles, isChannelAssigned, mediaKindForArtifact, normalizeTargetChannels, selectPreviewCopy } from "../packages/growth-canvas/src/content-preview.js";
import { parseContentArtifacts } from "../packages/growth-canvas/src/content-review.js";

test("channel preview profiles cover requested social and blog surfaces with distinct media placement", () => {
  assert.deepEqual(channelPreviewProfiles.map(({ id }) => id), ["facebook", "instagram", "linkedin", "blog"]);
  assert.equal(channelPreviewProfiles.find(({ id }) => id === "instagram").mediaPlacement, "before-copy");
  assert.equal(channelPreviewProfiles.find(({ id }) => id === "facebook").mediaPlacement, "after-copy");
  assert.equal(channelPreviewProfiles.find(({ id }) => id === "blog").editorial, true);
});

test("channel preview selects all copy fields in the requested locale and falls back safely", () => {
  const groups = [{
    id: "concept-a",
    label: "Concept A",
    variants: [
      { locale: "vi", fields: [
        { key: "headline", value: "Tiêu đề Việt" },
        { key: "body", value: "Nội dung Việt" },
        { key: "caption", value: "Caption Việt" },
        { key: "cta", value: "Bắt đầu" },
        { key: "altText", value: "Ảnh minh họa" },
      ] },
      { locale: "en-US", fields: [{ key: "headline", value: "English title" }] },
    ],
  }];

  assert.deepEqual(selectPreviewCopy(groups, "concept-a", "vi"), {
    group: groups[0], locale: "vi", headline: "Tiêu đề Việt", body: "Nội dung Việt", caption: "Caption Việt", cta: "Bắt đầu", altText: "Ảnh minh họa",
  });
  assert.equal(selectPreviewCopy(groups, "concept-a", "fr").locale, "vi");
  assert.equal(selectPreviewCopy([], "missing", "vi").headline, "");
});

test("only hash-verified media preview records are treated as displayable media", () => {
  assert.equal(mediaKindForArtifact({ preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" } }), "image");
  assert.equal(mediaKindForArtifact({ preview: { status: "media_available", mediaType: "video/mp4", mediaKind: "video" } }), "video");
  assert.equal(mediaKindForArtifact({ preview: { status: "refused_binary", mediaType: "image/png", mediaKind: "image" } }), null);
});

test("channel assignment is explicit and a multi-channel package does not share untagged copy", () => {
  assert.deepEqual(normalizeTargetChannels(["facebook", "blog", "facebook", "other"]), ["facebook", "blog"]);
  assert.equal(channelIdFrom({ label: "Instagram" }), "instagram");
  assert.equal(isChannelAssigned(["facebook", "blog"], "linkedin"), false);
  const record = { review: { artifacts: [{
    reference: "content-drafts/channels.json",
    preview: { status: "available", mediaType: "application/json", content: JSON.stringify({ channels: {
      facebook: { copy: { vi: { headline: "Bản Facebook" } } },
      instagram: { copy: { vi: { headline: "Bản Instagram" } } },
      shared: { copy: { vi: { headline: "Không được tự dùng chung" } } }
    } }) }
  }] } };
  const groups = parseContentArtifacts(record)[0].copyGroups;
  assert.equal(groups.find(({ id }) => id.includes("facebook"))?.channelId, "facebook");
  assert.equal(groups.find(({ id }) => id.includes("instagram"))?.channelId, "instagram");
  assert.equal(groups.find(({ id }) => id.includes("shared"))?.channelId, null);
  const facebookPreview = groups.filter((group) => group.channelId === "facebook");
  assert.equal(selectPreviewCopy(facebookPreview, facebookPreview[0].id, "vi").headline, "Bản Facebook");
  assert.equal(facebookPreview.some(({ id }) => id.includes("shared")), false);
});
