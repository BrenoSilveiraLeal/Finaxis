/* Mantém o layout idêntico ao desenhado em 1360px de largura.
   Em telas desktop (>=1200px) o site é ampliado/reduzido proporcionalmente;
   abaixo disso valem os breakpoints responsivos normais. */
(function () {
  var BASE = 1360, MIN = 1200, root = document.documentElement;
  function fit() {
    var w = window.innerWidth;
    var z = w >= MIN ? w / BASE : 1;
    root.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--vh', (window.innerHeight / z) + 'px');
    root.style.setProperty('--vw', (w / z) + 'px');
  }
  fit();
  window.addEventListener('resize', fit);
})();
