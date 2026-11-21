// login da loja (RF10)
(async function () {
  const $ = (id) => document.getElementById(id);
  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = false; };
  if (!VR.db) return erro(VR.msg());

  const { data } = await VR.db.auth.getSession();
  if (data.session) return location.replace('painel.html');

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('erro').hidden = true;
    const email = $('email').value.trim(), senha = $('senha').value;
    if (!email || !senha) return erro('Preencha e-mail e senha.');
    $('entrar').disabled = true;
    const { error } = await VR.db.auth.signInWithPassword({ email, password: senha });
    $('entrar').disabled = false;
    if (error) return erro(mensagem(error));
    location.replace('painel.html');
  });

  // mensagem certa para cada erro do login (antes era sempre "senha incorreta")
  function mensagem(e) {
    const c = e.code || '', m = e.message || '';
    if (c === 'invalid_credentials' || /invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
    if (c === 'email_not_confirmed' || /not confirmed/i.test(m)) return 'Este e-mail ainda não foi confirmado.';
    if (e.status === 429 || /rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
    if (!e.status || /fetch|network/i.test(m)) return VR.msg(); // sem conexão
    return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }
})();
