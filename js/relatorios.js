// relatórios de vendas (RF16 a RF19, RF22)
// vendas = vendas no balcão + reservas retiradas
(async function () {
  const $ = (id) => document.getElementById(id);
  if (!(await VR_AUTH.exigirLogin())) return;
  const db = VR.db, toast = VR_AUTH.toast;
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dt = (s) => new Date(s + 'T12:00:00');
  const soma = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return ymd(d); };
  const ddmm = (s) => s.slice(8, 10) + '/' + s.slice(5, 7);
  const segunda = (s) => soma(s, -((dt(s).getDay() + 6) % 7));
  const pl = (n) => (n === 1 ? '1 pão' : `${n} pães`);
  const hoje = ymd(new Date());

  let dias = [], agrupar = 'dia';

  function periodo(d) {
    $('ate').value = hoje;
    $('de').value = soma(hoje, -(d - 1));
    document.querySelectorAll('#atalhos button').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.d === d));
    carregar();
  }

  async function buscar(de, ate) {
    const { data, error } = await db.rpc('relatorio_vendas', { p_de: de, p_ate: ate });
    if (error) throw error;
    return data || [];
  }

  async function carregar() {
    const de = $('de').value, ate = $('ate').value;
    if (!de || !ate) return;
    if (de > ate) { $('erro').textContent = 'A data inicial é depois da final.'; $('erro').hidden = false; return; }
    try {
      const seg = segunda(hoje);
      const [linhas, semana] = await Promise.all([buscar(de, ate), buscar(soma(seg, -7), hoje)]);
      $('erro').hidden = true;

      // um item por dia do período, mesmo sem venda
      const porDia = {};
      for (let d = de; d <= ate; d = soma(d, 1)) porDia[d] = { dia: d, b: 0, r: 0 };
      const horas = {};
      linhas.forEach((l) => {
        if (porDia[l.dia]) { porDia[l.dia].b += l.balcao; porDia[l.dia].r += l.reservas; }
        horas[l.hora] = (horas[l.hora] || 0) + l.balcao + l.reservas;
      });
      dias = Object.values(porDia);

      resumo(semana, seg);
      graficoVendas();
      graficoPico(horas);
      tabela();
    } catch (e) {
      $('erro').textContent = VR.msg(e); $('erro').hidden = false;
    }
  }

  function resumo(semana, seg) {
    const tot = (x) => x.b + x.r;
    const total = dias.reduce((s, d) => s + tot(d), 0);
    $('s-total').textContent = total;
    $('s-media').textContent = Math.round(total / dias.length);
    const melhor = dias.reduce((m, d) => (tot(d) > tot(m) ? d : m), dias[0]);
    $('s-melhor').innerHTML = total ? `${tot(melhor)}<small>${ddmm(melhor.dia)}</small>` : '–';

    // RF19: de segunda até hoje, contra os mesmos dias da semana passada
    const ontemSemana = soma(hoje, -7);
    let atual = 0, anterior = 0;
    semana.forEach((l) => {
      const v = l.balcao + l.reservas;
      if (l.dia >= seg) atual += v;
      else if (l.dia <= ontemSemana) anterior += v;
    });
    $('s-semana').textContent = atual;
    const dias_ = seg === hoje ? 'Hoje' : `De seg a ${SEM[dt(hoje).getDay()]}`;
    let comp = `${dias_}: ${pl(atual)}. No mesmo período da semana passada: ${pl(anterior)}`;
    if (anterior) {
      const p = Math.round(((atual - anterior) / anterior) * 100);
      comp += p === 0 ? ' (igual).' : ` (${p > 0 ? '+' : ''}${p}%).`;
    } else comp += '.';
    $('s-comp').textContent = comp;
  }

  function graficoVendas() {
    let itens;
    if (agrupar === 'semana') {
      const g = {};
      dias.forEach((d) => {
        const k = segunda(d.dia);
        g[k] = g[k] || { dia: k, b: 0, r: 0 };
        g[k].b += d.b; g[k].r += d.r;
      });
      itens = Object.values(g).map((s) => ({ rot: ddmm(s.dia), dica: `Semana de ${ddmm(s.dia)}`, b: s.b, r: s.r }));
    } else {
      itens = dias.map((d) => ({ rot: ddmm(d.dia), dica: `${SEM[dt(d.dia).getDay()]}, ${ddmm(d.dia)}`, b: d.b, r: d.r }));
    }
    $('t-vendas').textContent = agrupar === 'semana' ? 'Vendas por semana' : 'Vendas por dia';
    barras($('c-vendas'), itens, true);
  }

  function graficoPico(horas) {
    const hs = Object.keys(horas).map(Number);
    const ini = Math.min(6, ...hs), fim = Math.max(21, ...hs);
    const itens = [];
    for (let h = ini; h <= fim; h++) itens.push({ rot: h + 'h', dica: `${h}h às ${h + 1}h`, b: horas[h] || 0, r: 0 });
    barras($('c-pico'), itens, false);
    const top = itens.filter((i) => i.b).sort((a, b) => b.b - a.b).slice(0, 2);
    $('pico-txt').textContent = top.length
      ? 'Mais movimento: ' + top.map((i) => `${i.dica} (${pl(i.b)})`).join(' e ') + '.'
      : '';
  }

  // gráfico de barras em HTML: balcão (azul) + reservas retiradas (laranja) empilhadas
  function barras(el, itens, empilhado) {
    const max = Math.max(0, ...itens.map((i) => i.b + i.r));
    if (!max) { el.innerHTML = '<p class="vazio">Sem vendas no período.</p>'; return; }
    const nice = (v) => { const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= v); };
    const topo = Math.max(2, 2 * Math.ceil(nice(max / 2)));
    const pct = (v) => (v / topo) * 100;
    const cada = Math.ceil(itens.length / 10);
    el.style.setProperty('--n', itens.length);
    el.innerHTML = `<div class="plot">
        ${[topo, topo / 2].map((v) => `<span class="gl" style="bottom:${pct(v)}%"><b>${v}</b></span>`).join('')}<span class="gl zero"><b>0</b></span>
        <div class="bars">${itens.map((i, k) => `<div class="col" tabindex="0" data-k="${k}" aria-label="${i.dica}: ${pl(i.b + i.r)}">${
          i.b ? `<i class="seg b" style="height:${pct(i.b)}%"></i>` : ''}${i.r ? `<i class="seg r" style="height:${pct(i.r)}%"></i>` : ''}</div>`).join('')}</div>
        <div class="tip" hidden></div>
      </div>
      <div class="xl">${itens.map((i, k) => `<span>${k % cada === 0 ? i.rot : ''}</span>`).join('')}</div>`;
    const tip = el.querySelector('.tip');
    el.querySelectorAll('.col').forEach((c) => {
      const i = itens[+c.dataset.k];
      const mostrar = () => {
        tip.innerHTML = `<b>${i.dica}</b><br>${empilhado ? `Balcão ${i.b} · Reservas ${i.r}<br>Total ${i.b + i.r}` : pl(i.b)}`;
        tip.hidden = false;
        const x = c.offsetLeft + c.offsetWidth / 2, w = c.parentElement.offsetWidth;
        tip.style.left = Math.min(Math.max(x, 70), w - 70) + 'px';
        tip.style.top = Math.max(0, 100 - pct(i.b + i.r)) + '%';
      };
      c.onmouseenter = c.onfocus = mostrar;
      c.onmouseleave = c.onblur = () => (tip.hidden = true);
    });
  }

  function tabela() {
    const t = dias.reduce((s, d) => ({ b: s.b + d.b, r: s.r + d.r }), { b: 0, r: 0 });
    $('lista').innerHTML = dias.slice().reverse().map((d) => `<tr><td>${SEM[dt(d.dia).getDay()]}, ${ddmm(d.dia)}</td>
      <td class="num">${d.b}</td><td class="num">${d.r}</td><td class="num"><b>${d.b + d.r}</b></td></tr>`).join('')
      + `<tr class="tot"><td>Total</td><td class="num">${t.b}</td><td class="num">${t.r}</td><td class="num"><b>${t.b + t.r}</b></td></tr>`;
  }

  // RF22: CSV com ; para abrir direto no Excel em português
  $('csv').onclick = () => {
    if (!dias.length) return toast('Nada para exportar.');
    const linhas = ['Dia;Dia da semana;Balcão;Reservas retiradas;Total']
      .concat(dias.map((d) => `${ddmm(d.dia)}/${d.dia.slice(0, 4)};${SEM[dt(d.dia).getDay()]};${d.b};${d.r};${d.b + d.r}`));
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vendas_${$('de').value}_a_${$('ate').value}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.querySelectorAll('#atalhos button').forEach((b) => (b.onclick = () => periodo(+b.dataset.d)));
  ['de', 'ate'].forEach((id) => $(id).addEventListener('change', () => {
    document.querySelectorAll('#atalhos button').forEach((b) => b.setAttribute('aria-pressed', false));
    carregar();
  }));
  $('periodo').addEventListener('submit', (e) => e.preventDefault());
  const grupo = (g) => { agrupar = g; $('g-dia').setAttribute('aria-pressed', g === 'dia'); $('g-semana').setAttribute('aria-pressed', g === 'semana'); graficoVendas(); };
  $('g-dia').onclick = () => grupo('dia');
  $('g-semana').onclick = () => grupo('semana');

  periodo(14);
})();
