import { createHash } from 'node:crypto';
import { parseProfileInput, type ParsedProfile, type ProfileProvider } from '@/domain/people/profile-link';

export interface ProfileDraft {
  provider: ProfileProvider;
  username: string | null;
  profileUrl: string | null;
  photoUrl: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  bio: string;
  location: string;
  company: string;
  notes: string[];
  remoteFetched: boolean;
}

export async function previewProfileLink(input: string): Promise<ProfileDraft> {
  const parsed = parseProfileInput(input);
  if (parsed.provider === 'GITHUB' && parsed.username) {
    return resolveGithub(parsed);
  }
  if (parsed.provider === 'GRAVATAR') {
    return resolveGravatar(parsed);
  }
  if (parsed.provider === 'LINKEDIN') {
    const display = titleFromUsername(parsed.username);
    const [firstName, lastName] = splitName(display);
    return {
      provider: 'LINKEDIN',
      username: parsed.username,
      profileUrl: parsed.profileUrl,
      photoUrl: null,
      firstName,
      lastName,
      displayName: display,
      email: '',
      bio: '',
      location: '',
      company: '',
      notes: [
        'LinkedIn is not fetched. Paste a photo URL or GitHub username if you want a picture, then edit the name, title, and groups yourself.',
      ],
      remoteFetched: false,
    };
  }

  return {
    provider: parsed.provider,
    username: parsed.username,
    profileUrl: parsed.profileUrl,
    photoUrl: parsed.photoHint,
    firstName: '',
    lastName: '',
    displayName: parsed.username ?? '',
    email: '',
    bio: '',
    location: '',
    company: '',
    notes: ['Photo URL accepted. Fill in the name and role before creating the person.'],
    remoteFetched: false,
  };
}

async function resolveGithub(parsed: ParsedProfile): Promise<ProfileDraft> {
  const username = parsed.username!;
  const fallbackPhoto = `https://github.com/${username}.png`;
  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'OmniOchart/0.1',
      },
    });
    if (!response.ok) {
      return githubDraft(parsed, fallbackPhoto, false, [
        response.status === 404
          ? 'No public GitHub user with that username. Keep the username and fill the details yourself.'
          : 'GitHub could not be reached. Photo link is still set from the username.',
      ]);
    }
    const body = (await response.json()) as {
      name?: string | null;
      login?: string;
      avatar_url?: string;
      bio?: string | null;
      email?: string | null;
      location?: string | null;
      company?: string | null;
      html_url?: string;
    };
    const display = body.name?.trim() || titleFromUsername(body.login ?? username);
    const [firstName, lastName] = splitName(display);
    return {
      provider: 'GITHUB',
      username,
      profileUrl: body.html_url ?? parsed.profileUrl,
      photoUrl: body.avatar_url ?? fallbackPhoto,
      firstName,
      lastName,
      displayName: display,
      email: body.email ?? '',
      bio: body.bio ?? '',
      location: body.location ?? '',
      company: (body.company ?? '').replace(/^@/, ''),
      notes: ['Public GitHub profile loaded. Uncheck any field you do not want on the chart.'],
      remoteFetched: true,
    };
  } catch {
    return githubDraft(parsed, fallbackPhoto, false, [
      'GitHub lookup failed. You can still save the photo URL and edit the rest.',
    ]);
  }
}

function githubDraft(
  parsed: ParsedProfile,
  photoUrl: string,
  remoteFetched: boolean,
  notes: string[],
): ProfileDraft {
  const display = titleFromUsername(parsed.username);
  const [firstName, lastName] = splitName(display);
  return {
    provider: 'GITHUB',
    username: parsed.username,
    profileUrl: parsed.profileUrl,
    photoUrl,
    firstName,
    lastName,
    displayName: display,
    email: '',
    bio: '',
    location: '',
    company: '',
    notes,
    remoteFetched,
  };
}

function resolveGravatar(parsed: ParsedProfile): ProfileDraft {
  const email = parsed.username ?? '';
  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  const local = email.split('@')[0] ?? email;
  const display = titleFromUsername(local);
  const [firstName, lastName] = splitName(display);
  return {
    provider: 'GRAVATAR',
    username: email,
    profileUrl: parsed.profileUrl,
    photoUrl: `https://www.gravatar.com/avatar/${hash}?s=256&d=identicon`,
    firstName,
    lastName,
    displayName: display,
    email,
    bio: '',
    location: '',
    company: '',
    notes: ['Gravatar photo resolved from the email. Confirm the name before creating the person.'],
    remoteFetched: false,
  };
}

function titleFromUsername(value: string | null): string {
  if (!value) return '';
  return value
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function splitName(display: string): [string, string] {
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ['', ''];
  if (parts.length === 1) return [parts[0]!, ''];
  return [parts[0]!, parts.slice(1).join(' ')];
}

export async function fetchGithubLanguages(username: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=8`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'OmniOchart/0.1',
        },
      },
    );
    if (!response.ok) return [];
    const repos = (await response.json()) as Array<{ language?: string | null }>;
    return [...new Set(repos.map((repo) => repo.language).filter((value): value is string => Boolean(value)))];
  } catch {
    return [];
  }
}
