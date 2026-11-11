import { withAuthRetry } from "./authorized";
import { NAKAMA_CLIENT_PLATFORM_TV } from "./clientPlatform";
import { nakamaFetch } from "./http";
import type { Account } from "./types";

/** GET /v2/account — resolve user_id after authenticate. */
export async function getAccount(): Promise<Account> {
  return withAuthRetry((token) =>
    nakamaFetch<Account>("/v2/account", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
}

/**
 * Stamp TV client platform on the account `location` field (Nakama Console Players detail).
 * After mobile pairing, TV and mobile share one user — last login wins for Location.
 */
export async function ensureTvClientPlatformLocation(): Promise<void> {
  const account = await getAccount();
  const current = account.user?.location;
  if (current === NAKAMA_CLIENT_PLATFORM_TV) {
    return;
  }

  await withAuthRetry((token) =>
    nakamaFetch<void>("/v2/account", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: { location: NAKAMA_CLIENT_PLATFORM_TV },
    }),
  );

  console.log("[TV-PLATFORM] account location set to tv", {
    userId: account.user?.id,
    previous: current ?? "(empty)",
  });
}
