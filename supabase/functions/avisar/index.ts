// envia o aviso "tem pão" por e-mail aos inscritos (RF07), pelo Brevo
// chamada pelo painel quando sai fornada ou a loja marca "tem pão"
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const SITE = (Deno.env.get('SITE_URL') ?? 'https://rtrgb.github.io/via-rapida-mercado').replace(/\/$/, '');

function email(nome: string, balcao: number, token: string) {
  const cancelar = `${SITE}/cancelar.html?t=${token}`;
  const qtd = balcao > 0 ? `<p style="margin:0 0 16px">No balcão agora: <b>${balcao} pães</b>.</p>` : '';
  return {
    cancelar,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#101828;max-width:480px">
<p style="margin:0 0 16px">Olá, ${esc(nome)}.</p>
<p style="margin:0 0 8px">Saiu pão francês agora na <b>Via Rápida Mercado</b>.</p>
${qtd}
<p style="margin:0 0 24px"><a href="${SITE}/" style="background:#1D4ED8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Ver se ainda tem</a></p>
<p style="margin:0 0 4px;color:#667085;font-size:13px">Rua 1400, 429, Balneário Camboriú (em frente à Paróquia Santa Inês)</p>
<p style="margin:0;color:#667085;font-size:13px">Não quer mais receber? <a href="${cancelar}" style="color:#667085">Cancelar avisos</a>.</p>
</div>`,
    text: `Olá, ${nome}.\nSaiu pão francês agora na Via Rápida Mercado.${balcao > 0 ? `\nNo balcão agora: ${balcao} pães.` : ''}\nVer se ainda tem: ${SITE}/\n\nRua 1400, 429, Balneário Camboriú\nCancelar avisos: ${cancelar}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const KEY = Deno.env.get('BREVO_API_KEY');
    const REMETENTE = Deno.env.get('BREVO_SENDER_EMAIL');
    if (!KEY || !REMETENTE) return json({ erro: 'Faltam os secrets BREVO_API_KEY e BREVO_SENDER_EMAIL.' }, 500);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // só a loja logada dispara o envio
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u?.user) return json({ erro: 'Faça login.' }, 401);

    // trava: 1 envio por vez que o pão fica disponível
    const { data: liberado, error: e1 } = await admin.rpc('reivindicar_aviso', { p_produto: 1 });
    if (e1) throw e1;
    if (!liberado) return json({ enviados: 0, motivo: 'ja_avisado' });

    const [disp, insc] = await Promise.all([
      admin.rpc('disponibilidade', { p_produto: 1 }),
      admin.from('inscrito').select('nome, email, token').eq('produto_id', 1),
    ]);
    if (insc.error) throw insc.error;
    const balcao = disp.data?.[0]?.no_balcao ?? 0;
    const lista = insc.data ?? [];

    let enviados = 0;
    const falhas: string[] = [];
    for (let i = 0; i < lista.length; i += 10) {
      await Promise.all(lista.slice(i, i + 10).map(async (p) => {
        const m = email(p.nome, balcao, p.token);
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': KEY, 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender: { name: 'Via Rápida Mercado', email: REMETENTE },
            to: [{ email: p.email, name: p.nome }],
            subject: 'Saiu pão francês na Via Rápida Mercado',
            htmlContent: m.html,
            textContent: m.text,
            headers: { 'List-Unsubscribe': `<${m.cancelar}>` },
          }),
        });
        if (r.ok) enviados++;
        else falhas.push(`${r.status} ${(await r.text()).slice(0, 200)}`);
      }));
    }

    // se nada saiu (chave errada, por exemplo), libera para tentar de novo
    if (lista.length && !enviados) await admin.from('produto').update({ avisado_em: null }).eq('id', 1);

    return json({ enviados, inscritos: lista.length, falhas: falhas.slice(0, 3) }, lista.length && !enviados ? 502 : 200);
  } catch (e) {
    return json({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
