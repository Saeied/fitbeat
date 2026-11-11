/**
 * Run: npm run verify:player-profile
 */
import "./env-bootstrap";
import assert from "node:assert/strict";
import {
  DEFAULT_LINKED_PLAYER_AVATAR,
  getAvatarPublicUrl,
  normalizeAbsoluteAvatarUrl,
  resolveAvatarImageUrl,
  resolveServerFilesystemAvatarPath,
  tryGetIndexFromLegacyAvatarId,
} from "../src/lib/nakama/avatarPublicUrl";
import { ageFromDateOfBirth, resolveDisplayAge } from "../src/lib/nakama/playerProfileAge";
import {
  isPlayerProfileUpdatedNotification,
  parsePlayerProfileNotification,
  parseTvPlayerProfileContent,
} from "../src/lib/nakama/playerProfileParse";
import {
  mergeProfileNotificationsFromBatch,
  mergeRetainedProfileNotification,
  profileNotificationDedupeKey,
  selectNewestProfileNotification,
} from "../src/lib/nakama/playerProfileNotificationRetain";
import {
  didGainFullAccess,
  isVideoUnlockedByProfile,
  mergeSubscriptionStatus,
  subscriptionStatusFromPlayerProfile,
} from "../src/lib/nakama/playerProfileSubscription";
import { NOTIFICATION_CODES } from "../src/lib/nakama/notificationCodes";
import type { NotificationPayload } from "../src/lib/nakama/types";

function ok(message: string) {
  console.log(`[OK] ${message}`);
}

const payload = {
  userId: "u-1",
  displayName: "Test User",
  avatarId:
    "http://85.198.11.216/dance_Content/avatars/Sticker%20Avatar%20Grid%20Collection_final_13.png",
  dateOfBirth: "2000-06-15",
  subscriptionStatus: "inactive",
  hasFullAccess: false,
  freeVideoIds: ["101"],
  serverNowUtcMs: 1000,
};

const parsed = parseTvPlayerProfileContent(payload);
assert.equal(parsed?.userId, "u-1");
ok("parse object content");

const jsonString = JSON.stringify(payload);
assert.equal(parseTvPlayerProfileContent(jsonString)?.userId, "u-1");
ok("parse JSON string content");

const wrappedSendModel = {
  code: NOTIFICATION_CODES.PlayerProfileUpdated,
  content: payload,
};
assert.equal(parseTvPlayerProfileContent(wrappedSendModel)?.userId, "u-1");
ok("parse nested SendNotificationBaseReqModel content");

const notifObj = {
  code: NOTIFICATION_CODES.PlayerProfileUpdated,
  content: payload,
};
assert.ok(isPlayerProfileUpdatedNotification(notifObj));
assert.equal(parsePlayerProfileNotification(notifObj)?.avatarId, payload.avatarId);
ok("code 19 numeric envelope");

const notifStrCode = {
  code: String(NOTIFICATION_CODES.PlayerProfileUpdated),
  content: jsonString,
} as unknown as NotificationPayload;
assert.ok(isPlayerProfileUpdatedNotification(notifStrCode));
ok("code 19 string envelope");

const invalidNotif = {
  code: NOTIFICATION_CODES.PlayerProfileUpdated,
  content: { displayName: "no user id" },
};
assert.equal(parsePlayerProfileNotification(invalidNotif), null);
ok("payload without userId rejected");

const profileNotif: NotificationPayload = {
  id: "prof-1",
  code: NOTIFICATION_CODES.PlayerProfileUpdated,
  content: { ...payload, serverNowUtcMs: 5000 },
};

const gameplayBatch: NotificationPayload[] = [
  { id: "g1", code: NOTIFICATION_CODES.VideoTvReady, content: {} },
  { id: "g2", code: NOTIFICATION_CODES.FrameSync, content: {} },
];

let retained = mergeProfileNotificationsFromBatch(null, [profileNotif]);
assert.equal(retained?.id, "prof-1");
retained = mergeProfileNotificationsFromBatch(retained, gameplayBatch);
assert.equal(retained?.id, "prof-1");
ok("code 19 retained when later unrelated batch arrives");

const newerProfile: NotificationPayload = {
  id: "prof-2",
  code: NOTIFICATION_CODES.PlayerProfileUpdated,
  content: { ...payload, serverNowUtcMs: 9000, displayName: "Newer" },
};
retained = mergeProfileNotificationsFromBatch(retained, [newerProfile]);
assert.equal(retained?.id, "prof-2");
ok("newer code 19 replaces retained snapshot");

