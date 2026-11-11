"use client";

import { useEffect, useState } from "react";
import type { SocketStatus } from "@/lib/nakama/websocket";

const DEFAULT_GRACE_MS = 4_000;

function isSocketOutage(status: SocketStatus): boolean {
  return (
    status === "reconnecting" ||
    status === "closed" ||
    status === "error"
  );
}

/** Hide brief reconnect blips — show outage UI only after sustained downtime. */
export function useSocketOutageGrace(
  socketStatus: SocketStatus,
  graceMs: number = DEFAULT_GRACE_MS,
): boolean {
  const [showOutage, setShowOutage] = useState(false);

  useEffect(() => {
    if (!isSocketOutage(socketStatus)) {
      setShowOutage(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowOutage(true);
    }, graceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [socketStatus, graceMs]);

  return showOutage;
}
