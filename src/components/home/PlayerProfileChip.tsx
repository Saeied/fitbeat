"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LINKED_PLAYER_AVATAR } from "@/lib/nakama/avatarPublicUrl";
import { logAvatarImageLoadFailed } from "@/lib/nakama/playerProfileDiagnostics";

type PlayerProfileChipProps = {
  displayName: string;
  avatarImageUrl: string;
  title?: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function PlayerProfileChip({
  displayName,
  avatarImageUrl,
  title,
}: PlayerProfileChipProps) {
  const label = displayName.trim();
  const preferredSrc = avatarImageUrl.trim() || DEFAULT_LINKED_PLAYER_AVATAR;
  const [imgSrc, setImgSrc] = useState(preferredSrc);
  const [useInitials, setUseInitials] = useState(false);
  const initials = initialsFromName(label);

  useEffect(() => {
    setUseInitials(false);
    setImgSrc(preferredSrc);
  }, [preferredSrc]);

  const handleImageError = () => {
    if (imgSrc !== DEFAULT_LINKED_PLAYER_AVATAR) {
      logAvatarImageLoadFailed();
      setImgSrc(DEFAULT_LINKED_PLAYER_AVATAR);
      return;
    }
    logAvatarImageLoadFailed();
    setUseInitials(true);
  };

  return (
    <div
      className="song-banner-toolbar__avatar-slot shrink-0"
      title={title ?? label}
    >
      <div className="song-banner-toolbar__avatar-frame">
        <div className="song-banner-toolbar__avatar-content">
          {useInitials ? (
            <span
              className="song-banner-toolbar__avatar-initials flex flex-1 items-center justify-center text-lg font-extrabold text-white"
              aria-hidden
            >
              {initials}
            </span>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={imgSrc}
              src={imgSrc}
              alt=""
              aria-hidden
              className="song-banner-toolbar__avatar-img object-contain"
              onError={handleImageError}
            />
          )}
          <span className="song-banner-toolbar__avatar-label">{label}</span>
        </div>
      </div>
    </div>
  );
}
