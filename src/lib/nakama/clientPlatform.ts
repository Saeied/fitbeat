/** Written to Nakama account `location` (visible in Console Players detail). */
export const NAKAMA_CLIENT_PLATFORM_TV = "tv" as const;

export type NakamaClientPlatformId = "mobile" | "pc" | typeof NAKAMA_CLIENT_PLATFORM_TV;
