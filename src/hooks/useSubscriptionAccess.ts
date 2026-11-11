"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import {
  mergeSubscriptionStatus,
  subscriptionIsActive,
} from "@/lib/nakama/playerProfileSubscription";
export { subscriptionIsActive };

import {

  fetchSubscriptionStatus,

  type SubscriptionStatus,

} from "@/lib/nakama/subscription";



export type UseSubscriptionAccessState = {

  status: SubscriptionStatus | null;

  loading: boolean;

  errorMessage: string | null;

  refresh: () => Promise<void>;

  applyFromProfile: (incoming: SubscriptionStatus) => void;

  resetSubscription: () => void;

};



/** Loads server subscription/free-tier status after TV session is ready/linked. */

export function useSubscriptionAccess(

  enabled: boolean,

): UseSubscriptionAccessState {

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);

  const [loading, setLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  const statusRef = useRef<SubscriptionStatus | null>(null);

  statusRef.current = status;



  const refresh = useCallback(async () => {

    setAttempt((n) => n + 1);

  }, []);



  const applyFromProfile = useCallback((incoming: SubscriptionStatus) => {

    setStatus((current) => mergeSubscriptionStatus(current, incoming));

  }, []);



  const resetSubscription = useCallback(() => {

    setStatus(null);

    setErrorMessage(null);

    setLoading(false);

  }, []);



  useEffect(() => {

    if (!enabled) {

      resetSubscription();

      return;

    }



    let cancelled = false;

    setLoading(true);

    setErrorMessage(null);



    void (async () => {

      try {

        const next = await fetchSubscriptionStatus();

        if (cancelled) return;

        setStatus((current) => mergeSubscriptionStatus(current, next));

      } catch (error) {

        if (cancelled) return;

        setErrorMessage(

          error instanceof Error

            ? error.message

            : "خواندن وضعیت اشتراک ناموفق بود",

        );

      } finally {

        if (!cancelled) setLoading(false);

      }

    })();



    return () => {

      cancelled = true;

    };

  }, [enabled, attempt, resetSubscription]);



  return {

    status,

    loading,

    errorMessage,

    refresh,

    applyFromProfile,

    resetSubscription,

  };

}

