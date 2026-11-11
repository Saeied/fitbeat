import { callTvRpc, isLoginCodeDeviceUnauthorized, NakamaRpcError } from "./rpc";
import { isGuestTvDeviceId } from "./storage";
import { NakamaHttpError } from "./types";

export type LinkLoginCodeResult = {
  loginCode: string;
  /** Unix seconds when the code expires (server). */
  expiresAt: number;
};

function pickLoginCode(payload: Record<string, unknown>): string | null {
  const nested = asRecord(payload.result) ?? asRecord(payload.data);
  const sources = [payload, nested].filter(Boolean) as Record<string, unknown>[];

  for (const source of sources) {
    const candidates = [
      source.loginCode,
      source.login_code,
    ];

    for (const value of candidates) {
      if (typeof value === "string" && isPlausibleLoginCode(value.trim())) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        const asText = String(Math.trunc(value));
        if (isPlausibleLoginCode(asText)) return asText;
      }
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Real TV login codes are 6 digits. Never treat RPC error codes (e.g. 4007) as a code. */
function isPlausibleLoginCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

function pickExpiresAt(payload: Record<string, unknown>): number {
  const nested = asRecord(payload.result) ?? asRecord(payload.data);
  const sources = [payload, nested].filter(Boolean) as Record<string, unknown>[];

  for (const source of sources) {
    const candidates = [source.expiresAt, source.expires_at, source.expiry];
    for (const value of candidates) {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (
        typeof value === "string" &&
        value.trim() &&
        !Number.isNaN(Number(value))
      ) {
        return Number(value);
      }
    }
  }
  return Math.floor(Date.now() / 1000) + 5 * 60;
}

/** POST /v2/rpc/rpc_multiSession_generateLinkLoginCode */
export async function generateLinkLoginCode(
  deviceId: string,
): Promise<LinkLoginCodeResult> {
  if (!deviceId || isGuestTvDeviceId(deviceId)) {
    throw new Error(
      "کد ورود باید با شناسه لینک تلویزیون ساخته شود، نه نشست مهمان",
    );
  }

  try {
    console.log("[TV-LOGIN] generateLinkLoginCode", { deviceId });
    const payload = await callTvRpc<Record<string, unknown>>(
      "rpc_multiSession_generateLinkLoginCode",
      { deviceId },
    );

    const loginCode = pickLoginCode(payload);
    if (!loginCode) {
      const raw = JSON.stringify(payload);
      if (isLoginCodeDeviceUnauthorized(raw) || raw.includes("4007")) {
        throw new NakamaRpcError(
          "rpc_multiSession_generateLinkLoginCode",
          4007,
          "Not authorized to generate a login code for this device",
        );
      }
      throw new Error(
        `پاسخ سرور کد ورود ندارد: ${raw.slice(0, 180)}`,
      );
    }

    return {
      loginCode,
      expiresAt: pickExpiresAt(payload),
    };
  } catch (error) {
    if (error instanceof NakamaHttpError) {
      const detail =
        typeof error.body === "string"
          ? error.body
          : JSON.stringify(error.body);
      throw new Error(
        `ساخت کد ورود ناموفق (${error.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`,
      );
    }
    throw error;
  }
}
