import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Content-Type': 'application/json' };
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    if (req.method !== 'POST') throw new Error('POST required');
    const body = await req.json();
    let staff = null;
    if (String(body.action).startsWith('staff')) {
      const { data, error } = await admin.auth.getUser((req.headers.get('Authorization') || '').replace(/^Bearer /, ''));
      if (error || !data.user) throw new Error('スタッフログインが必要です');
      staff = data.user.id;
    }
    // The hosting gateway must overwrite x-forwarded-for. Never accept an IP from JSON.
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (!ip && body.action === 'activate') throw new Error('IPを確認できません');
    const { data, error } = await admin.rpc('warmup_api', { p: body, actor: staff, ip });
    if (error) throw error;
    if (data?.profile && body.compact === true) {
      const encoded = new TextEncoder().encode(JSON.stringify(data.profile));
      const hash = await crypto.subtle.digest('SHA-256', encoded);
      const revision = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      if (body.profileRevision === revision) delete data.profile;
      data.profileRevision = revision;
    }
    if (body.action === 'staff-status') {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
      const revision = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      if (body.revision === revision) return new Response(JSON.stringify({ unchanged: true, revision }), { headers });
      data.revision = revision;
    }
    return new Response(JSON.stringify(data), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || '通信エラー' }), { status: 400, headers });
  }
});
