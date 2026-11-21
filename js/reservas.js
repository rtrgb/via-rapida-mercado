// reservas do dia (RF15)
(async function () {
  const $ = (id) => document.getElementById(id);
  if (!(await VR_AUTH.exigirLogin())) return;
  const db = VR.db, toast = VR_AUTH.toast;
  const NOMES = { aguardando: 'Aguardando', retirada: 'Retirada', nao_retirada: 'Não veio', cancelada: 'Cancelada', expirada: 'Expirada' };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let linhas = [];

  async function carregar() {
    await db.rpc('disponibilidade'); // expira reservas vencidas (RN07)
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    // as de hoje + as que ainda aguardam (ex.: feita ontem à noite para a próxima fornada)
    const { data, error } = await db.from('reserva')
      .select('id, codigo, nome, contato, quantidade, status, fornada_id, criada_em')
      .or(`status.eq.aguardando,criada_em.gte.${inicio.toISOString()}`)
      .order('criada_em', { ascending: false });
    if (error) { $('erro').textContent = VR.msg(error); $('erro').hidden = false; return; }
    $('erro').hidden = true;
    linhas = data;
    const aguardando = data.filter((r) => r.status === 'aguardando');
    $('resumo').textContent = `${aguardando.length} aguardando · ${aguardando.reduce((s, r) => s + r.quantidade, 0)} pães`;
    $('lista').innerHTML = data.length ? data.map((r) => `<tr>
      <td class="num c-cod">${esc(r.codigo)}</td><td class="c-nome">${esc(r.nome)}</td><td class="c-cont">${esc(r.contato)}</td>
      <td class="num c-qtd">${r.quantidade} ${r.quantidade === 1 ? 'pão' : 'pães'}</td>
      <td class="c-st"><span class="tag ${r.status}">${NOMES[r.status]}${r.status === 'aguardando' && !r.fornada_id ? ' · próxima' : ''}</span></td>
      <td class="c-acts">${r.status === 'aguardando' ? `<div class="acts">
        <button data-id="${r.id}" data-st="retirada">Retirada</button>
        <button data-id="${r.id}" data-st="nao_retirada">Não veio</button>
        <button data-id="${r.id}" data-st="cancelada">Cancelar</button></div>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="vazio">Nenhuma reserva hoje.</td></tr>';
    document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => mudar(+b.dataset.id, b.dataset.st, b)));
  }

  async function mudar(id, status, botao) {
    const r = linhas.find((x) => x.id === id);
    // "não veio" e "cancelar" liberam os pães: pede confirmação
    if (status !== 'retirada' && !confirm(`${status === 'cancelada' ? 'Cancelar' : 'Marcar "não veio" na'} reserva ${r.codigo} de ${r.nome}?`)) return;
    botao.closest('.acts').querySelectorAll('button').forEach((b) => (b.disabled = true));
    const { error } = await db.from('reserva').update({ status, atualizada_em: new Date().toISOString() }).eq('id', id);
    if (error) { toast(VR.msg(error)); return carregar(); }
    if (status === 'retirada') toast(`Reserva ${r.codigo} retirada.`, { texto: 'Desfazer', fn: () => voltar(id) });
    else toast('Reserva atualizada.');
    carregar();
  }

  async function voltar(id) {
    const { error } = await db.from('reserva').update({ status: 'aguardando', atualizada_em: new Date().toISOString() })
      .eq('id', id).eq('status', 'retirada');
    if (error) return toast(VR.msg(error));
    toast('Reserva voltou para "aguardando".');
    carregar();
  }

  carregar();
  db.channel('reservas').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produto' }, carregar).subscribe();
  setInterval(carregar, 60000);
})();
