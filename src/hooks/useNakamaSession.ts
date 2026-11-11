"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureTvClientPlatformLocation, getAccount } from "@/lib/nakama/account";
import {
  authenticateLinkedTvDevice,
  prepareGuestPairingSession,
  recoverTvSession,
  restoreLinkedTvSession,
  restartGuestTvSession,
} from "@/lib/nakama/session";
import {
  clearStoredSession,
  consumeRequireConnect,
  getStoredSession,
  setStoredUserId,
} from "@/lib/nakama/storage";
import {
  readPublicServerConfig,
  type PublicServerConfig,
} from "@/lib/nakama/storageApi";
import type { Account, NakamaSession } from "@/lib/nakama/types";
import { NakamaHttpError } from "@/lib/nakama/types";

export type SessionStatus =
  | "idle"
  | "connecting"
  | "loadingAccount"
  | "relinking"
  | "ready"
  | "error";

export type UseNakamaSessionState = {
  status: SessionStatus;
  session: NakamaSession | null;
  /** Link device id for QR / generateLinkLoginCode (never guest). */
  linkDeviceId: string | null;
  /** Device id used for the current authenticate/device session. */
  authDeviceId: string | null;
  /** @deprecated Prefer linkDeviceId for QR/RPC. */
  deviceId: string | null;
  source: "stored" | "refreshed" | "authenticated" | null;
  account: Account | null;
  userId: string | null;
  serverConfig: PublicServerConfig | null;
  errorMessage: string | null;
  /** True after post-pair link-device re-auth succeeded. */
  linked: boolean;
  retry: () => void;
  /** After code 4: auth as link device (WS drops while status is relinking). */
  relinkAfterPair: () => Promise<void>;
  /** Back to guest so a new login code can be generated. Same link device id. */
  restartAsGuest: () => Promise<void>;
  /**
   * 4007 recovery: unlink stale link device, guest session, fresh device id.
   */
  prepareForPairing: (options?: { rotateDeviceId?: boolean }) => Promise<void>;
  /** Return a valid token for a WebSocket reconnect and sync React state. */
  recoverSocketToken: () => Promise<string>;
};

const SOCKET_REFRESH_LEEWAY_SECONDS = 60;

function isSessionFresh(session: NakamaSession): boolean {
  if (session.expiresAt == null) return false;
  const expiresAtMs =
    session.expiresAt > 10_000_000_000
      ? session.expiresAt
      : session.expiresAt * 1000;
  return expiresAtMs - Date.now() > SOCKET_REFRESH_LEEWAY_SECONDS * 1000;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof NakamaHttpError) {
    return `خطای سرور (${error.status})`;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "زمان اتصال به سرور تمام شد";
  }
  if (error instanceof TypeError) {
    return "ارتباط با سرور برقرار نشد";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "خطای ناشناخته در ورود";
}

async function loadAccountAndConfig(): Promise<{
  account: Account;
  userId: string | null;
  serverConfig: PublicServerConfig;
}> {
  const [account, serverConfig] = await Promise.all([
    getAccount(),
    readPublicServerConfig(),
  ]);
  const userId = account.user?.id ?? null;
  if (userId) {
    setStoredUserId(userId);
  }
  try {
    await ensureTvClientPlatformLocation();
  } catch (error) {
    console.warn("[TV-PLATFORM] failed to stamp account location", error);
  }
  return { account, userId, serverConfig };
}

