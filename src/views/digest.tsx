import type { DigestNight, DigestRow } from '../digest/types.js';

const dash = (value: string | null) => value ?? '—';

function Row({ row }: { row: DigestRow }) {
  return (
    <tr>
      <td>{row.job}</td>
      <td class={row.owner === null ? 'mute' : undefined}>{dash(row.owner)}</td>
      <td>{row.runs}</td>
      <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
      <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
      <td>{dash(row.lastError)}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  const { counts } = digest;
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="mute">ok {counts.ok} · retry {counts.retry} · fail {counts.fail}</p>
      {digest.badLines > 0 && <p class="warn">{digest.badLines} unreadable line(s) skipped</p>}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th><th>owner</th><th>runs</th><th>retries</th>
              <th>last status</th><th>last error</th><th>first</th><th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => <Row row={row} />)}
          </tbody>
        </table>
      )}
    </>
  );
}
