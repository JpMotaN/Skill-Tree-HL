// js/fit-graph.js — deixa o #graph com a altura exata da área útil
(function(){
  const header = document.querySelector('.app-header');
  const wrap   = document.querySelector('.canvas-wrap');
  const svg    = document.querySelector('#graph'); // seu SVG

  if(!wrap || !svg) return;

  function headerH(){
    return header ? Math.round(header.getBoundingClientRect().height) : 64;
  }

  function fit(){
    // altura útil = viewport - header
    const h = Math.max(0, window.innerHeight - headerH());
    document.documentElement.style.setProperty('--header-h', h + 'px'); // só para CSS

    wrap.style.height = h + 'px';
    svg.style.height  = h + 'px';
    svg.setAttribute('height', String(h));

    // Ajusta o viewBox para evitar corte/sobras
    const vbAttr = svg.getAttribute('viewBox');
    const wrapW  = Math.max(1, Math.round(wrap.getBoundingClientRect().width));
    let vbW = wrapW;
    if (vbAttr){
      const p = vbAttr.split(/\s+/).map(Number);
      if (p.length === 4 && !isNaN(p[2])) vbW = Math.max(1, p[2]);
    }
    svg.setAttribute('viewBox', `0 0 ${vbW} ${h}`);

    // Fundo transparente cobrindo tudo (garante área clicável)
    let bg = svg.querySelector('#autosize-bg');
    if(!bg){
      bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
      bg.setAttribute('id','autosize-bg');
      bg.setAttribute('fill','transparent');
      bg.setAttribute('pointer-events','none');
      svg.insertBefore(bg, svg.firstChild);
    }
    bg.setAttribute('x','0'); bg.setAttribute('y','0');
    bg.setAttribute('width',  String(Math.max(vbW, wrapW)));
    bg.setAttribute('height', String(h));
  }

  const ro = new ResizeObserver(fit);
  if (header) ro.observe(header);
  ro.observe(wrap);
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', fit);

  document.addEventListener('DOMContentLoaded', fit);
  setTimeout(fit, 50);
  setTimeout(fit, 250);
})();
// js/sidebar-toggle.js
(function(){
  const appMain = document.querySelector('.app-main');
  const btn     = document.getElementById('toggleSidebar');
  if (!appMain || !btn) return;

  const updateLabel = () => {
    const collapsed = appMain.classList.contains('sidebar-collapsed');
    btn.textContent = collapsed ? 'Mostrar painel' : 'Ocultar painel';
  };

  btn.addEventListener('click', () => {
    appMain.classList.toggle('sidebar-collapsed');
    updateLabel();
    // dispara um resize “virtual” para qualquer layout recalcular (svg, etc.)
    window.dispatchEvent(new Event('resize'));
  });

  updateLabel();
})();
