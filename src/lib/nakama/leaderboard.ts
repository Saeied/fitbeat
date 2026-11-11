import { withAuthRetry } from "./authorized";
import { nakamaFetch } from "./http";
import { callTvRpc } from "./rpc";

/** Read-only. Score submission stays on the server. */
export const RPC_DANCE_GET_LEADERBOARD_CONFIG = "rpc_dance_getLeaderboardConfig";

export const SEASONAL_LEADERBOARD_UNAVAILABLE =
  "جدول رتبه‌بندی فصلی در دسترس نیست.";

const TOP_RECORD_LIMIT = 20;

export type LeaderboardRecord = {
  ownerId: string;
  username: string;
  score: number;
  rank: number;
};

export type SeasonalLeaderboard = {
  seasonLabel: string;
  records: LeaderboardRecord[];
  myRecord: LeaderboardRecord | null;
};

type LeaderboardConfig = {
  seasonalLeaderboardId: string;
  seasonKey: string;
  seasonName: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value.trim();
  }
  return "";
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseRecord(raw: unknown): LeaderboardRecord | null {
  const record = asRecord(raw);
  if (!record) return null;
  const ownerId = readString(record, "owner_id", "ownerId");
  if (!ownerId) return null;
  return {
    ownerId,
    username: readString(record, "username"),
    score: readNumber(record.score),
    rank: readNumber(record.rank),
  };
}

function parseRecordList(
  payload: unknown,
  key: "records" | "owner_records",
): LeaderboardRecord[] {
  const record = asRecord(payload);
  if (!record) return [];
  const camelKey = key === "owner_records" ? "ownerRecords" : "records";
  const list = record[key] ?? record[camelKey];
  if (!Array.isArray(list)) return [];
  const parsed: LeaderboardRecord[] = [];
  for (const item of list) {
    const row = parseRecord(item);
    if (row) parsed.push(row);
  }
  return parsed;
}

function sortByRank(records: LeaderboardRecord[]): LeaderboardRecord[] {
  return [...records].sort((a, b) => {
    if (a.rank === b.rank) return 0;
    if (a.rank <= 0) return 1;
    if (b.rank <= 0) return -1;
    return a.rank - b.rank;
  });
}

function seasonLabel(config: LeaderboardConfig): string {
  if (config.seasonKey && config.seasonName) {
    return `${config.seasonKey} (${config.seasonName})`;
  }
  return config.seasonName || config.seasonKey;
}

function readConfig(payload: unknown): LeaderboardConfig {
  const record = asRecord(payload);
  if (!record) {
    throw new Error("Leaderboard config is empty.");
  }

  const nested = asRecord(record.result);
  const source = nested ?? record;
  return {
    seasonalLeaderboardId: readString(
      source,
      "seasonalLeaderboardId",
      "seasonal_leaderboard_id",
    ),
    seasonKey: readString(source, "seasonKey", "season_key"),
    seasonName: readString(source, "seasonName", "season_name"),
  };
}

async function listLeaderboardRecords(
  leaderboardId: string,
  options: { ownerIds?: string[]; limit: number },
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  for (const ownerId of options.ownerIds ?? []) {
    if (ownerId) params.append("owner_ids", ownerId);
  }
  const path = `/v2/leaderboard/${encodeURIComponent(leaderboardId)}?${params.toString()}`;
  return withAuthRetry((token) =>
    nakamaFetch<unknown>(path, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
}

export async function loadSeasonalLeaderboard(
  userId: string | null,
): Promise<SeasonalLeaderboard> {
  const payload = await callTvRpc<unknown>(RPC_DANCE_GET_LEADERBOARD_CONFIG, {});
  if (payload == null) {
    throw new Error("Leaderboard config is empty.");
  }

  const config = readConfig(payload);
  if (!config.seasonalLeaderboardId) {
    throw new Error(SEASONAL_LEADERBOARD_UNAVAILABLE);
  }

  const ownerId = userId?.trim() ?? "";
  const [topResult, mineResult] = await Promise.all([
    listLeaderboardRecords(config.seasonalLeaderboardId, {
      limit: TOP_RECORD_LIMIT,
    }),
    ownerId
      ? listLeaderboardRecords(config.seasonalLeaderboardId, {
          ownerIds: [ownerId],
          limit: 1,
        })
      : Promise.resolve(null),
  ]);

  const records = sortByRank(parseRecordList(topResult, "records")).slice(
    0,
    TOP_RECORD_LIMIT,
  );
  const myRecord = mineResult
    ? (parseRecordList(mineResult, "owner_records")[0] ?? null)
    : null;

  return {
    seasonLabel: seasonLabel(config),
    records,
    myRecord,
  };
}
