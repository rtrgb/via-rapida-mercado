// cliente do supabase compartilhado pelas páginas
(function () {
  const cfg = window.VR_CONFIG || {};
  const REDE = 'Não foi possível conectar agora. Tente de novo em instantes.';
  const SESSAO = 'Sua sessão expirou. Entre de novo.';

  window.VR = {
    db: (window.supabase && cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith('COLE_'))
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null,
    // as funções do banco já respondem em português (raise exception = P0001);
    // o resto (postgres, supabase, navegador) vem em inglês e é traduzido aqui
    msg(error) {
      if (!error) return REDE;
      const c = String(error.code || ''), m = String(error.message || '');
      if (c === 'P0001' && m) return m;
      if (/failed to fetch|load failed|network|networkerror/i.test(m)) return REDE;
      if (c === '42501' || c === 'PGRST301' || c === 'PGRST303' || error.status === 401 || /jwt|session|not authenticated/i.test(m)) return SESSAO;
      if (c === '23505') return 'Esse registro já existe.';
      if (c === '23503') return 'Este item está ligado a outro registro e não pode ser apagado.';
      if (c === '23502') return 'Preencha todos os campos.';
      if (['23514', '22P02', '22003', '22007', '22008'].includes(c)) return 'Algum valor não é válido. Confira e tente de novo.';
      if (error.status === 429 || /rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
      return 'Algo deu errado. Tente de novo em instantes.';
    },
  };
})();
