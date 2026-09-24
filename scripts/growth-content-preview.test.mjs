import assert from "node:assert/strict";
import test from "node:test";

import { channelIdFrom, channelPreviewProfiles, isChannelAssigned, mediaKindForArtifact, normalizeTargetChannels, selectPreviewCopy } from "../packages/growth-canvas/src/content-preview.js";
import { listContentUnits, parseContentArtifacts } from "../packages/growth-canvas/src/content-review.js";

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

test("review item list groups translations under one channel-specific post and binds channel media", () => {
  const record = {
    jobId: "campaign-review-001",
    targetChannels: ["facebook", "instagram"],
    review: { artifacts: [
      {
        reference: "operations/jobs/campaign-review-001/artifacts/posts.json",
        preview: { status: "available", mediaType: "application/json", content: JSON.stringify({ items: [
          { id: "fb-post-1", channelId: "facebook", copy: { vi: { headline: "Bài Facebook" }, "en-US": { headline: "Facebook post" } } },
          { id: "ig-post-1", channelId: "instagram", copy: { vi: { headline: "Bài Instagram" } } }
        ] }) }
      },
      { reference: "operations/jobs/campaign-review-001/artifacts/media/facebook/hero.png", preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" } },
      { reference: "operations/jobs/campaign-review-001/artifacts/media/instagram/hero.png", preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" } }
    ] }
  };
  const items = listContentUnits(record);
  assert.equal(items.length, 2);
  assert.equal(items.find(({ channelId }) => channelId === "facebook").variants.length, 2);
  assert.equal(items.find(({ channelId }) => channelId === "instagram").variants.length, 1);
  assert.match(items.find(({ channelId }) => channelId === "facebook").mediaArtifacts[0].reference, /media\/facebook/);
  assert.match(items.find(({ channelId }) => channelId === "instagram").mediaArtifacts[0].reference, /media\/instagram/);
});

test("review item list binds media by content item and never reuses channel-only media across a batch", () => {
  const record = {
    targetChannels: ["facebook"],
    review: { artifacts: [
      { reference: "operations/jobs/batch/artifacts/content.json", preview: { status: "available", mediaType: "application/json", content: JSON.stringify({ items: [
        { id: "fb-post-1", channelId: "facebook", copy: { vi: { headline: "Bài một" } } },
        { id: "fb-post-2", channelId: "facebook", copy: { vi: { headline: "Bài hai" } } }
      ] }) } },
      { reference: "operations/jobs/batch/artifacts/media/facebook/fb-post-1/final.png", preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" } },
      { reference: "operations/jobs/batch/artifacts/media/facebook/fb-post-2/final.png", preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" } }
    ] }
  };
  const items = listContentUnits(record);
  assert.deepEqual(items.map(({ contentItemId }) => contentItemId), ["fb-post-1", "fb-post-2"]);
  assert.match(items[0].mediaArtifacts[0].reference, /fb-post-1/);
  assert.match(items[1].mediaArtifacts[0].reference, /fb-post-2/);

  const ambiguousRecord = { ...record, review: { artifacts: [record.review.artifacts[0], {
    reference: "operations/jobs/batch/artifacts/media/facebook/final.png",
    preview: { status: "media_available", mediaType: "image/png", mediaKind: "image" }
  }] } };
  assert.deepEqual(listContentUnits(ambiguousRecord).map(({ mediaArtifacts }) => mediaArtifacts.length), [0, 0]);
});
