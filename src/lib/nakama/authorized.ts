import { getStoredSession } from "./storage";
import { ensureTvSession, recoverTvSession } from "./session";
import { NakamaHttpError } from "./types";

/**
 * Run an authenticated Nakama call; on 401 refresh once and retry.
 */
export async function withAuthRetry<T>(
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  const existing = getStoredSession();
  const accessToken =
    existing?.token ?? (await ensureTvSession()).session.token;

  try {
    return await fn(accessToken);
  } catch (error) {
    if (!(error instanceof NakamaHttpError) || error.status !== 401) {
      throw error;
    }

    const recovered = await recoverTvSession();
    return fn(recovered.token);
  }
}
