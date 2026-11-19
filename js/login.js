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
    if (error) return erro(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : VR.msg(error));
    location.replace('painel.html');
  });
})();
