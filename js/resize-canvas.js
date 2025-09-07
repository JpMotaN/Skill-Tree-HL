// resize-canvas.js — altura do canvas = max(altura da viewport útil, altura da coluna esquerda)
// mede explicitamente #leftColumn para evitar loops de “scroll infinito”.

(function(){
  function fitCanvasHeight(){
    const root    = document.querySelector('.canvas-root');     // contêiner do canvas
    const svg     = root ? root.querySelector('svg') : null;    // <svg> da árvore
    const header  = document.querySelector('.app-header');
    const leftCol = document.getElementById('leftColumn');      // <- coluna esquerda
    if (!root || !svg) return;

    const headerH = header ? header.getBoundingClientRect().height : 0;

    // Altura útil da viewport (sem o header)
    const viewportUseful = Math.max(0, window.innerHeight - headerH);

    // Altura REAL do conteúdo da esquerda (scrollHeight ignora o clipping do overflow)
    const leftContentH = leftCol ? leftCol.scrollHeight : 0;

    // alvo = maior entre viewport útil e coluna esquerda
    const target = Math.max(viewportUseful, leftContentH) + 24; // +respiro

    // aplica no contêiner e no svg (para Safari/Firefox respeitarem a área clicável)
    root.style.minHeight = `${target}px`;
    root.style.height    = `${target}px`;
    svg.style.height     = `${target}px`;
    svg.setAttribute('height', String(target));
    // mantemos a largura 100% via CSS; viewBox não precisa mudar
  }

  function installObservers(){
    const leftCol = document.getElementById('leftColumn');
    const header  = document.querySelector('.app-header');

    const ro = new ResizeObserver(fitCanvasHeight);
    if (leftCol) ro.observe(leftCol);
    if (header)  ro.observe(header);

    // quando algo no conteúdo da esquerda crescer (ex.: técnicas renderizadas)
    // o ResizeObserver dispara; estes eventos são apenas redundância segura:
    window.addEventListener('resize', fitCanvasHeight);
    document.addEventListener('visibilitychange', fitCanvasHeight);
  }

  document.addEventListener('DOMContentLoaded', () => {
    installObservers();
    fitCanvasHeight();
    // revalida depois de possíveis animações/render assíncronos
    setTimeout(fitCanvasHeight, 50);
    setTimeout(fitCanvasHeight, 250);
  });
})();
