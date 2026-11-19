// sessão da loja: protege as páginas do painel (RF10, RNF07)
window.VR_AUTH = {
  async exigirLogin() {
    if (!VR.db) { location.replace('login.html'); return null; }
    const { data } = await VR.db.auth.getSession();
    if (!data.session) { location.replace('login.html'); return null; }
    const quem = document.getElementById('quem');
    if (quem) quem.textContent = data.session.user.email;
    const sair = document.getElementById('sair');
    if (sair) sair.onclick = async () => { await VR.db.auth.signOut(); location.replace('login.html'); };
    return data.session;
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2500);
  },
};
