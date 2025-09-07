// resize-canvas.js — canvas ocupa 100% da área útil (viewport - header).
// Página sem scroll; scroll só no #leftColumn. Nada de faixa à direita.

(function(){
  const SEL = {
    header: '.app-header',
    main: '.app-main',
    root: '.canvas-root',
    svg:  'svg#skillSvg, .canvas-root > svg, .canvas-root svg',
  };

  const raf = (fn)=>window.requestAnimationFrame(fn);

  function getEls(){
    const header = document.querySelector(SEL.header);
    const main   = document.querySelector(SEL.main);
    const root   = document.querySelector(SEL.root);
    const svg    = root ? root.querySelector(SEL.svg) : null;
    return {header, main, root, svg};
  }

  function setHeaderVar(header){
    const h = header ? Math.round(header.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--header-h', `${h}px`);
    return h;
  }

  function fit(){
    const {header, main, root, svg} = getEls();
    if (!main || !root || !svg) return;

    const headerH = setHeaderVar(header);
    const targetH = Math.max(0, Math.round(window.innerHeight - headerH));

    // altura exata
    root.style.height = `${targetH}px`;
    svg.style.height  = `${targetH}px`;
    svg.setAttribute('height', String(targetH));

    // viewBox com altura exata (evita corte e faixas)
    const rootW = Math.max(1, Math.round(root.getBoundingClientRect().width || svg.clientWidth || 1200));
    const vbAttr = svg.getAttribute('viewBox');
    let vbW = rootW;
    if (vbAttr){
      const p = vbAttr.split(/\s+/).map(Number);
      if (p.length === 4 && !isNaN(p[2])) vbW = Math.max(1, p[2]);
    }
    svg.setAttribute('viewBox', `0 0 ${vbW} ${targetH}`);

    // retângulo de fundo transparente cobrindo tudo (garante área clicável)
    let bg = svg.querySelector('#autosize-bg');
    if (!bg){
      bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
      bg.setAttribute('id','autosize-bg');
      bg.setAttribute('fill','transparent');
      bg.setAttribute('pointer-events','none');
      svg.insertBefore(bg, svg.firstChild);
    }
    bg.setAttribute('x','0'); bg.setAttribute('y','0');
    bg.setAttribute('width',  String(Math.max(vbW, rootW)));
    bg.setAttribute('height', String(targetH));
  }

  function boot(){
    const {header, main} = getEls();
    const ro = new ResizeObserver(()=>raf(fit));
    if (header) ro.observe(header);
    if (main)   ro.observe(main);
    window.addEventListener('resize', ()=>raf(fit));
    document.addEventListener('visibilitychange', ()=>raf(fit));
    document.addEventListener('DOMContentLoaded', ()=>raf(fit));
    raf(fit);
    setTimeout(fit, 50);
    setTimeout(fit, 250);
  }

  boot();
})();
