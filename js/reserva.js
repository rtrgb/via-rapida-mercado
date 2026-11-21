// reserva de pães (RF08, RF09, RN05, RN06, RN07)
(function () {
  const $ = (id) => document.getElementById(id);
  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = false; };
  let qtd = 4, proximaHora = null;

  $('menos').onclick = () => { qtd = Math.max(1, qtd - 1); $('qtd').textContent = qtd; };
  $('mais').onclick = () => { qtd = Math.min(10, qtd + 1); $('qtd').textContent = qtd; };

  async function carregar() {
    if (!VR.db) return erro(VR.msg());
    const { data, error } = await VR.db.rpc('disponibilidade');
    if (error || !data || !data.length) return erro(VR.msg(error));
    const d = data[0];
    proximaHora = d.proxima_fornada ? d.proxima_fornada.slice(0, 5) : null;
    const tem = d.situacao === 'tem' && d.no_balcao > 0;
    $('agora').disabled = !tem;
    $('agora-info').textContent = tem ? `${d.no_balcao} no balcão` : 'acabou';
    $('proxima-info').textContent = proximaHora ? `às ${proximaHora}` : 'horário a definir';
    (tem ? $('agora') : $('proxima')).checked = true;
  }

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('erro').hidden = true;
    const nome = $('nome').value.trim(), contato = $('contato').value.trim();
    const proxima = $('proxima').checked;
    if (!nome || contato.length < 3) return erro('Preencha nome e contato.');
    if (!VR.db) return erro(VR.msg());

    $('enviar').disabled = true;
    const { data, error } = await VR.db.rpc('criar_reserva', {
      p_nome: nome, p_contato: contato, p_quantidade: qtd, p_proxima: proxima,
    });
    $('enviar').disabled = false;
    if (error) { erro(VR.msg(error)); carregar(); return; }
    // banco novo devolve { codigo, prazo }; o antigo, só o código
    const r = Array.isArray(data) ? data[0] : { codigo: data, prazo: null };
    try { localStorage.setItem('vr_contato', contato); } catch (_) { /* sem armazenamento: tudo bem */ }

    $('ok-nome').textContent = `Reservado, ${nome.split(' ')[0]}`;
    $('ok-codigo').textContent = r.codigo;
    $('ok-qtd').textContent = `${qtd} ${qtd === 1 ? 'pão' : 'pães'}`;
    $('ok-fornada').textContent = proxima ? (proximaHora ? `Próxima, às ${proximaHora}` : 'Próxima') : 'Agora';
    // RN07: 60 min após a fornada
    $('ok-prazo').textContent = r.prazo
      ? 'Até ' + new Date(r.prazo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : 'Até 60 min após a fornada sair';
    $('form').hidden = true;
    $('ok').hidden = false;
  });

  carregar();
})();