const dedupeA = profileNotificationDedupeKey(profileNotif);
const dedupeB = profileNotificationDedupeKey({ ...profileNotif });
assert.equal(dedupeA, dedupeB);
ok("duplicate notification dedupe key stable");

assert.equal(
  mergeRetainedProfileNotification(profileNotif, profileNotif)?.id,
  "prof-1",
);
ok("duplicate delivery merge is idempotent");

const fullUrl = payload.avatarId;
const resolved = resolveAvatarImageUrl(fullUrl);
assert.ok(resolved.startsWith("http://"));
assert.equal(resolved, normalizeAbsoluteAvatarUrl(fullUrl));
assert.ok(!resolved.includes("/dc/dance_Content"));
assert.ok(resolved.includes("Sticker"));
ok("full avatar URL preserved on content origin");

const fsPath =
  "/var/www/html/dance_Content/avatars/Sticker Avatar Grid Collection_final_13.png";
const fromFs = resolveServerFilesystemAvatarPath(fsPath);
assert.ok(fromFs?.includes("/dance_Content/avatars/"));
assert.equal(resolveAvatarImageUrl(fsPath), fromFs);
ok("/var/www/html avatar path maps to public URL");

assert.ok(getAvatarPublicUrl(13).includes(encodeURIComponent("Sticker")));
ok("catalog index URL encodes spaces");

assert.ok(resolveAvatarImageUrl("avatar_013").includes("13"));
ok("avatar_001 style key");

assert.equal(tryGetIndexFromLegacyAvatarId(fullUrl), 13);
ok("URL not parsed as bare numeric id");

assert.ok(DEFAULT_LINKED_PLAYER_AVATAR.includes("dance_pose.svg"));
assert.ok(resolveAvatarImageUrl("not-an-avatar").includes("dance_pose.svg"));
ok("invalid avatar uses safe local fallback");

const ageProfile = { ...parsed!, age: null, dateOfBirth: "2010-01-01" };
assert.ok(resolveDisplayAge(ageProfile)! >= 10);
ok("age from dateOfBirth");

const activeProfile = {
  ...parsed!,
  hasFullAccess: true,
  subscriptionStatus: "active",
  serverNowUtcMs: 2000,
};
const subStatus = subscriptionStatusFromPlayerProfile(activeProfile);
assert.equal(subStatus.hasFullAccess, true);
assert.ok(isVideoUnlockedByProfile(activeProfile, "999"));
ok("subscription from profile");

const stale = mergeSubscriptionStatus(
  { ...subStatus, serverNowUtcMs: 3000, hasFullAccess: true },
  { ...subStatus, serverNowUtcMs: 1000, hasFullAccess: false },
);
assert.equal(stale.serverNowUtcMs, 3000);
assert.equal(stale.hasFullAccess, true);
ok("stale subscription merge rejected");

assert.equal(
  didGainFullAccess(
    {
      subscription: null,
      freeVideoIds: ["1"],
      hasFullAccess: false,
      serverNowUtcMs: 0,
    },
    subStatus,
  ),
  true,
);
ok("didGainFullAccess detection");

const birthday = ageFromDateOfBirth("2000-02-29");
assert.ok(birthday === null || birthday >= 0);
ok("age boundary handling");

const picked = selectNewestProfileNotification([
  { ...profileNotif, content: { ...payload, serverNowUtcMs: 100 } },
  newerProfile,
]);
assert.equal(picked?.id, "prof-2");
ok("select newest profile notification by serverNowUtcMs");

/** Mirrors usePlayerProfile dedupe when hook becomes enabled after relink. */
function simulateApplyRetainedWhenEnabled(
  retained: NotificationPayload | null,
  appliedKeys: Set<string>,
): ReturnType<typeof parsePlayerProfileNotification> {
  if (!retained) return null;
  const key = profileNotificationDedupeKey(retained);
  if (appliedKeys.has(key)) return null;
  const parsed = parsePlayerProfileNotification(retained);
  if (!parsed) return null;
  appliedKeys.add(key);
  return parsed;
}

const appliedAfterRelink = new Set<string>();
assert.equal(
  simulateApplyRetainedWhenEnabled(retained, appliedAfterRelink)?.displayName,
  "Newer",
);
assert.equal(simulateApplyRetainedWhenEnabled(retained, appliedAfterRelink), null);
ok("retained code 19 applied once when hook becomes enabled");

assert.equal(simulateApplyRetainedWhenEnabled(null, new Set()), null);
ok("unlink clears retained — nothing to apply");

console.log("\nAll player-profile verification checks passed.");
