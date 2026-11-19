// painel da loja (RF11 a RF14, RF20, RNF06)
(async function () {
  const $ = (id) => document.getElementById(id);
  if (!(await VR_AUTH.exigirLogin())) return;
  const db = VR.db, toast = VR_AUTH.toast;
  let produto = null, fornada = null, balcao = 0;

  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = !m; };

  async function carregar() {
    await db.rpc('disponibilidade'); // também expira reservas vencidas (RN07)
    const p = await db.from('produto').select('*').eq('id', 1).single();
    if (p.error) return erro(VR.msg(p.error));
    produto = p.data;

    const f = await db.from('fornada').select('id, quantidade, criada_em')
      .eq('produto_id', 1).order('criada_em', { ascending: false }).limit(1);
    fornada = f.data && f.data[0];

    let vendidos = 0, reservados = 0;
    if (fornada) {
      const v = await db.from('venda').select('quantidade').eq('fornada_id', fornada.id);
      const r = await db.from('reserva').select('quantidade').eq('fornada_id', fornada.id).in('status', ['aguardando', 'retirada']);
      vendidos = (v.data || []).reduce((s, x) => s + x.quantidade, 0);
      reservados = (r.data || []).reduce((s, x) => s + x.quantidade, 0);
    }
    const feitos = fornada ? fornada.quantidade : 0;
    balcao = Math.max(0, feitos - vendidos - reservados);
    const tem = produto.situacao === 'tem';

    erro('');
    $('produto').textContent = produto.nome;
    $('ton').setAttribute('aria-pressed', tem);
    $('toff').setAttribute('aria-pressed', !tem);
    $('fornada-titulo').textContent = fornada
      ? 'Fornada das ' + new Date(fornada.criada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : 'Nenhuma fornada ainda';
    $('feitos').textContent = feitos;
    $('vendidos').textContent = vendidos;
    $('reservados').textContent = reservados;
    $('balcao').textContent = balcao;
    if (produto.proxima_fornada && document.activeElement !== $('hora')) $('hora').value = produto.proxima_fornada.slice(0, 5);
    document.querySelectorAll('#vendas button').forEach((b) => (b.disabled = !fornada || +b.dataset.n > balcao));

    const acabando = tem && balcao > 0 && balcao <= produto.limite_alerta; // RF20, RN09
    $('alerta').hidden = !acabando;
    $('alerta').textContent = balcao === 1 ? 'Acabando: resta 1 pão no balcão.' : `Acabando: restam ${balcao} pães no balcão.`;
  }

  async function situacao(nova) {
    if (nova === 'tem' && balcao <= 0) return toast('Não há pães no balcão. Registre uma nova fornada.');
    const { error } = await db.from('produto').update({ situacao: nova, atualizado_em: new Date().toISOString() }).eq('id', 1);
    if (error) return toast(VR.msg(error));
    toast(nova === 'tem' ? 'Marcado como "tem pão".' : 'Marcado como "acabou".');
    carregar();
  }
  $('ton').onclick = () => situacao('tem');
  $('toff').onclick = () => situacao('acabou');

  document.querySelectorAll('#vendas button').forEach((b) => (b.onclick = async () => {
    const n = +b.dataset.n;
    const { error } = await db.from('venda').insert({ fornada_id: fornada.id, quantidade: n });
    if (error) return toast(VR.msg(error));
    toast(`Venda de ${n} registrada.`);
    carregar();
  }));

  $('f-fornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = parseInt($('qtd').value, 10);
    if (!(q > 0)) return toast('Informe a quantidade da fornada.');
    const { error } = await db.from('fornada').insert({ produto_id: 1, quantidade: q });
    if (error) return toast(VR.msg(error));
    toast(`Fornada de ${q} pronta.`);
    carregar();
  });

  $('f-proxima').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await db.from('produto').update({ proxima_fornada: $('hora').value || null }).eq('id', 1);
    if (error) return toast(VR.msg(error));
    toast('Horário da próxima fornada salvo.');
    carregar();
  });

  carregar();
  db.channel('painel').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produto' }, carregar).subscribe();
  setInterval(carregar, 60000);
})();
