# Web Frontend --- Likes & Tutorial Readiness

**Short integration guide for Web, Nakama, and Unity**

**Purpose:** Integrate private video favorites across Web and Unity,
then let the Web client request entry into Unity's tutorial and wait for
Unity's acknowledgement.

## 1. Connection

Use the existing Nakama authentication, TV pairing, RPC wrapper, and
realtime socket. The web/TV must be paired with the Unity mobile app.
Use `callTvRpc` for RPC calls; it unwraps Nakama's payload and the
application's `{ result, error }` response and throws on errors.

## 2. Video likes

Likes are private favorites for the authenticated account, shared
between Web and Unity. They are not public like counts. Nakama stores
and updates them.

### Load favorites after login/pairing

``` javascript
const snapshot = await callTvRpc("rpc_video_getMyLikes", {});
```

The unwrapped result is:

``` json
{
  "userId": "account-id",
  "videoIds": ["101", "205"],
  "revision": 3
}
```

### Like or unlike using the catalog video ID

``` javascript
const snapshot = await callTvRpc("rpc_video_setMyLike", {
  videoId: "101",
  liked: true // false to remove the like
});
```

Use the returned snapshot to update the heart buttons and favorites
list. Send the desired boolean state, rather than a generic toggle
command. Disable repeated clicks while saving; show an error and allow
retry if the call fails.

### Keep devices synchronized

Listen for notification `20 - VideoLikesUpdated`. Its content has the
same snapshot shape. Replace the local favorites with the snapshot,
rather than appending IDs. Only accept snapshots for the current
account, and ignore revisions lower than the current revision. Normalize
catalog IDs to strings when checking membership.

Reload favorites on socket reconnection and browser focus, because
notifications are not persistent. Clear favorites on logout/account
change and ignore responses from the previous account. The current web
hook also refreshes every 30 seconds.

Do not write Nakama storage directly or send notification 20 from the
client; Nakama sends it after saving.

`rpc_video_getMyLikes` also accepts `{ "broadcast": true }` to broadcast
the current snapshot, which Unity uses when pairing.

**Reuse in this project:** `src/hooks/useVideoLikes.ts` already provides
`videoIds`, `ready`, `pendingId`, `error`, and `toggle(videoId)`.

## 3. "I'm ready" tutorial button

The button tells Unity to enter its tutorial and begin the existing
player/A-pose detection flow. It does not confirm successful detection
or start dance playback.

### Expected sequence

1.  Complete pairing, select the video, and use the existing
    download/buffering flow (notification 9). Select one or two players
    (notification 6), and announce video buffer readiness (notification
    10).
2.  When the user clicks **I'm ready**, disable the button and show a
    waiting state. Send the tutorial request through
    `rpc_multiSession_sendNotificationToSessions` using the active
    paired TV session.
3.  Unity enters the tutorial scene and sends `23 - TutorialStarted`,
    with `{ "videoId": 101 }` in its content.
4.  On a matching acknowledgement, show tutorial/detection instructions.
    Keep waiting for the existing gameplay synchronization flow;
    notification 23 is not permission to play the video. The existing
    notification 12 --- `VideoSyncStart` --- handles synchronized
    playback.

### Explicit tutorial request contract: code 22

``` javascript
await sendDataToMySessions(22, {
  videoId: 101, // positive integer, matching the selected video
  playerCount: 1 // 1 or 2
});
```

The helper calls `rpc_multiSession_sendNotificationToSessions` with:

``` json
{
  "subject": "client-uuid",
  "deviceId": "paired-tv-device-id",
  "code": 22,
  "content": { "videoId": 101, "playerCount": 1 }
}
```

### Important: current implementation uses code 10

Do not confuse the documented contract with the current wire behavior.
Current web implementation:

`sendTutorialStartRequested(videoId, playerCount)` actually sends code
10 with `{ videoId, playerCount, startTutorial: true }`. Nakama and
Unity support this as another tutorial-start request. Reuse this helper
in the current project; it includes compatibility reauthentication and
checks that `delivered > 0`. Its name/comment mentions code 22, but its
current wire code is 10. A plain code 10 without `startTutorial: true`
only announces buffer readiness.

An RPC success or `delivered > 0` does not confirm tutorial entry. Wait
for code 23 matching the current video and active pairing. Ignore stale
notifications. If delivery fails or the acknowledgement times out, show
a retry action. Only Unity/mobile sends code 23; the web must not send
it.

**Reuse in this project:** - `src/hooks/usePlayReady.ts` already handles
the ready action, waiting states, acknowledgement, and gameplay
synchronization. - `src/lib/nakama/sessionNotifications.ts` contains the
send helpers. - `src/lib/nakama/notificationCodes.ts` defines the codes.

## 4. Quick acceptance checks

-   [ ] Like/unlike on Web updates Unity, and changes from Unity update
    Web.
-   [ ] Favorites survive refresh/reconnect and never carry over to
    another account.
-   [ ] Clicking **I'm ready** opens the Unity tutorial for the selected
    video and player count.
-   [ ] The web leaves the tutorial-start waiting state only after a
    matching code 23 (or the existing later gameplay sync flow).
-   [ ] A disconnected phone produces a retryable error; the button
    never bypasses detection or starts playback itself.

## Backend references

-   `just-dance-nakama/src/module/video/videoLikes.ts`
-   `just-dance-nakama/src/module/multiSession/rpc/rpc_multiSession.ts`

## Unity references

-   `justdance/Assets/MonoGames/JustDance/Scripts/Runtime/Gameplay/GameplayFlowController.cs`
-   `justdance/Assets/MonoGames/JustDance/Scripts/Runtime/Nakama/Core/Modules/NakamaVideosController.cs`
    (under the same Scripts directory)

> **Implementation note:** This guide reflects the code contracts and
> current implementation details supplied in the source text. Verify the
> referenced helpers and notification behavior against the checked-out
> project before changing wire contracts.
