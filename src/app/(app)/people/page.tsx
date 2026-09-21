'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { initials } from '@/lib/utils';

interface Group {
  id: string;
  name: string;
}

interface PersonRow {
  id: string;
  displayName: string;
  email: string | null;
  profilePhotoUrl: string | null;
  profileLinkUrl: string | null;
  assignments: Array<{
    position: {
      id: string;
      title: string;
      department: { name: string } | null;
      location: { name: string } | null;
    };
  }>;
  groupMemberships: Array<{ group: { id: string; name: string } }>;
  skills: Array<{ skill: { id: string; name: string }; source: string }>;
}

interface ProfileDraft {
  provider: string;
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
}

export default function PeoplePage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [title, setTitle] = useState('');
  const [applyPhoto, setApplyPhoto] = useState(true);
  const [applyName, setApplyName] = useState(true);
  const [applyBio, setApplyBio] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const { data } = useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const response = await fetch('/api/v1/people?take=250');
      if (!response.ok) throw new Error('Failed to load people');
      return (await response.json()) as { total: number; people: PersonRow[] };
    },
  });

  const { data: groupData } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await fetch('/api/v1/groups');
      if (!response.ok) throw new Error('Failed to load groups');
      return (await response.json()) as { groups: Group[] };
    },
  });

  const preview = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/people/profile-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not read that profile link');
      return payload.draft as ProfileDraft;
    },
    onSuccess: (next) => {
      setDraft(next);
      setApplyPhoto(Boolean(next.photoUrl));
      setTitle(next.company ? `${next.displayName}`.trim() : '');
      toast.success('Review the fields, then create the person.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('Preview a profile first');
      const response = await fetch('/api/v1/people', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: applyName ? draft.firstName || 'New' : 'New',
          lastName: applyName ? draft.lastName || 'Person' : 'Person',
          displayName: applyName ? draft.displayName : undefined,
          email: draft.email || null,
          bio: applyBio ? draft.bio : null,
          profilePhotoUrl: applyPhoto ? draft.photoUrl : null,
          profileLinkUrl: draft.profileUrl,
          profileLinkUsername: draft.username,
          profileLinkProvider: draft.provider,
          title: title.trim() || undefined,
          groupIds: selectedGroups,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message ?? 'Could not create person');
      return payload;
    },
    onSuccess: () => {
      toast.success('Person added to the organisation');
      setDraft(null);
      setInput('');
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['chart-graph'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {data?.total ?? '—'} people. Link a GitHub username, Gravatar email, photo URL, or LinkedIn URL. LinkedIn is stored, not scraped.
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="font-semibold">Add from a profile link</h2>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-[18rem] flex-1"
            placeholder="github.com/username, email, or https://…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <Button onClick={() => preview.mutate()} disabled={preview.isPending || input.trim().length < 2}>
            {preview.isPending ? 'Reading…' : 'Preview'}
          </Button>
        </div>
        {draft ? (
          <div className="grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-[8rem_1fr]">
            <div className="flex flex-col items-center gap-2">
              {draft.photoUrl && applyPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-lg font-semibold text-ink-invert">
                  {initials(draft.displayName || 'New Person')}
                </div>
              )}
              <Badge tone="sea">{draft.provider}</Badge>
            </div>
            <div className="space-y-3">
              {draft.notes.map((note) => (
                <p key={note} className="text-sm text-[var(--muted-foreground)]">
                  {note}
                </p>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyPhoto} onChange={(event) => setApplyPhoto(event.target.checked)} />
                Use photo
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyName} onChange={(event) => setApplyName(event.target.checked)} />
                Use name from the link
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>First name</Label>
                  <Input
                    value={draft.firstName}
                    onChange={(event) => setDraft({ ...draft, firstName: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Last name</Label>
                  <Input
                    value={draft.lastName}
                    onChange={(event) => setDraft({ ...draft, lastName: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
                </div>
                <div>
                  <Label>Job title (creates a seat)</Label>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={applyBio} onChange={(event) => setApplyBio(event.target.checked)} />
                Keep bio
              </label>
              {applyBio ? (
                <textarea
                  className="min-h-20 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  value={draft.bio}
                  onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                />
              ) : null}
              <div>
                <Label>Company groups</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(groupData?.groups ?? []).map((group) => {
                    const on = selectedGroups.includes(group.id);
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className="rounded-full"
                        onClick={() =>
                          setSelectedGroups((current) =>
                            on ? current.filter((id) => id !== group.id) : [...current, group.id],
                          )
                        }
                      >
                        <Badge tone={on ? 'gold' : 'default'}>{group.name}</Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create person'}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--muted)] text-xs tracking-wide uppercase">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Groups</th>
              <th className="px-4 py-2">Skills</th>
              <th className="px-4 py-2">Email</th>
            </tr>
          </thead>
          <tbody>
            {(data?.people ?? []).map((person) => {
              const assignment = person.assignments[0];
              return (
                <tr key={person.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {person.profilePhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.profilePhotoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-ink-invert">
                          {initials(person.displayName)}
                        </span>
                      )}
                      {assignment ? (
                        <Link className="font-medium underline" href={`/charts?focus=${assignment.position.id}`}>
                          {person.displayName}
                        </Link>
                      ) : (
                        <span className="font-medium">{person.displayName}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">{assignment?.position.title ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {person.groupMemberships.map((membership) => (
                        <Badge key={membership.group.id}>{membership.group.name}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {person.skills.map((row) => (
                        <Badge key={row.skill.id} tone="sea">
                          {row.skill.name}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2">{person.email}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
