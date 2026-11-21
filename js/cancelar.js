// cancelamento pelo link do e-mail (RF06, RN10)
// só cancela no clique: alguns e-mails abrem os links sozinhos para checar segurança
(function () {
  const status = document.getElementById('status');
  const botao = document.getElementById('confirmar');
  const token = new URLSearchParams(location.search).get('t');
  const fim = (m) => { status.textContent = m; botao.hidden = true; };
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return fim('Link de cancelamento inválido.');

  botao.onclick = async () => {
    if (!VR.db) { status.textContent = VR.msg(); return; }
    botao.disabled = true;
    const { data, error } = await VR.db.rpc('cancelar_inscricao', { p_token: token });
    botao.disabled = false;
    if (error) { status.textContent = VR.msg(error); return; }
    fim(data
      ? 'Pronto. Você não vai mais receber avisos e seus dados foram apagados.'
      : 'Este aviso já tinha sido cancelado.');
  };
})();
