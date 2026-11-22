// esqueci a senha da loja: pede o link por e-mail e cria a senha nova
(async function () {
  const $ = (id) => document.getElementById(id);
  // o link do e-mail volta com #...type=recovery (ou #error=... se expirou); lê antes do supabase limpar
  const hash = new URLSearchParams(location.hash.slice(1));
  const veioDoLink = hash.get('type') === 'recovery';
  const linkRuim = hash.get('error_code') || hash.get('error');

  const erro = (m) => { $('ok').hidden = true; $('erro').textContent = m; $('erro').hidden = false; };
  const ok = (m) => { $('erro').hidden = true; $('ok').textContent = m; $('ok').hidden = false; };
  if (!VR.db) return erro(VR.msg());

  const { data } = await VR.db.auth.getSession();
  if (veioDoLink && data.session) {
    $('pedir').hidden = true;
    $('trocar').hidden = false;
    $('senha').focus();
  } else if (linkRuim) {
    erro('Este link expirou ou já foi usado. Peça um novo abaixo.');
  }
  history.replaceState(null, '', location.pathname);

  $('pedir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return erro('Informe um e-mail válido.');
    $('enviar').disabled = true;
    const { error } = await VR.db.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('senha.html', location.href).href,
    });
    $('enviar').disabled = false;
    if (error) return erro(mensagem(error));
    // mesma resposta exista ou não a conta, para não revelar quais e-mails são da loja
    ok('Se este e-mail for da loja, o link chega em alguns minutos. Confira também o spam.');
  });

  $('trocar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = $('senha').value, s2 = $('senha2').value;
    if (s.length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
    if (s !== s2) return erro('As duas senhas não são iguais.');
    $('salvar').disabled = true;
    const { error } = await VR.db.auth.updateUser({ password: s });
    if (error) { $('salvar').disabled = false; return erro(mensagem(error)); }
    ok('Senha alterada. Abrindo o painel...');
    setTimeout(() => location.replace('painel.html'), 1200);
  });

  function mensagem(e) {
    const c = e.code || '', m = e.message || '';
    if (e.status === 429 || /rate limit|too many/i.test(m)) return 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.';
    if (c === 'same_password' || /different from the old/i.test(m)) return 'A senha nova precisa ser diferente da atual.';
    if (c === 'weak_password' || /weak|at least/i.test(m)) return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.';
    if (/session|jwt|expired/i.test(m)) return 'O link expirou. Peça um novo.';
    if (!e.status || /fetch|network/i.test(m)) return VR.msg();
    return 'Não foi possível concluir agora. Tente de novo em instantes.';
  }
})();
