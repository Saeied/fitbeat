"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PairRelinkPhase = "idle" | "relinking" | "linked" | "error";

type UsePairRelinkOptions = {
  /** True when link login detected notification code 4. */
  paired: boolean;
  relinkAfterPair: () => Promise<void>;
};

/**
 * After QR approval: session status becomes "relinking" (socket disabled),
 * then link-device re-auth, then socket reconnects with the new token.
 *
 * In-flight relink must finish even if `paired` flickers or the effect
 * re-runs (React Strict Mode). Cleanup must not swallow a successful auth.
 */
export function usePairRelink({
  paired,
  relinkAfterPair,
}: UsePairRelinkOptions): {
  phase: PairRelinkPhase;
  errorMessage: string | null;
  reset: () => void;
} {
  const [phase, setPhase] = useState<PairRelinkPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);
  const pairedRef = useRef(paired);
  pairedRef.current = paired;

  useEffect(() => {
    if (!paired || startedRef.current) return;
    startedRef.current = true;

    async function run() {
      setPhase("relinking");
      setErrorMessage(null);
      try {
        await relinkAfterPair();
        if (startedRef.current && pairedRef.current) {
          setPhase("linked");
        }
      } catch (error) {
        if (!startedRef.current || !pairedRef.current) return;
        setPhase("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "اتصال مجدد پس از تأیید گوشی ناموفق بود",
        );
      }
    }

    void run();
  }, [paired, relinkAfterPair]);

  const reset = useCallback(() => {
    startedRef.current = false;
    setPhase("idle");
    setErrorMessage(null);
  }, []);

  return {
    phase,
    errorMessage,
    reset,
  };
}
