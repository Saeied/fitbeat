import { nakamaConfig } from "./config";
import { nakamaFetch } from "./http";
import type { NakamaSession, SessionResponse } from "./types";

function toSession(response: SessionResponse): NakamaSession {
  return {
    token: response.token,
    refreshToken: response.refresh_token,
    username: response.username,
    created: response.created,
    expiresAt: response.expires_at,
  };
}

/** POST /v2/account/authenticate/device — Basic server key auth. */
export async function authenticateDevice(
  deviceId: string,
  create = true,
): Promise<NakamaSession> {
  const query = create ? "?create=true" : "?create=false";
  const response = await nakamaFetch<SessionResponse>(
    `/v2/account/authenticate/device${query}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${nakamaConfig.serverKeyBasic}`,
      },
      body: { id: deviceId },
    },
  );

  return toSession(response);
}

/** POST /v2/account/session/refresh — Bearer refresh_token (not access token). */
export async function refreshSession(
  refreshToken: string,
): Promise<NakamaSession> {
  const response = await nakamaFetch<SessionResponse>(
    "/v2/account/session/refresh",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
      body: {},
    },
  );

  return toSession(response);
}
