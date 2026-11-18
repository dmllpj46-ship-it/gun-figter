/**
 * Cloudflare Pages Function — TypeSafe proxy.
 * Keeps TYPESAFE_API_KEY server-side; the browser only ever talks to /api/jev.
 */
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequestPost({ request, env }) {
  const key = env.TYPESAFE_API_KEY;
  if (!key) return json(503, { ok: false, error: 'no_api_key' });

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { ok: false, error: 'bad_json' });
  }

  // Guard against someone using this endpoint as a free LLM relay.
  const questions = payload && payload.questions;
  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    return json(400, { ok: false, error: 'bad_payload' });
  }
  if (Object.keys(questions).length > 24) {
    return json(400, { ok: false, error: 'too_many_questions' });
  }

  const started = Date.now();
  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'User-Agent': 'duel-arena/1.0',
      },
      body: JSON.stringify({
        model: payload.model || 'jev-latest',
        state: payload.state,
        questions,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(502, { ok: false, error: 'bad_upstream_json', detail: text.slice(0, 300) });
    }
    if (!upstream.ok) return json(upstream.status, { ok: false, error: 'upstream_error', detail: data });
    return json(200, { ok: true, data, latencyMs: Date.now() - started });
  } catch (err) {
    return json(504, { ok: false, error: 'upstream_timeout', detail: String((err && err.message) || err) });
  }
}

export async function onRequestGet() {
  return json(200, { ok: true, service: 'duel-arena jev proxy' });
}
