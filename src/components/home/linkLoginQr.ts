import QRCode from "qrcode";

export const LINK_LOGIN_QR_OPTIONS = {
  margin: 1,
  width: 400,
  color: {
    dark: "#0b1b3a",
    light: "#ffffff",
  },
} as const;

export function buildLinkLoginQrPayload(
  deviceId: string,
  loginCode: string,
): string {
  return JSON.stringify({ deviceId, loginCode });
}

export async function linkLoginQrDataUrl(
  deviceId: string,
  loginCode: string,
): Promise<string> {
  return QRCode.toDataURL(
    buildLinkLoginQrPayload(deviceId, loginCode),
    LINK_LOGIN_QR_OPTIONS,
  );
}
