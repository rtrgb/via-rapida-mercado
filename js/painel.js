// painel da loja (RF11 a RF14, RF20, RNF06)
(async function () {
  const $ = (id) => document.getElementById(id);
  if (!(await VR_AUTH.exigirLogin())) return;
  const db = VR.db, toast = VR_AUTH.toast;
  let produto = null, fornada = null, balcao = 0, vendendo = false;

  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = !m; };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const chips = () => document.querySelectorAll('#vendas button');
  const travarChips = () => chips().forEach((b) => (b.disabled = vendendo || !fornada || +b.dataset.n > balcao));

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
    $('fornada-titulo').textContent = fornada ? 'Fornada das ' + hhmm(fornada.criada_em) : 'Nenhuma fornada ainda';
    $('corrigir').hidden = !fornada;
    $('feitos').textContent = feitos;
    $('vendidos').textContent = vendidos;
    $('reservados').textContent = reservados;
    $('balcao').textContent = balcao;
    if (produto.proxima_fornada && document.activeElement !== $('hora')) $('hora').value = produto.proxima_fornada.slice(0, 5);
    travarChips();

    const acabando = tem && balcao > 0 && balcao <= produto.limite_alerta; // RF20, RN09
    $('alerta').hidden = !acabando;
    $('alerta').textContent = balcao === 1 ? 'Acabando: resta 1 pão no balcão.' : `Acabando: restam ${balcao} pães no balcão.`;
  }

  // aviso por e-mail aos inscritos (RF07); o servidor libera 1 envio por vez que o pão fica disponível
  async function avisar() {
    const { data, error } = await db.functions.invoke('avisar');
    if (error) return ' O aviso por e-mail falhou.';
    if (data && data.motivo === 'ja_avisado') {
      const p = await db.from('produto').select('avisado_em').eq('id', 1).single();
      const h = p.data && p.data.avisado_em;
      return h ? ` Os inscritos já foram avisados às ${hhmm(h)}; o e-mail não foi enviado de novo.` : ' O e-mail não foi enviado.';
    }
    const n = (data && data.enviados) || 0;
    if (!n && data && data.inscritos === 0) return ' Ninguém inscrito no aviso por e-mail.';
    return n ? ` Aviso enviado a ${n} ${n === 1 ? 'inscrito' : 'inscritos'}.` : '';
  }

  async function situacao(nova) {
    if (nova === 'tem' && balcao <= 0) return toast('Não há pães no balcão. Registre uma nova fornada.');
    const { error } = await db.from('produto').update({ situacao: nova, atualizado_em: new Date().toISOString() }).eq('id', 1);
    if (error) return toast(VR.msg(error));
    carregar();
    toast(nova === 'tem' ? 'Marcado como "tem pão".' + (await avisar()) : 'Marcado como "acabou".');
  }
  $('ton').onclick = () => situacao('tem');
  $('toff').onclick = () => situacao('acabou');

  // venda: trava os botões até salvar (evita toque duplo) e oferece desfazer
  chips().forEach((b) => (b.onclick = async () => {
    if (vendendo) return;
    const n = +b.dataset.n;
    vendendo = true; travarChips();
    const { data, error } = await db.from('venda').insert({ fornada_id: fornada.id, quantidade: n }).select('id').single();
    vendendo = false;
    if (error) { toast(VR.msg(error)); return carregar(); }
    toast(`Venda de ${n} registrada.`, { texto: 'Desfazer', fn: () => desfazerVenda(data.id, n) });
    carregar();
  }));

  async function desfazerVenda(id, n) {
    const { error } = await db.from('venda').delete().eq('id', id);
    if (error) return toast(VR.msg(error));
    toast(`Venda de ${n} desfeita.`);
    carregar();
  }

  $('f-fornada').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = parseInt($('qtd').value, 10);
    if (!(q > 0)) return toast('Informe a quantidade da fornada.');
    $('pronta').disabled = true;
    const { error } = await db.from('fornada').insert({ produto_id: 1, quantidade: q });
    $('pronta').disabled = false;
    if (error) return toast(VR.msg(error));
    carregar();
    toast(`Fornada de ${q} pronta.` + (await avisar()));
  });

  // corrigir quantidade digitada errada; o banco não deixa ficar menor do que já saiu
  $('corrigir').onclick = async () => {
    if (!fornada) return;
    const r = prompt(`Quantidade certa da fornada das ${hhmm(fornada.criada_em)}:`, fornada.quantidade);
    if (r === null) return;
    const q = parseInt(r, 10);
    if (!(q > 0 && q <= 999)) return toast('Informe um número de 1 a 999.');
    if (q === fornada.quantidade) return;
    const { error } = await db.from('fornada').update({ quantidade: q }).eq('id', fornada.id);
    if (error) return toast(VR.msg(error));
    toast(`Fornada corrigida para ${q}.`);
    carregar();
  };

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
