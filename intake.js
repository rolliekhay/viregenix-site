// Vercel serverless function: receives the intake form and saves it to Supabase.
// Environment variables (set in Vercel > Settings > Environment Variables):
//   SUPABASE_URL                 e.g. https://abcdxyz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    secret key. Server only, never put in a web page.
//   RESEND_API_KEY               OPTIONAL. Only if you also want an email alert per submission.
//   NOTIFY_EMAIL                 OPTIONAL. Where the alert goes, e.g. support@viregenix.com
//   NOTIFY_FROM                  OPTIONAL. e.g. "Viregenix Intake <intake@yourdomain.com>" (domain verified in Resend)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // Spam trap: the hidden "website" field must stay empty.
  // Pretend success so bots learn nothing.
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid form data' });
  }

  // Keep only short text values, cap field count and length.
  const clean = {};
  const entries = Object.entries(data).slice(0, 400);
  for (const [k, v] of entries) {
    clean[String(k).slice(0, 120)] = String(v ?? '').slice(0, 2000);
  }

  const email = (clean['Email'] || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  const row = {
    full_name: (clean['Full Name'] || '').trim(),
    email: email,
    location: (clean['Your Location'] || '').trim(),
    data: clean,
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/intake_submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: 'Bearer ' + key,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error('Supabase insert failed', r.status, await r.text());
      return res.status(500).json({ error: 'Could not save submission' });
    }
  } catch (e) {
    console.error('Supabase request error', e);
    return res.status(500).json({ error: 'Could not save submission' });
  }

  // Optional email alert. A failure here never affects the client's submission.
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.NOTIFY_FROM || 'Viregenix Intake <onboarding@resend.dev>',
          to: [process.env.NOTIFY_EMAIL],
          subject: 'New intake form: ' + (row.full_name || row.email),
          text: 'New intake submission from ' + row.full_name + ' (' + row.email + '), ' + row.location + '.\nOpen your admin dashboard to read it.',
        }),
      });
    } catch (e) {
      console.error('Resend error', e);
    }
  }

  return res.status(200).json({ ok: true });
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}
