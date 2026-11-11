"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { nakamaTimeouts } from "@/lib/nakama/config";
import { generateLinkLoginCode } from "@/lib/nakama/linkLogin";
import {
  extractNotifications,
  findLinkAcceptedNotification,
} from "@/lib/nakama/notificationParse";
import { listNotifications } from "@/lib/nakama/notifications";
import { isLoginCodeDeviceUnauthorized } from "@/lib/nakama/rpc";
import type { NotificationPayload } from "@/lib/nakama/types";
import type { NakamaSocketMessage } from "@/lib/nakama/websocket";

export type LinkLoginStatus =
  | "idle"
  | "generating"
  | "waiting"
  | "paired"
  | "error";

export type UseLinkLoginState = {
  status: LinkLoginStatus;
  loginCode: string | null;
  expiresAt: number | null;
  pairedNotification: NotificationPayload | null;
  errorMessage: string | null;
  regenerate: () => void;
  /** Clear pairing so a new QR can be minted after disconnect. */
  reset: () => void;
};

type UseLinkLoginOptions = {
  /** Link device id for RPC body + QR (not the guest auth id). */
  linkDeviceId: string | null;
  /** Session ready — code generation uses REST, not WebSocket. */
  enabled: boolean;
  /** When true, listen for code 4 (WS and/or REST poll). */
  listenForPairing: boolean;
  /** Used to lower REST fallback frequency while WS appears healthy. */
  socketOpen?: boolean;
  lastSocketMessage: NakamaSocketMessage | null;
  /**
   * Server 4007: unlink this TV's link device, return to guest, then
   * generate again. Same device id — do not mint a new TV.
   */
  recoverFromUnauthorizedDevice?: (options?: {
    rotateDeviceId?: boolean;
  }) => Promise<void>;
  /** Linked Nakama session — never mint or refresh login codes. */
  sessionLinked?: boolean;
};

function toExpiresAtMs(expiresAt: number): number {
  return expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
}

