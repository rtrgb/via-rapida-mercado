// cliente do supabase compartilhado pelas páginas
(function () {
  const cfg = window.VR_CONFIG || {};
  window.VR = {
    db: (window.supabase && cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('COLE_'))
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null,
    // mensagens das funções do banco já vêm em português; erros de rede não
    msg: (error) => (error && error.message && !/fetch|network/i.test(error.message))
      ? error.message
      : 'Não foi possível conectar agora. Tente de novo em instantes.',
  };
})();
