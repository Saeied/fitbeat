import type { TvPlayerProfile } from "./playerProfileParse";

const DOB_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar age in full years (UTC date parts — avoids timezone off-by-one). */
export function ageFromDateOfBirth(dateOfBirth: string): number | null {
  const match = DOB_PATTERN.exec(dateOfBirth.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const birthUtc = Date.UTC(year, month - 1, day);
  const birthDate = new Date(birthUtc);
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const monthDiff = now.getUTCMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < day)) {
    age -= 1;
  }

  if (age < 0 || age > 150) return null;
  return age;
}

export function resolveDisplayAge(profile: TvPlayerProfile | null): number | null {
  if (!profile) return null;
  if (profile.age != null && profile.age >= 0 && profile.age <= 150) {
    return profile.age;
  }
  if (profile.dateOfBirth) {
    return ageFromDateOfBirth(profile.dateOfBirth);
  }
  return null;
}
