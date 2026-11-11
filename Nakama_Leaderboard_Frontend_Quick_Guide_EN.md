# Nakama Seasonal Leaderboard

**Frontend implementation guide** \| `@heroiclabs/nakama-js` `2.8.0`

## Goal

Build the web Seasonal Leaderboard using the existing authenticated
Nakama session. Show the active season, the top 20 players, and the
current player's own rank when it is outside the top 20. Score
submission remains server-side.

## 1. Required flow

1.  Reuse the session already created by the web app. Do not create a
    separate login flow for this page.
2.  Call the RPC `rpc_dance_getLeaderboardConfig` with an empty object:
    `{}`.
3.  Read `result.seasonalLeaderboardId` from the RPC response. Do not
    hardcode a seasonal leaderboard ID.
4.  Fetch the top 20 records and the current user's record in parallel.
5.  Render Loading, Empty, Error/Retry, and Loaded states.

If `seasonalLeaderboardId` is missing or empty, show **"Seasonal
leaderboard is unavailable."**

## 2. Core TypeScript example

``` typescript
import type { Client, Session } from "@heroiclabs/nakama-js";

type LeaderboardConfigPayload = {
  result?: {
    seasonalLeaderboardId?: string;
    seasonKey?: string;
    seasonName?: string;
  };
  error?: { message?: string } | null;
};

export async function loadSeasonalLeaderboard(client: Client, session: Session) {
  const rpc = await client.rpc(session, "rpc_dance_getLeaderboardConfig", {});
  // In nakama-js 2.8.0, rpc.payload is already parsed.
  const payload = rpc.payload as LeaderboardConfigPayload | undefined;
  if (!payload) throw new Error("Leaderboard config is empty.");
  if (payload.error) throw new Error(payload.error.message ?? "Config failed.");

  const config = payload.result;
  const leaderboardId = config?.seasonalLeaderboardId?.trim();
  if (!leaderboardId) throw new Error("Seasonal leaderboard is unavailable.");

  const [topResult, mineResult] = await Promise.all([
    client.listLeaderboardRecords(session, leaderboardId, undefined, 20),
    client.listLeaderboardRecords(session, leaderboardId, [session.user_id], 1),
  ]);

  return {
    seasonLabel: config?.seasonKey && config?.seasonName
      ? `${config.seasonKey} (${config.seasonName})`
      : config?.seasonName ?? config?.seasonKey ?? "",
    records: topResult.records ?? [],
    myRecord: mineResult.owner_records?.[0] ?? null,
  };
}
```

## 3. UI requirements

  ----------------------------------------------------------------------------
  UI element                          Expected behavior
  ----------------------------------- ----------------------------------------
  Header                              Show the page title and season label in
                                      `seasonKey (seasonName)` format.

  Each leaderboard row                Show `rank`, `username`, and `score`. If
                                      username is empty, show `—`. Format the
                                      score with thousands separators.

  Top 3                               Use medals or another clear visual
                                      treatment for ranks 1, 2, and 3.

  Current user                        Highlight a row when
                                      `record.owner_id === session.user_id`.

  My Rank section                     If `myRecord` exists but the user is not
                                      in the top 20, show it in a separate "My
                                      Rank" section.

  Empty / Error                       If there are no records, show an empty
                                      state. On failure, show a useful message
                                      and a Retry button.

  Loading                             Show a loading indicator while the RPC
                                      and leaderboard requests are running.
  ----------------------------------------------------------------------------

## 4. Security and integration notes

-   **Read scores only.** The frontend must not call
    `writeLeaderboardRecord` or any score-submission API. The existing
    server/mobile flow submits scores.
-   Use the host, port, HTTPS setting, and approved client key supplied
    by the project environment/backend team. Never expose admin
    credentials or private secrets in browser code.
-   The leaderboard response does not provide every player's avatar in
    the current implementation. If avatars or display names are required
    for all rows, ask the backend team for an approved profile API/RPC.
-   Handle network errors and allow Retry without forcing the user to
    sign in again.

## 5. Acceptance checklist

-   [ ] The season and leaderboard ID come from
    `rpc_dance_getLeaderboardConfig`.
-   [ ] The page displays up to 20 records in Nakama rank order.
-   [ ] The current player is highlighted in the top list or shown in
    "My Rank".
-   [ ] Loading, empty, error, and retry states work.
-   [ ] No score-writing call is made from the frontend.

**SDK reference:**
<https://app.unpkg.com/@heroiclabs/nakama-js@2.8.0/files/client.ts>
