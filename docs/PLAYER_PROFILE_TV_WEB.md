# TV Web — linked player profile (code 19)

## Pipeline

`useNotifications` retains the latest code **19** in `profileNotification` (independent of `lastInbound` batch replacement) → `usePlayerProfile` applies when `linked && sessionReady`.

After relink, `GET /v2/notification` (limit 30) runs once, then **`usePlayerProfile` polls every 3s** while linked and profile is still null. Inbox recovery only works if Nakama stored code 19 on the **linked TV user**; if mobile never sent code 19, the web client cannot invent the profile (Unity must call `TrySendProfileToTvAsync` — e.g. after `VideoTvReady`).

Profile state is **not** cleared during QR relink (`sessionReady === false`); it clears on confirmed unlink / logout / partner disconnect.

The song-list toolbar shows the linked player **display name from code 19 only** (`displayName` in the payload). It does **not** use the TV Nakama session `username`, `phoneNumber`, or a generic `"Player"` placeholder.

## Notification

- **Code:** `19` (`PlayerProfileUpdated`)
- **Direction:** Mobile → TV (multi-session notification)
- **Payload:** `TvPlayerProfileContent` (see Unity `SendNotificationDataReqModel.cs`)

## Entitlement (UX)

- `hasFullAccess === true` or `subscriptionStatus === "active"` → unlock all catalog items in UI
- Otherwise only IDs in `freeVideoIds`
- **Play** still uses authoritative `canAccessVideo()` RPC

## Avatar

`avatarId` may be a full public URL, `avatar_NNN`, legacy numeric id, or catalog URL under `/dance_Content/avatars/`. Missing/invalid images fall back to `public/svgs/dance_pose.svg`; the display name still renders if the image fails.

## Age

TV shows **age** only (`resolveDisplayAge`); never `dateOfBirth`.

## QA

1. Pair phone + TV → profile appears in toolbar after code 19.
2. Change avatar on phone → TV updates without reload.
3. Purchase subscription while paired → `اشتراک فعال شد!` and locks clear.
4. Logout → profile cleared.

Run: `npm run verify:player-profile`
