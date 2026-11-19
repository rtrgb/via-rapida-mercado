// inscrição para o aviso por e-mail (RF05, RNF08)
(function () {
  const $ = (id) => document.getElementById(id);
  const erro = (m) => { $('erro').textContent = m; $('erro').hidden = false; };

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('erro').hidden = true;
    const nome = $('nome').value.trim(), email = $('email').value.trim();
    if (!nome) return erro('Informe seu nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('Informe um e-mail válido.');
    if (!$('aceite').checked) return erro('Marque o aceite para receber os avisos.');
    if (!VR.db) return erro(VR.msg());

    $('enviar').disabled = true;
    const { error } = await VR.db.rpc('inscrever', { p_nome: nome, p_email: email, p_consentimento: true });
    $('enviar').disabled = false;
    if (error) return erro(VR.msg(error));
    $('form').hidden = true;
    $('ok').hidden = false;
  });
})();
