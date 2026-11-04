// Página "Tem pão?": lê a situação no banco e se atualiza sozinha (RF02, RF03, RF04, RNF04, RN11).
(function () {
  const $ = (id) => document.getElementById(id);
  const cfg = window.VR_CONFIG || {};

  function mostrarErro(msg) { const e = $('erro'); e.textContent = msg; e.hidden = false; }

  if (!window.supabase || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.startsWith('COLE_')) {
    mostrarErro('Sistema não configurado: preencha js/config.js com a URL e a chave do Supabase.');
    $('pill').textContent = 'Indisponível';
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const horaFornada = (t) => (t ? t.slice(0, 5) : '–');

  function render(d) {
    const tem = d.situacao === 'tem';
    $('produto').textContent = d.produto;
    $('pill').className = 'pill ' + (tem ? 'tem' : 'acabou');
    $('pill').textContent = tem ? 'Tem pão agora' : 'Acabou';
    $('balcao').textContent = d.no_balcao;
    $('proxima').textContent = horaFornada(d.proxima_fornada);
    $('atualizado').textContent = 'Atualizado às ' + hora(d.atualizado_em);
    $('desatualizado').hidden = !d.desatualizado;
    $('erro').hidden = true;
  }

  async function carregar() {
    const { data, error } = await db.rpc('disponibilidade');
    if (error || !data || !data.length) {
      mostrarErro('Não foi possível carregar a situação agora. Tente de novo em instantes.');
      return;
    }
    render(data[0]);
  }

  carregar();
  // Tempo real: qualquer mudança no produto (fornada, venda, reserva) recarrega a página.
  db.channel('produto')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'produto' }, carregar)
    .subscribe();
  // Rede de segurança: recarrega a cada minuto (expiração de reservas e aviso de desatualizado).
  setInterval(carregar, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
})();
