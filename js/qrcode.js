// QR Code para imprimir (RF21)
(async function () {
  if (!(await VR_AUTH.exigirLogin())) return;
  const url = new URL('./', location.href).href; // página pública "Tem pão?"
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  document.getElementById('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  document.getElementById('url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  document.getElementById('imprimir').onclick = () => window.print();
})();