export function useLinkLogin({
  linkDeviceId,
  enabled,
  listenForPairing,
  socketOpen = false,
  lastSocketMessage,
  recoverFromUnauthorizedDevice,
  sessionLinked = false,
}: UseLinkLoginOptions): UseLinkLoginState {
  const [status, setStatus] = useState<LinkLoginStatus>("idle");
  const [loginCode, setLoginCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [pairedNotification, setPairedNotification] =
    useState<NotificationPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const pairedRef = useRef(false);
  const loginCodeRef = useRef<string | null>(null);
  const unauthorizedRecoveriesRef = useRef(0);
  const recoverRef = useRef(recoverFromUnauthorizedDevice);
  recoverRef.current = recoverFromUnauthorizedDevice;
  const ignoreSocketMessageRef = useRef<NakamaSocketMessage | null>(null);

  const markPaired = useCallback((notification: NotificationPayload) => {
    if (pairedRef.current) return;
    pairedRef.current = true;
    setPairedNotification(notification);
    setStatus("paired");
  }, []);

  const regenerate = useCallback(() => {
    pairedRef.current = false;
    loginCodeRef.current = null;
    unauthorizedRecoveriesRef.current = 0;
    ignoreSocketMessageRef.current = lastSocketMessage;
    setPairedNotification(null);
    setLoginCode(null);
    setExpiresAt(null);
    setErrorMessage(null);
    setStatus("generating");
    setGeneration((value) => value + 1);
  }, [lastSocketMessage]);

  const reset = useCallback(() => {
    pairedRef.current = false;
    loginCodeRef.current = null;
    unauthorizedRecoveriesRef.current = 0;
    ignoreSocketMessageRef.current = lastSocketMessage;
    setPairedNotification(null);
    setLoginCode(null);
    setExpiresAt(null);
    setErrorMessage(null);
    setStatus("idle");
    setGeneration((value) => value + 1);
  }, [lastSocketMessage]);

  useEffect(() => {
    if (sessionLinked) return;

    if (!enabled || !linkDeviceId) {
      if (!pairedRef.current) {
        setStatus("idle");
        setLoginCode(null);
        setExpiresAt(null);
        loginCodeRef.current = null;
      }
      return;
    }

    if (pairedRef.current) return;

    let cancelled = false;
    let expireTimer: ReturnType<typeof setTimeout> | null = null;

    async function createCode() {
      setStatus("generating");
      setErrorMessage(null);

      try {
        console.log("[TV-PAIRING] generating login code", {
          deviceId: linkDeviceId,
        });
        const result = await generateLinkLoginCode(linkDeviceId!);
        if (cancelled || pairedRef.current) return;

        loginCodeRef.current = result.loginCode;
        setLoginCode(result.loginCode);
        setExpiresAt(result.expiresAt);
        setStatus("waiting");
        unauthorizedRecoveriesRef.current = 0;
        console.log("[TV-PAIRING] QR code generated");

        const waitMs = Math.min(
          Math.max(toExpiresAtMs(result.expiresAt) - Date.now(), 5_000),
          nakamaTimeouts.loginCodeTtlMs,
        );

        expireTimer = setTimeout(() => {
          if (!cancelled && !pairedRef.current) {
            setGeneration((value) => value + 1);
          }
        }, waitMs);
      } catch (error) {
        if (cancelled) return;

        const canRecover =
          !sessionLinked &&
          isLoginCodeDeviceUnauthorized(error) &&
          unauthorizedRecoveriesRef.current < 1 &&
          recoverRef.current;

        if (canRecover) {
          unauthorizedRecoveriesRef.current += 1;
          console.log("[TV-PAIRING] 4007 recovery — prepareForPairing");
          try {
            await recoverRef.current?.({ rotateDeviceId: true });
            // Session re-prepare disables this effect (cancelled=true); bump
            // generation so the next ready cycle retries code generation once.
            console.log("[TV-PAIRING] session refreshed — retrying login code");
            setGeneration((value) => value + 1);
          } catch (recoverError) {
            if (cancelled) return;
            loginCodeRef.current = null;
            setLoginCode(null);
            setExpiresAt(null);
            setStatus("error");
            setErrorMessage(
              recoverError instanceof Error
                ? recoverError.message
                : "خطا در ساخت کد ورود",
            );
          }
          return;
        }

        loginCodeRef.current = null;
        setLoginCode(null);
        setExpiresAt(null);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "خطا در ساخت کد ورود",
        );
      }
    }

    void createCode();

    return () => {
      cancelled = true;
      if (expireTimer) clearTimeout(expireTimer);
    };
  }, [linkDeviceId, enabled, generation, sessionLinked]);

  useEffect(() => {
    if (!listenForPairing || status !== "waiting" || pairedRef.current) return;

    let cancelled = false;
    const expectedCode = loginCodeRef.current;
    const pollIntervalMs = nakamaTimeouts.qrPollMs;

    async function poll() {
      try {
        const notifications = await listNotifications(20);
        if (cancelled || pairedRef.current) return;
        const accepted = findLinkAcceptedNotification(
          notifications,
          expectedCode,
        );
        if (accepted) markPaired(accepted);
      } catch {
        // ignore transient poll errors
      }
    }

    void poll();
    const id = setInterval(() => {
      void poll();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [listenForPairing, socketOpen, status, markPaired, generation]);

  useEffect(() => {
    if (!listenForPairing || status !== "waiting" || pairedRef.current) return;
    if (!lastSocketMessage?.json) return;
    if (lastSocketMessage === ignoreSocketMessageRef.current) return;

    const accepted = findLinkAcceptedNotification(
      extractNotifications(lastSocketMessage.json),
      loginCodeRef.current,
    );
    if (accepted) markPaired(accepted);
  }, [listenForPairing, status, lastSocketMessage, markPaired]);

  return {
    status,
    loginCode,
    expiresAt,
    pairedNotification,
    errorMessage,
    regenerate,
    reset,
  };
}
