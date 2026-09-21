import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Databases seeded before the rename still store the old brand names.
const LEGACY_COMPANY_NAME = /northstar|opply|orgpulse/i;

export function displayCompanyName(name?: string | null): string {
  if (!name || LEGACY_COMPANY_NAME.test(name)) return 'Omni';
  return name;
}

export function portraitUrl(seed: string, stored?: string | null): string {
  if (stored) return stored;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const gender = hash % 2 === 0 ? 'women' : 'men';
  return `https://randomuser.me/api/portraits/${gender}/${hash % 99}.jpg`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
  }
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: 'Person' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

export function fullName(firstName: string, lastName: string, preferredName?: string | null): string {
  if (preferredName) return `${preferredName} ${lastName}`.trim();
  return `${firstName} ${lastName}`.trim();
}
