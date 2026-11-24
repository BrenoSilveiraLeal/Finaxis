/* Finaxis — landing page (carregado no <head>; sem scripts inline por causa do CSP) */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var header = document.querySelector('.site-header');
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var brl = function (v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }); };
    var $ = function (id) { return document.getElementById(id); };
    var t = $('lsTarget'), mo = $('lsMonthly'), r = $('lsRate');
    function calc() {
      var target = +t.value || 0, monthly = +mo.value || 0, annual = +r.value / 100;
      $('lsRateV').textContent = (+r.value).toLocaleString('pt-BR') + '%';
      if (monthly <= 0) {
        $('lsMonths').textContent = '—';
        $('lsText').textContent = 'Informe quanto você guarda por mês para calcular o prazo.';
        $('lsSplitA').style.width = '100%'; $('lsSplitB').style.width = '0%';
        return;
      }
      var i = Math.pow(1 + annual, 1 / 12) - 1, bal = 0, n = 0;
      while (bal < target && n < 600) { bal = bal * (1 + i) + monthly; n++; }
      var d = new Date(); d.setMonth(d.getMonth() + n);
      var dep = monthly * n, juros = Math.max(0, bal - dep);
      var yrs = Math.floor(n / 12), rem = n % 12;
      $('lsMonths').textContent = n < 12 ? n + (n === 1 ? ' mês' : ' meses') : yrs + (yrs === 1 ? ' ano' : ' anos') + (rem ? ' e ' + rem + (rem === 1 ? ' mês' : ' meses') : '');
      $('lsText').innerHTML = 'Meta atingida em <b>' + d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) + '</b>, com ' + brl(bal) + ' guardados. Desse total, <b>' + brl(juros) + '</b> vêm do rendimento.';
      var pj = bal ? (juros / bal) * 100 : 0;
      $('lsSplitA').style.width = (100 - pj) + '%'; $('lsSplitB').style.width = pj + '%';
    }
    [t, mo, r].forEach(function (el) { el.addEventListener('input', calc); });
    calc();
  });
})();
