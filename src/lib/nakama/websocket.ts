import { nakamaConfig, nakamaTimeouts } from "./config";
import { getNakamaSocketTiming } from "@/lib/video/deviceProfile";

export type SocketStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export type NakamaSocketMessage = {
  raw: string | ArrayBuffer;
  json: unknown | null;
};

type SocketListeners = {
  onStatus?: (status: SocketStatus) => void;
  onMessage?: (message: NakamaSocketMessage) => void;
  onError?: (error: Event | Error) => void;
};

function buildWsUrl(token: string): string {
  const url = new URL("/ws", nakamaConfig.wsUrl.replace(/^http/, "ws"));
  url.searchParams.set("token", token);
  url.searchParams.set("status", "false");
  url.searchParams.set("lang", "en");
  return url.toString();
}

function parseSocketMessage(data: string | ArrayBuffer): NakamaSocketMessage {
  if (typeof data !== "string") {
    return { raw: data, json: null };
  }

  try {
    return { raw: data, json: JSON.parse(data) as unknown };
  } catch {
    return { raw: data, json: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasEnvelopeKey(json: unknown, key: string): boolean {
  return isRecord(json) && key in json;
}

/**
 * TV realtime channel — stays open for QR / sync notifications.
 * Application-level ping/pong matches nakama-js heartbeat (Chromium/TV lack native WS ping).
 */
export class NakamaSocket {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private status: SocketStatus = "idle";
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatPongTimer: ReturnType<typeof setTimeout> | null = null;
  private waitingForPong = false;
  private listeners: SocketListeners = {};

  setListeners(listeners: SocketListeners): void {
    this.listeners = listeners;
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  getToken(): string | null {
    return this.token;
  }

  connect(token: string): void {
    this.intentionalClose = false;
    this.token = token;
    this.openSocket(token, "connecting");
  }

  /** Close current socket and open with a new access token. */
  reconnectWithToken(token: string): void {
    this.clearReconnectTimer();
    this.intentionalClose = false;
    this.token = token;
    this.reconnectAttempt = 0;
    this.stopHeartbeat();
    this.closeSocketOnly();
    this.openSocket(token, "reconnecting");
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.clearConnectTimer();
    this.stopHeartbeat();
    this.closeSocketOnly();
    this.setStatus("closed");
  }

  private getTiming() {
    if (typeof window !== "undefined") {
      return getNakamaSocketTiming();
    }
    return {
      connectTimeoutMs: nakamaTimeouts.socketMs,
      heartbeatIntervalMs: 10_000,
      heartbeatTimeoutMs: 10_000,
    };
  }

  private openSocket(
    token: string,
    nextStatus: "connecting" | "reconnecting",
  ): void {
    if (typeof WebSocket === "undefined") {
      this.setStatus("error");
      this.listeners.onError?.(new Error("WebSocket is not available"));
      return;
    }

    const timing = this.getTiming();

    this.clearConnectTimer();
    this.stopHeartbeat();
    this.closeSocketOnly();
    this.setStatus(nextStatus);

    const socket = new WebSocket(buildWsUrl(token));
    this.socket = socket;

    this.connectTimer = setTimeout(() => {
      if (this.socket === socket && socket.readyState !== WebSocket.OPEN) {
        socket.close();
        this.listeners.onError?.(new Error("WebSocket connection timed out"));
        this.scheduleReconnect();
      }
    }, timing.connectTimeoutMs);

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.clearConnectTimer();
      this.reconnectAttempt = 0;
      this.setStatus("open");
      this.scheduleHeartbeat(timing.heartbeatIntervalMs);
    };

    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.socket !== socket) return;

      const message = parseSocketMessage(event.data);
      const json = message.json;

      if (hasEnvelopeKey(json, "pong")) {
        this.onPongReceived(timing.heartbeatIntervalMs);
        return;
      }

      if (hasEnvelopeKey(json, "ping")) {
        try {
          socket.send(JSON.stringify({ pong: {} }));
        } catch {
          /* best-effort */
        }
        return;
      }

      this.listeners.onMessage?.(message);
    };

    socket.onerror = (event) => {
      if (this.socket !== socket) return;
      this.listeners.onError?.(event);
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      console.log("[NAKAMA-WS] closed", {
        code: event.code,
        reason: event.reason || "none",
        wasClean: event.wasClean,
        reconnectAttempt: this.reconnectAttempt,
      });
      this.socket = null;
      this.clearConnectTimer();
      this.stopHeartbeat();

      if (this.intentionalClose) {
        this.setStatus("closed");
        return;
      }

      this.scheduleReconnect();
    };
  }

  private scheduleHeartbeat(delayMs: number): void {
    this.clearHeartbeatTimers(false);
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      this.sendHeartbeat();
    }, delayMs);
  }

  private sendHeartbeat(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const timing = this.getTiming();

    try {
      this.waitingForPong = true;
      socket.send(JSON.stringify({ ping: {} }));
    } catch (error) {
      this.waitingForPong = false;
      this.listeners.onError?.(
        error instanceof Error ? error : new Error("WebSocket ping failed"),
      );
      this.handleHeartbeatFailure();
      return;
    }

    this.heartbeatPongTimer = setTimeout(() => {
      if (!this.waitingForPong) return;
      this.waitingForPong = false;
      console.log("[NAKAMA-WS] heartbeat timeout — reconnecting");
      this.listeners.onError?.(new Error("WebSocket heartbeat timeout"));
      this.handleHeartbeatFailure();
    }, timing.heartbeatTimeoutMs);
  }

  private onPongReceived(nextIntervalMs: number): void {
    this.waitingForPong = false;
    this.clearHeartbeatPongTimer();
    this.scheduleHeartbeat(nextIntervalMs);
  }

  private handleHeartbeatFailure(): void {
    this.stopHeartbeat();
    this.closeSocketOnly();
    this.scheduleReconnect();
  }

  private stopHeartbeat(): void {
    this.waitingForPong = false;
    this.clearHeartbeatTimers(true);
  }

  private clearHeartbeatPongTimer(): void {
    if (this.heartbeatPongTimer != null) {
      clearTimeout(this.heartbeatPongTimer);
      this.heartbeatPongTimer = null;
    }
  }

  private clearHeartbeatTimers(clearSchedule: boolean): void {
    if (clearSchedule && this.heartbeatTimer != null) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatPongTimer();
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.token) {
      this.setStatus("closed");
      return;
    }

    this.setStatus("reconnecting");
    this.clearReconnectTimer();

    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15_000);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      if (this.intentionalClose || !this.token) return;
      this.openSocket(this.token, "reconnecting");
    }, delay);
  }

  private closeSocketOnly(): void {
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private setStatus(status: SocketStatus): void {
    this.status = status;
    this.listeners.onStatus?.(status);
  }
}
