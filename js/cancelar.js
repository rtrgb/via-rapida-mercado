// cancelamento pelo link do e-mail (RF06, RN10)
(async function () {
  const status = document.getElementById('status');
  const token = new URLSearchParams(location.search).get('t');
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { status.textContent = 'Link de cancelamento inválido.'; return; }
  if (!VR.db) { status.textContent = VR.msg(); return; }
  const { data, error } = await VR.db.rpc('cancelar_inscricao', { p_token: token });
  if (error) { status.textContent = VR.msg(error); return; }
  status.textContent = data
    ? 'Pronto. Você não vai mais receber avisos e seus dados foram apagados.'
    : 'Este aviso já tinha sido cancelado.';
})();
