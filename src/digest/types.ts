export type DigestStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type DigestNight = {
  rows: DigestRow[];
  badLines: number;
  // Counts valid log events, not aggregated jobs.
  counts: Record<DigestStatus, number>;
};

// Null means a missing night; other I/O errors propagate.
export type ReadNight = (
  runsDir: string,
  night: string,
) => DigestNight | null;
