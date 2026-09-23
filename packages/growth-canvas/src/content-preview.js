export const channelPreviewProfiles = Object.freeze([
  { id: "facebook", label: "Facebook", surface: "Bài viết bảng tin", mediaPlacement: "after-copy", editorial: false },
  { id: "instagram", label: "Instagram", surface: "Bài viết feed", mediaPlacement: "before-copy", editorial: false },
  { id: "linkedin", label: "LinkedIn", surface: "Bài đăng trang", mediaPlacement: "after-copy", editorial: false },
  { id: "blog", label: "Blog", surface: "Bài viết", mediaPlacement: "between-intro-and-body", editorial: true },
]);

export function normalizeTargetChannels(value) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(channelPreviewProfiles.map(({ id }) => id));
  return [...new Set(value.filter((id) => typeof id === "string" && allowed.has(id)))];
}

export function channelIdFrom(value) {
  const candidate = typeof value === "string" ? value : value?.id ?? value?.channelId ?? value?.name ?? value?.label;
  if (typeof candidate !== "string") return null;
  const id = candidate.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
  return channelPreviewProfiles.find((profile) => profile.id.replaceAll(/[^a-z0-9]+/g, "") === id)?.id ?? null;
}

export function isChannelAssigned(targetChannels, channelId) {
  return normalizeTargetChannels(targetChannels).includes(channelId);
}

export function selectPreviewCopy(copyGroups, groupId, locale) {
  const group = (copyGroups ?? []).find((item) => item.id === groupId) ?? copyGroups?.[0] ?? null;
  if (!group) return { group: null, locale: "", headline: "", body: "", caption: "", cta: "", altText: "" };
  const variant = group.variants.find((item) => item.locale === locale) ?? group.variants[0] ?? null;
  const fields = Object.fromEntries((variant?.fields ?? []).map(({ key, value }) => [key, value]));
  return {
    group,
    locale: variant?.locale ?? "",
    headline: fields.headline ?? fields.title ?? "",
    body: fields.body ?? fields.script ?? fields.description ?? "",
    caption: fields.caption ?? "",
    cta: fields.cta ?? "",
    altText: fields.altText ?? "",
  };
}

export function mediaKindForArtifact(artifact) {
  const preview = artifact?.preview ?? {};
  if (preview.status !== "media_available") return null;
  if (preview.mediaKind === "image" || preview.mediaKind === "video") return preview.mediaKind;
  if (preview.mediaType?.startsWith("image/")) return "image";
  if (preview.mediaType?.startsWith("video/")) return "video";
  return null;
}
