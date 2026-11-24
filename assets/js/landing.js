/* Finaxis — landing page (carregado no <head>; sem scripts inline por causa do CSP) */
(function () {
  try { var v = new URLSearchParams(location.search).get('v'); if (v) document.documentElement.dataset.v = v.split(',').join(' '); } catch (e) { /* ignore */ }

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.nav-wrapper');
    window.addEventListener('scroll', function () { nav.classList.toggle('scrolled', window.scrollY > 40); }, { passive: true });
    var m = document.getElementById('mascot');
    m.addEventListener('click', function () { m.style.animation = 'wiggle .5s'; setTimeout(function () { m.style.animation = ''; }, 520); });

    var brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
    var t = document.getElementById('lsTarget'), mo = document.getElementById('lsMonthly'), r = document.getElementById('lsRate');
    function calc() {
      var target = +t.value || 0, monthly = +mo.value || 0, annual = +r.value / 100;
      document.getElementById('lsRateV').textContent = (+r.value).toLocaleString('pt-BR') + '%';
      var i = Math.pow(1 + annual, 1 / 12) - 1, bal = 0, n = 0;
      if (monthly <= 0) { document.getElementById('lsMonths').textContent = '∞'; document.getElementById('lsText').textContent = 'Defina um valor mensal para simular.'; return; }
      while (bal < target && n < 600) { bal = bal * (1 + i) + monthly; n++; }
      var d = new Date(); d.setMonth(d.getMonth() + n);
      var juros = bal - monthly * n;
      document.getElementById('lsMonths').textContent = n + (n === 1 ? ' MÊS' : ' MESES');
      document.getElementById('lsText').textContent = 'Você chega lá em ' + d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + ', com ' + brl(bal) + ' guardados — ' + brl(Math.max(0, juros)) + ' vieram só de rendimento.';
    }
    [t, mo, r].forEach(function (el) { el.addEventListener('input', calc); });
    calc();
  });
})();
