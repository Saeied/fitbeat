import { withAuthRetry } from "./authorized";
import { nakamaFetch } from "./http";
import { NakamaHttpError } from "./types";

export class NakamaRpcError extends Error {
  readonly code: number | null;

  constructor(rpcName: string, code: number | null, message: string) {
    super(
      `${rpcName} failed${code != null ? ` (${code})` : ""}: ${message}`,
    );
    this.name = "NakamaRpcError";
    this.code = code;
  }
}

/** Server 4007: this session cannot mint a login code for the given device id. */
export function isLoginCodeDeviceUnauthorized(error: unknown): boolean {
  if (error instanceof NakamaRpcError && Number(error.code) === 4007) {
    return true;
  }
  const text = error instanceof Error ? error.message : String(error);
  return (
    /\b4007\b/.test(text) ||
    /not authorized to generate a login code/i.test(text)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function throwIfRpcError(rpcName: string, record: Record<string, unknown>): void {
  const errorValue = record.error;
  if (errorValue == null) return;

  const errorRecord = asRecord(errorValue);
  if (!errorRecord) {
    throw new Error(`${rpcName} failed: ${String(errorValue)}`);
  }

  const message =
    typeof errorRecord.message === "string"
      ? errorRecord.message
      : JSON.stringify(errorRecord);
  const rawCode = errorRecord.code;
  const code =
    rawCode == null || rawCode === ""
      ? null
      : Number.isFinite(Number(rawCode))
        ? Number(rawCode)
        : null;
  throw new NakamaRpcError(rpcName, code, message);
}

function unwrapData(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      return unwrapData(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }

  const record = asRecord(value);
  if (!record) return value ?? {};

  // Custom multi-session envelope: { result, error }
  if ("result" in record || "error" in record) {
    throwIfRpcError("rpc", record);
    if ("result" in record) {
      return unwrapData(record.result);
    }
  }

  // Standard Nakama envelope: { payload }
  if ("payload" in record) {
    return unwrapData(record.payload);
  }

  return record;
}

function parseRpcPayload<TPayload>(rpcName: string, response: unknown): TPayload {
  try {
    return unwrapData(response) as TPayload;
  } catch (error) {
    if (error instanceof NakamaRpcError) {
      const inner = error.message.replace(
        /^[^\s]+ failed(?:\s*\([^)]*\))?:\s*/,
        "",
      );
      throw new NakamaRpcError(rpcName, error.code, inner);
    }
    if (error instanceof Error && error.message.startsWith("rpc failed")) {
      throw new Error(error.message.replace(/^rpc failed/, `${rpcName} failed`));
    }
    throw error instanceof Error
      ? error
      : new Error(`Invalid RPC response from ${rpcName}`);
  }
}

async function postRpc(rpcName: string, body: unknown): Promise<unknown> {
  return withAuthRetry((token) =>
    nakamaFetch<unknown>(`/v2/rpc/${rpcName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body,
    }),
  );
}

/**
 * TV-style RPC: body is a JSON string value (double-encoded).
 * Falls back to a plain JSON object if the server rejects the string body.
 *
 * Response shapes supported:
 * - `{ "payload": "{\"loginCode\":...}" }`
 * - `{ "result": { "loginCode": ... }, "error": null }`
 * - nested combinations of the above
 */
export async function callTvRpc<TPayload>(
  rpcName: string,
  payload: Record<string, unknown> | Record<string, never> = {},
): Promise<TPayload> {
  try {
    const response = await postRpc(rpcName, JSON.stringify(payload));
    return parseRpcPayload<TPayload>(rpcName, response);
  } catch (error) {
    const canFallback =
      error instanceof NakamaHttpError &&
      (error.status === 400 || error.status === 500);

    if (!canFallback) {
      throw error;
    }
  }

  const response = await postRpc(rpcName, payload);
  return parseRpcPayload<TPayload>(rpcName, response);
}
