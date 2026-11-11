import { withAuthRetry } from "./authorized";
import { nakamaFetch } from "./http";
import type {
  StorageObject,
  StorageObjectId,
  StorageReadResponse,
} from "./types";

/** POST /v2/storage — read storage objects by collection/key. */
export async function readStorageObjects(
  objectIds: StorageObjectId[],
): Promise<StorageObject[]> {
  const response = await withAuthRetry((token) =>
    nakamaFetch<StorageReadResponse>("/v2/storage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        object_ids: objectIds.map((item) => ({
          collection: item.collection,
          key: item.key,
          user_id: item.user_id ?? "",
        })),
      },
    }),
  );

  return response.objects ?? [];
}

export type PublicServerConfig = {
  raw: string | null;
  parsed: Record<string, unknown> | null;
};

/** Read server_configuration / public_server (TV after Connect). */
export async function readPublicServerConfig(): Promise<PublicServerConfig> {
  const objects = await readStorageObjects([
    {
      collection: "server_configuration",
      key: "public_server",
      user_id: "",
    },
  ]);

  const value = objects[0]?.value ?? null;
  if (!value) {
    return { raw: null, parsed: null };
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { raw: value, parsed: parsed as Record<string, unknown> };
    }
    return { raw: value, parsed: { value: parsed } };
  } catch {
    return { raw: value, parsed: null };
  }
}
