// Cloudflare Pages Function: receives the intake form and saves it to Supabase.
// Lives at /functions/api/intake.js and answers at https://yourdomain/api/intake
//
// Settings > Variables and Secrets (in your Cloudflare Pages project):
//   SUPABASE_URL                 e.g. https://toefrwabzsvqfujvjavz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    secret key. Add it as type "Secret". Never put it in a web page.
//   RESEND_API_KEY               OPTIONAL. Only if you want an email alert per submission.
//   NOTIFY_EMAIL                 OPTIONAL. e.g. support@viregenix.com
//   NOTIFY_FROM                  OPTIONAL. e.g. "Viregenix Intake <intake@yourdomain.com>"

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid request' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Invalid request' }, 400);

  // Spam trap: the hidden "website" field must stay empty.
  // Pretend success so bots learn nothing.
  if (body.website) return json({ ok: true });

  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return json({ error: 'Invalid form data' }, 400);
  }

  // Keep only short text values, cap field count and length.
  const clean = {};
  for (const [k, v] of Object.entries(data).slice(0, 400)) {
    clean[String(k).slice(0, 120)] = String(v ?? '').slice(0, 2000);
  }

  const email = (clean['Email'] || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'A valid email is required' }, 400);
  }

  const row = {
    full_name: (clean['Full Name'] || '').trim(),
    email: email,
    location: (clean['Your Location'] || '').trim(),
    data: clean,
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server not configured' }, 500);
  }

  try {
    const r = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/intake_submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error('Supabase insert failed', r.status, await r.text());
      return json({ error: 'Could not save submission' }, 500);
    }
  } catch (e) {
    console.error('Supabase request error', e);
    return json({ error: 'Could not save submission' }, 500);
  }

  // Optional email alert. A failure here never affects the client's submission.
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.NOTIFY_FROM || 'Viregenix Intake <onboarding@resend.dev>',
          to: [env.NOTIFY_EMAIL],
          subject: 'New intake form: ' + (row.full_name || row.email),
          text: 'New intake submission from ' + row.full_name + ' (' + row.email + '), ' + row.location + '.\nOpen your admin dashboard to read it.',
        }),
      });
    } catch (e) {
      console.error('Resend error', e);
    }
  }

  return json({ ok: true });
}

// Anything other than POST is refused.
export async function onRequest() {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