export function useNakamaSession(): UseNakamaSessionState {
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [session, setSession] = useState<NakamaSession | null>(null);
  const [linkDeviceId, setLinkDeviceId] = useState<string | null>(null);
  const [authDeviceId, setAuthDeviceId] = useState<string | null>(null);
  const [source, setSource] = useState<
    "stored" | "refreshed" | "authenticated" | null
  >(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<PublicServerConfig | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setStatus("connecting");
      setErrorMessage(null);
      setAccount(null);
      setUserId(null);
      setServerConfig(null);
      setLinked(false);

      try {
        let result: Awaited<ReturnType<typeof prepareGuestPairingSession>>;
        let restoredLinked = false;

        if (consumeRequireConnect()) {
          clearStoredSession();
          result = await prepareGuestPairingSession({ force: true });
          console.log("[TV-PAIRING] fresh guest after TV reload/close");
        } else {
          const restored = await restoreLinkedTvSession();
          result = restored ?? (await prepareGuestPairingSession());
          restoredLinked = restored != null;
        }

        if (cancelled) return;

        setSession(result.session);
        setLinkDeviceId(result.linkDeviceId);
        setAuthDeviceId(result.authDeviceId);
        setSource(result.source);
        setStatus("loadingAccount");

        const next = await loadAccountAndConfig();
        if (cancelled) return;

        setAccount(next.account);
        setUserId(next.userId);
        setServerConfig(next.serverConfig);
        setLinked(restoredLinked);
        setStatus("ready");
        console.log("[TV-PAIRING] session ready", {
          linked: restoredLinked,
          deviceId: result.linkDeviceId,
        });
      } catch (error) {
        if (cancelled) return;
        setSession(null);
        setSource(null);
        setAccount(null);
        setUserId(null);
        setServerConfig(null);
        setLinked(false);
        setErrorMessage(toErrorMessage(error));
        setStatus("error");
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const relinkAfterPair = useCallback(async () => {
    setStatus("relinking");
    setErrorMessage(null);

    try {
      const result = await authenticateLinkedTvDevice();
      setSession(result.session);
      setLinkDeviceId(result.linkDeviceId);
      setAuthDeviceId(result.authDeviceId);
      setSource(result.source);

      const next = await loadAccountAndConfig();
      setAccount(next.account);
      setUserId(next.userId);
      setServerConfig(next.serverConfig);
      setLinked(true);
      setStatus("ready");
    } catch (error) {
      setLinked(false);
      setErrorMessage(toErrorMessage(error));
      setStatus("error");
      throw error;
    }
  }, []);

  const applySession = useCallback(
    async (
      result: Awaited<ReturnType<typeof restartGuestTvSession>>,
      nextLinked: boolean,
    ) => {
      setSession(result.session);
      setLinkDeviceId(result.linkDeviceId);
      setAuthDeviceId(result.authDeviceId);
      setSource(result.source);
      setStatus("loadingAccount");

      const next = await loadAccountAndConfig();
      setAccount(next.account);
      setUserId(next.userId);
      setServerConfig(next.serverConfig);
      setLinked(nextLinked);
      setStatus("ready");
    },
    [],
  );

  const restartAsGuest = useCallback(async () => {
    setStatus("connecting");
    setErrorMessage(null);
    setLinked(false);

    try {
      const result = await restartGuestTvSession();
      await applySession(result, false);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setStatus("error");
      throw error;
    }
  }, [applySession]);

  const prepareForPairing = useCallback(async (options?: {
    rotateDeviceId?: boolean;
  }) => {
    setStatus("connecting");
    setErrorMessage(null);
    setLinked(false);

    try {
      const result = await prepareGuestPairingSession({
        force: true,
        rotateDeviceId: options?.rotateDeviceId,
      });
      await applySession(result, false);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setStatus("error");
      throw error;
    }
  }, [applySession]);

  const recoverSocketToken = useCallback(async (): Promise<string> => {
    const stored = getStoredSession();
    if (stored && isSessionFresh(stored)) {
      setSession(stored);
      return stored.token;
    }

    const recovered = await recoverTvSession();
    setSession(recovered);
    setSource("refreshed");
    return recovered.token;
  }, []);

  useEffect(() => {
    if (status !== "ready" || !session?.expiresAt) return;
    const expiresAtMs =
      session.expiresAt > 10_000_000_000
        ? session.expiresAt
        : session.expiresAt * 1000;
    const delayMs = Math.max(
      1_000,
      expiresAtMs - Date.now() - SOCKET_REFRESH_LEEWAY_SECONDS * 1000,
    );
    const timer = setTimeout(() => {
      void recoverSocketToken().catch((error) => {
        console.log("[NAKAMA-SESSION] proactive refresh failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [recoverSocketToken, session?.expiresAt, status]);

  return {
    status,
    session,
    linkDeviceId,
    authDeviceId,
    deviceId: linkDeviceId,
    source,
    account,
    userId,
    serverConfig,
    errorMessage,
    linked,
    retry: () => setAttempt((value) => value + 1),
    relinkAfterPair,
    restartAsGuest,
    prepareForPairing,
    recoverSocketToken,
  };
}
