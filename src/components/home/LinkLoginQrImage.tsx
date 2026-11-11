"use client";

import { useEffect, useState } from "react";
import { linkLoginQrDataUrl } from "@/components/home/linkLoginQr";

type LinkLoginQrImageProps = {
  deviceId: string | null;
  loginCode: string | null;
  className?: string;
  alt?: string;
};

export function LinkLoginQrImage({
  deviceId,
  loginCode,
  className,
  alt = "Link login QR code",
}: LinkLoginQrImageProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderQr() {
      if (!deviceId || !loginCode) {
        setQrDataUrl(null);
        return;
      }

      try {
        const url = await linkLoginQrDataUrl(deviceId, loginCode);
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    }

    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [deviceId, loginCode]);

  if (!deviceId || !loginCode) return null;

  if (!qrDataUrl) {
    return (
      <span
        className={[className, "animate-pulse rounded-md bg-violet-200/30"]
          .filter(Boolean)
          .join(" ")}
        aria-busy="true"
        aria-label="Generating QR code"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={qrDataUrl}
      alt={alt}
      width={400}
      height={400}
      className={className}
    />
  );
}
