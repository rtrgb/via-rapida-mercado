// cliente consulta, muda a quantidade ou cancela a própria reserva (RF08, RN06, RN07)
(function () {
  const $ = (id) => document.getElementById(id);
  const NOMES = { aguardando: 'Aguardando retirada', retirada: 'Retirada', nao_retirada: 'Não retirada', cancelada: 'Cancelada', expirada: 'Expirada' };
  const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ddmm = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const pl = (n) => (n === 1 ? '1 pão' : `${n} pães`);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let contato = ''; // contato da última busca que deu certo

  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = false; $('ok').hidden = true; };
  const ok = (m) => { $('ok').textContent = m; $('ok').hidden = false; $('erro').hidden = true; };

  async function buscar(c) {
    if (c.length < 3) return erro('Informe o e-mail ou telefone usado na reserva.');
    if (!VR.db) return erro(VR.msg());
    $('buscar').disabled = true;
    const { data, error } = await VR.db.rpc('minhas_reservas', { p_contato: c });
    $('buscar').disabled = false;
    if (error) return erro(VR.msg(error));
    contato = c;
    try { localStorage.setItem('vr_contato', c); } catch (_) { /* sem armazenamento: tudo bem */ }
    $('lista').innerHTML = data.length ? data.map(cartao).join('')
      : '<p class="vazio" style="padding:0">Nenhuma reserva encontrada para este contato.</p>';
    return true;
  }

  function cartao(r) {
    const ativa = r.status === 'aguardando';
    const prazo = r.prazo ? `Até ${hhmm(r.prazo)}` : 'Até 60 min após a fornada sair';
    return `<article class="res" data-codigo="${esc(r.codigo)}" data-q="${r.quantidade}">
      <div class="res-top"><b>${esc(r.codigo)}</b><span class="tag ${r.status}">${NOMES[r.status]}</span></div>
      <div class="list">
        <div><span>Quantidade</span><span>${pl(r.quantidade)}</span></div>
        <div><span>Fornada</span><span>${r.proxima ? 'Próxima' : 'Já saiu'}</span></div>
        ${ativa ? `<div><span>Retirar</span><span>${prazo}</span></div>` : ''}
        <div><span>Feita em</span><span>${ddmm(r.criada_em)} às ${hhmm(r.criada_em)}</span></div>
      </div>
      ${ativa ? `<div class="res-acts">
        <div class="stepper"><button type="button" data-a="menos" aria-label="Diminuir">−</button><output>${r.quantidade}</output><button type="button" data-a="mais" aria-label="Aumentar">+</button></div>
        <button type="button" class="btn btn-ghost btn-sm" data-a="salvar" disabled>Salvar</button>
        <button type="button" class="btn btn-ghost btn-sm cancelar" data-a="cancelar">Cancelar reserva</button>
      </div>` : ''}
    </article>`;
  }

  $('lista').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const card = b.closest('[data-codigo]'), cod = card.dataset.codigo, out = card.querySelector('output');
    let q = +out.textContent;

    if (b.dataset.a === 'menos' || b.dataset.a === 'mais') { // RN06: de 1 a 10
      q = Math.min(10, Math.max(1, q + (b.dataset.a === 'mais' ? 1 : -1)));
      out.textContent = q;
      card.querySelector('[data-a=salvar]').disabled = q === +card.dataset.q;
      return;
    }
    if (b.dataset.a === 'cancelar' && !confirm(`Cancelar a reserva ${cod}?`)) return;

    b.disabled = true;
    const { error } = b.dataset.a === 'salvar'
      ? await VR.db.rpc('alterar_reserva', { p_codigo: cod, p_contato: contato, p_quantidade: q })
      : await VR.db.rpc('cancelar_reserva', { p_codigo: cod, p_contato: contato });
    if (error) { b.disabled = false; return erro(VR.msg(error)); }
    if (await buscar(contato)) ok(b.dataset.a === 'salvar' ? `Reserva ${cod} alterada para ${pl(q)}.` : `Reserva ${cod} cancelada.`);
  });

  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    $('ok').hidden = true; $('erro').hidden = true;
    buscar($('contato').value.trim());
  });

  // quem acabou de reservar neste aparelho já vê a reserva
  let salvo = '';
  try { salvo = localStorage.getItem('vr_contato') || ''; } catch (_) { /* sem armazenamento */ }
  if (salvo) { $('contato').value = salvo; buscar(salvo); }
})();
