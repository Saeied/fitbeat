"use client";

import { useEffect, useRef, useState } from "react";
import {
  NakamaSocket,
  type NakamaSocketMessage,
  type SocketStatus,
} from "@/lib/nakama/websocket";

export type UseNakamaSocketState = {
  status: SocketStatus;
  lastMessage: NakamaSocketMessage | null;
  reconnectWithToken: (token: string) => void;
  disconnect: () => void;
};

/**
 * Keeps Nakama WS open while `enabled` and `token` are set.
 * Token change → disconnect + reconnect with the new token.
 */
export function useNakamaSocket(
  token: string | null,
  enabled: boolean,
  recoverToken?: () => Promise<string>,
): UseNakamaSocketState {
  const socketRef = useRef<NakamaSocket | null>(null);
  const recoverTokenRef = useRef(recoverToken);
  const recoveringRef = useRef(false);
  const [status, setStatus] = useState<SocketStatus>("idle");
  const [lastMessage, setLastMessage] = useState<NakamaSocketMessage | null>(
    null,
  );

  useEffect(() => {
    recoverTokenRef.current = recoverToken;
  }, [recoverToken]);

  useEffect(() => {
    if (!enabled || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus("idle");
      setLastMessage(null);
      return;
    }

    const socket = new NakamaSocket();
    socketRef.current = socket;
    socket.setListeners({
      onStatus: setStatus,
      onMessage: setLastMessage,
    });
    socket.connect(token);

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token, enabled]);

  useEffect(() => {
    if (status === "open") {
      recoveringRef.current = false;
      return;
    }
    if (
      status !== "reconnecting" ||
      recoveringRef.current ||
      !recoverTokenRef.current
    ) {
      return;
    }

    recoveringRef.current = true;
    void recoverTokenRef
      .current()
      .then((freshToken) => {
        socketRef.current?.reconnectWithToken(freshToken);
      })
      .catch((error) => {
        console.log("[NAKAMA-WS] session recovery failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        recoveringRef.current = false;
      });
  }, [status]);

  return {
    status,
    lastMessage,
    reconnectWithToken: (nextToken: string) => {
      socketRef.current?.reconnectWithToken(nextToken);
    },
    disconnect: () => {
      socketRef.current?.disconnect();
      setStatus("closed");
    },
  };
}
