import { withAuthRetry } from "./authorized";
import { nakamaFetch } from "./http";
import type { NotificationPayload } from "./types";

type ListNotificationsResponse = {
  notifications?: NotificationPayload[];
  cacheable_cursor?: string;
};

/** GET /v2/notification — poll until QR approval (code 4). */
export async function listNotifications(
  limit = 20,
): Promise<NotificationPayload[]> {
  const response = await withAuthRetry((token) =>
    nakamaFetch<ListNotificationsResponse>(
      `/v2/notification?limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    ),
  );

  return response.notifications ?? [];
}
