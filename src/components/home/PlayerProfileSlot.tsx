"use client";

import { PlayerProfileChip } from "@/components/home/PlayerProfileChip";

type PlayerProfileSlotProps = {
  displayName: string;
  avatarImageUrl: string;
};

export function PlayerProfileSlot({
  displayName,
  avatarImageUrl,
}: PlayerProfileSlotProps) {
  if (!displayName.trim()) return null;

  return (
    <PlayerProfileChip
      displayName={displayName}
      avatarImageUrl={avatarImageUrl}
    />
  );
}
