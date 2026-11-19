// reservas do dia (RF15)
(async function () {
  const $ = (id) => document.getElementById(id);
  if (!(await VR_AUTH.exigirLogin())) return;
  const db = VR.db, toast = VR_AUTH.toast;
  const NOMES = { aguardando: 'Aguardando', retirada: 'Retirada', nao_retirada: 'Não veio', cancelada: 'Cancelada', expirada: 'Expirada' };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function carregar() {
    await db.rpc('disponibilidade'); // expira reservas vencidas (RN07)
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
    const { data, error } = await db.from('reserva')
      .select('id, codigo, nome, contato, quantidade, status, fornada_id, criada_em')
      .gte('criada_em', inicio.toISOString()).order('criada_em', { ascending: false });
    if (error) { $('erro').textContent = VR.msg(error); $('erro').hidden = false; return; }
    $('erro').hidden = true;
    const aguardando = data.filter((r) => r.status === 'aguardando');
    $('resumo').textContent = `${aguardando.length} aguardando · ${aguardando.reduce((s, r) => s + r.quantidade, 0)} pães`;
    $('lista').innerHTML = data.length ? data.map((r) => `<tr>
      <td class="num">${esc(r.codigo)}</td><td>${esc(r.nome)}</td><td>${esc(r.contato)}</td>
      <td class="num">${r.quantidade}</td>
      <td><span class="tag ${r.status}">${NOMES[r.status]}${r.status === 'aguardando' && !r.fornada_id ? ' · próxima' : ''}</span></td>
      <td>${r.status === 'aguardando' ? `<div class="acts">
        <button data-id="${r.id}" data-st="retirada">Retirada</button>
        <button data-id="${r.id}" data-st="nao_retirada">Não veio</button>
        <button data-id="${r.id}" data-st="cancelada">Cancelar</button></div>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="vazio">Nenhuma reserva hoje.</td></tr>';
    document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => mudar(+b.dataset.id, b.dataset.st)));
  }

  async function mudar(id, status) {
    const { error } = await db.from('reserva').update({ status, atualizada_em: new Date().toISOString() }).eq('id', id);
    if (error) return toast(VR.msg(error));
    toast('Reserva atualizada.');
    carregar();
  }

  carregar();
  db.channel('reservas').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produto' }, carregar).subscribe();
  setInterval(carregar, 60000);
})();
