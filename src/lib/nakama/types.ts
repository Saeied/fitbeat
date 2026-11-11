export type NakamaSession = {
  token: string;
  refreshToken: string;
  username?: string;
  created?: boolean;
  expiresAt?: number;
};

export type SessionResponse = {
  token: string;
  refresh_token: string;
  created?: boolean;
  username?: string;
  expires_at?: number;
};

export type AccountDevice = {
  id?: string;
  user_id?: string;
};

export type AccountUser = {
  id: string;
  username?: string;
  display_name?: string;
  location?: string;
};

export type Account = {
  user?: AccountUser;
  wallet?: string;
  devices?: AccountDevice[];
};

export type StorageObjectId = {
  collection: string;
  key: string;
  user_id?: string;
};

export type StorageObject = {
  collection?: string;
  key?: string;
  user_id?: string;
  value?: string;
  version?: string;
};

export type StorageReadResponse = {
  objects?: StorageObject[];
};

export type RpcResponseEnvelope = {
  payload?: string;
};

export type NotificationPayload = {
  id?: string;
  subject?: string;
  content?: Record<string, unknown> | string;
  code?: number;
  sender_id?: string;
  create_time?: string;
  persistent?: boolean;
};

export { NOTIFICATION_CODE_LINK_ACCEPTED } from "./notificationCodes";

export class NakamaHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "NakamaHttpError";
    this.status = status;
    this.body = body;
  }
}
