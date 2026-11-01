import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus, ReadNight } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

type Event = {
  at: string;
  time: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function parseEvent(line: string): Event | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || job === '' || !isStatus(status)) return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;
  return { at, time, job, status, owner: owner ?? null, error: error ?? null };
}

function toRow(job: string, events: Event[]): DigestRow {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    job,
    owner: sorted.findLast((e) => e.owner !== null)?.owner ?? null,
    runs: sorted.length,
    retries: sorted.filter((e) => e.status === 'retry').length,
    lastStatus: last.status,
    lastError: sorted.findLast((e) => e.error !== null)?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  const byJob = new Map<string, Event[]>();
  const counts: DigestNight['counts'] = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const event = parseEvent(line);
    if (!event) {
      badLines++;
      continue;
    }
    counts[event.status]++;
    const events = byJob.get(event.job);
    if (events) events.push(event);
    else byJob.set(event.job, [event]);
  }

  const rows = [...byJob]
    .map(([job, events]) => toRow(job, events))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { rows, badLines, counts };
};
