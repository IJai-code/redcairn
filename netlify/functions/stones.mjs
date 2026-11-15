// REDCAIRN — the shared cairn. Every visitor who reaches the turnaround can add one stone;
// the count is the same for everyone, so the cairn grows with each person who walks the map.
// GET  /api/stones  -> { count, last }
// POST /api/stones  -> { count, last, yours }   (yours: your stone's number, or null if you already added one today)
import { getStore } from '@netlify/blobs';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async (req, context) => {
  const store = getStore({ name: 'cairn', consistency: 'strong' });
  const read = async () => (await store.get('count', { type: 'json' })) || { count: 0, last: null };
  if (req.method === 'GET') return json(await read());
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  // One stone per visitor per day. Only a short hash of the address is kept, never the address itself.
  const day = new Date().toISOString().slice(0, 10);
  const key = `v/${day}/${await sha(`${context.ip || 'unknown'}|${day}|redcairn`)}`;
  const seen = await store.get(key);
  const now = await read();
  if (seen) return json({ ...now, yours: null, already: Number(seen) || null });
  const next = { count: now.count + 1, last: new Date().toISOString() };
  await store.setJSON('count', next);
  await store.set(key, String(next.count));
  return json({ ...next, yours: next.count });
};

export const config = { path: '/api/stones' };
