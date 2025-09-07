// app.js - drag & drop de nós, layout salvo, links atualizam em tempo real,
// tooltips narrativos, AND/OR de requisitos, técnicas adquiridas

(async function(){
  try {
    const LAYOUT_KEY = 'skilltree_layout_v1';

    const graph = document.getElementById('graph');
    const rules = document.getElementById('rules');
    const spentEl = document.getElementById('spent');
    const remainingEl = document.getElementById('remaining');
    const totalPointsInput = document.getElementById('totalPoints');
    const buildList = document.getElementById('buildList');
    const fitBtn = document.getElementById('fitBtn');
    const clearLayoutBtn = document.getElementById('clearLayoutBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');

    const data = await fetch('data/skills.json').then(r=>r.json());
    Engine.init(data);

    // total de pontos editável
    totalPointsInput.value = Engine.state.pointsMax;
    totalPointsInput.addEventListener('input', () => {
      Engine.setPointsMax(totalPointsInput.value);
      refresh();
    });

    const W = graph.clientWidth || 1200, H = graph.clientHeight || 700;
    const gRoot = createSVG('g', { id:'root' });
    const gLinks = createSVG('g', { id:'links' });
    const gNodes = createSVG('g', { id:'nodes' });
    graph.appendChild(gRoot);
    gRoot.appendChild(gLinks);
    gRoot.appendChild(gNodes);

    // posições base (layout automático) + override salvo
    let positions = Layout.compute(data.nodes, W*0.9, H*0.9);
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    for (const n of data.nodes){
      if (saved[n.id]) positions.set(n.id, saved[n.id]);
    }

    const nodesById = Object.fromEntries(data.nodes.map(n=>[n.id,n]));

    // Zoom/Pan do canvas
    let scale = 1, offsetX = W*0.05, offsetY = H*0.05;
    function updateTransform(){ gRoot.setAttribute('transform', `translate(${offsetX},${offsetY}) scale(${scale})`); }
    updateTransform();

    graph.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY)*-0.1;
      scale = Math.min(2.5, Math.max(0.4, scale + delta));
      updateTransform();
    }, { passive:false });

    let panning = false, panLast = null;
    graph.addEventListener('mousedown', e => { panning = true; panLast = {x:e.clientX, y:e.clientY}; });
    window.addEventListener('mouseup', ()=> panning=false);
    window.addEventListener('mousemove', e => {
      if (!panning || draggingNode) return;
      const dx = e.clientX - panLast.x, dy = e.clientY - panLast.y;
      panLast = {x:e.clientX, y:e.clientY};
      offsetX += dx; offsetY += dy; updateTransform();
    });

    fitBtn.onclick = () => { scale=1; offsetX=W*0.05; offsetY=H*0.05; updateTransform(); };
    clearLayoutBtn.onclick = () => {
      localStorage.removeItem(LAYOUT_KEY);
      location.reload();
    };

    resetBtn.onclick = () => { Engine.reset(); refresh(); };

    exportBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(Engine.exportBuild(), null, 2)], {type:"application/json"});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'build.json';
      a.click();
    };
    importBtn.onclick = () => importFile.click();
    importFile.onchange = async () => {
      const file = importFile.files[0];
      if (!file) return;
      const txt = await file.text();
      try {
        Engine.importBuild(JSON.parse(txt));
        totalPointsInput.value = Engine.state.pointsMax;
        refresh();
      } catch(e) { alert('JSON inválido'); }
    };

    // Helpers de posição
    function toLocal(clientX, clientY){
      const r = graph.getBoundingClientRect();
      return { x: (clientX - r.left - offsetX)/scale, y: (clientY - r.top - offsetY)/scale };
    }
    function saveLayout(){
      const out = {};
      for (const [id, pos] of positions) out[id] = pos;
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
    }

    // Render links (usa requires + requiresAny)
    for (const node of data.nodes) {
      const to = positions.get(node.id);
      if (!to) continue;
      const deps = [...(node.requires||[]), ...(node.requiresAny||[])];
      for (const dep of deps) {
        const from = positions.get(dep);
        if (!from) continue;
        const path = createSVG('path', {
          d: cubicV(from.x, from.y, to.x, to.y),
          class: 'link',
          'data-src': dep,
          'data-dst': node.id
        });
        gLinks.appendChild(path);
      }
    }

    // atualiza todos os paths (usado ao arrastar)
    function redrawLinksFor(nodeId){
      for (const path of gLinks.childNodes){
        const src = path.getAttribute('data-src');
        const dst = path.getAttribute('data-dst');
        if (src === nodeId || dst === nodeId){
          const s = positions.get(src), t = positions.get(dst);
          if (s && t) path.setAttribute('d', cubicV(s.x, s.y, t.x, t.y));
        }
      }
    }

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);

    // Nós (com drag)
    let draggingNode = null;   // { id, dx, dy, moved }
    const nodeEls = new Map();

    for (const node of data.nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;
      const g = createSVG('g', { class:'node', tabindex:0, transform:`translate(${pos.x},${pos.y})`, 'data-id': node.id });
      const circle = createSVG('circle', { r:20, stroke:'var(--locked)'});
      g.appendChild(circle);

      const label = createSVG('text', { x:0, y:34, 'text-anchor':'middle' });
      label.textContent = node.label;
      const bg = createSVG('rect', { class:'label-bg', x:-40, y:24, width:80, height:22, rx:10, ry:10 });
      g.appendChild(bg);
      g.appendChild(label);

      gNodes.appendChild(g);
      nodeEls.set(node.id, g);

      requestAnimationFrame(()=>{
        const bb = label.getBBox();
        bg.setAttribute('x', (bb.x-10));
        bg.setAttribute('y', (bb.y-4));
        bg.setAttribute('width', (bb.width+20));
        bg.setAttribute('height', (bb.height+8));
      });

      // tooltip
      g.addEventListener('mouseenter', () => {
        const rect = graph.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = (rect.left + pos.x*scale + offsetX + 14) + 'px';
        tooltip.style.top  = (rect.top + pos.y*scale + offsetY - 10) + 'px';
        tooltip.innerHTML = renderTooltip(node);
      });
      g.addEventListener('mouseleave', ()=> tooltip.style.display='none');

      // --- DRAG DO NÓ ---
      g.addEventListener('mousedown', (e) => {
        e.stopPropagation(); // não iniciar pan
        const id = node.id;
        const p = toLocal(e.clientX, e.clientY);
        const cur = positions.get(id);
        draggingNode = { id, dx: p.x - cur.x, dy: p.y - cur.y, moved: false };
        g.classList.add('dragging');
      });

      window.addEventListener('mousemove', (e) => {
        if (!draggingNode) return;
        const id = draggingNode.id;
        const p = toLocal(e.clientX, e.clientY);
        const nx = p.x - draggingNode.dx;
        const ny = p.y - draggingNode.dy;
        const old = positions.get(id);
        if (Math.abs(nx - old.x) > 0.5 || Math.abs(ny - old.y) > 0.5) draggingNode.moved = true;
        positions.set(id, {x:nx, y:ny});
        nodeEls.get(id).setAttribute('transform', `translate(${nx},${ny})`);
        redrawLinksFor(id);
      });

      window.addEventListener('mouseup', () => {
        if (!draggingNode) return;
        nodeEls.get(draggingNode.id)?.classList.remove('dragging');
        if (draggingNode.moved) saveLayout();
        draggingNode = null;
      });

      // click compra/refundo (ignora se foi drag)
      g.addEventListener('click', () => {
        if (draggingNode && draggingNode.moved) return;
        if (draggingNode) return; // mouseup vai limpar
        const id = node.id;
        if (Engine.state.active.has(id)) {
          const r = Engine.refund(id);
          if (!r.ok) return toast(r.reason);
        } else {
          const r = Engine.buy(id);
          if (!r.ok) return toast(r.reason);
        }
        refresh();
      });
    }

    function renderTooltip(node){
      const reqAll = (node.requires||[]).map(id=>nodesById[id]?.label||id).join(', ');
      const reqAny = (node.requiresAny||[]).map(id=>nodesById[id]?.label||id).join(' ou ');
      const reqsText = [
        reqAll || null,
        reqAny ? `(qualquer um de: ${reqAny})` : null
      ].filter(Boolean).join(' • ') || '—';

      const SHOW_TECH = false; // mantenha técnico oculto
      const effectsList = (node.effects||[]).map(e => `<code>${e.op}</code> ${e.stat} = ${e.value}`).join('<br/>');
      const techBlock = (SHOW_TECH && effectsList)
        ? `<hr class="sep"/><p><b>Efeitos (técnicos):</b><br/>${effectsList}</p>` : '';

      const tags = (node.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');
      const stageBadge = node.reqStage ? `<span class="tag">Requer: ${node.reqStage}</span>` : '';
      const summary = node.notes ? `<p><b>Resumo:</b> ${node.notes}</p>` : '';

      const desc = (node.type === 'principle' && node.desc) ? `<p>${node.desc}</p>` : '';
      const characteristic = (node.type === 'principle' && node.characteristic)
        ? `<p><b>Característica:</b> ${node.characteristic}</p>` : '';

      const extra = node.extra ? `<hr class="sep"/><p><b>${node.extra.title}:</b> ${node.extra.text}</p>` : '';
      const reqNote = node.reqNote ? `<p style="opacity:.85"><i>⚠ ${node.reqNote}</i></p>` : '';

      return `
        <h3>${node.label}</h3>
        <div>${tags} ${stageBadge}</div>
        ${desc}
        ${characteristic}
        <p>Custo: <b>${node.cost??0} pt(s)</b></p>
        <p><b>Requisitos:</b> ${reqsText}</p>
        ${reqNote}
        ${summary}
        ${extra}
        ${techBlock}
      `;
    }

    function toast(msg){
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.position='fixed';
      el.style.left='50%';
      el.style.top='18px';
      el.style.transform='translateX(-50%)';
      el.style.padding='10px 14px';
      el.style.background='#0c1222';
      el.style.border='1px solid #1e2740';
      el.style.borderRadius='10px';
      el.style.zIndex='9999';
      document.body.appendChild(el);
      setTimeout(()=>el.remove(), 1800);
      return el;
    }

    function cubicV(sx, sy, tx, ty){
      const my = (sy+ty)/2;
      return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
    }

    function refresh(){
      spentEl.textContent = Engine.state.pointsSpent;
      remainingEl.textContent = Math.max(0, Engine.state.pointsMax - Engine.state.pointsSpent);

    // Nós: além do stroke, ligamos classes para controlar opacidade
    for (const node of data.nodes) {
      const el = nodeEls.get(node.id);
      if (!el) continue;

      const circle = el.querySelector('circle');
      const isActive = Engine.state.active.has(node.id);
      const can = Engine.canBuy(node.id).ok;

      // stroke (contorno) como antes
      if (isActive) circle.setAttribute('stroke', 'var(--active)');
      else if (can) circle.setAttribute('stroke', 'var(--available)');
      else circle.setAttribute('stroke', 'var(--locked)');

      // classes novas para CSS controlar visibilidade
      el.classList.toggle('active', isActive);
      el.classList.toggle('available', !isActive && can);
      el.classList.toggle('unavailable', !isActive && !can);
    }

    // Ligações: marcamos também as travadas
    for (const path of gLinks.childNodes) {
      const dst = path.getAttribute('data-dst');
      const can = Engine.canBuy(dst).ok;
      path.setAttribute('class', 'link ' + (can ? 'available' : 'locked'));
    }


      const st = Engine.nenStage();
      rules.innerHTML = `
        <p><b>Total:</b> ${Engine.state.pointsMax}</p>
        <p><b>Gastos:</b> ${Engine.state.pointsSpent}</p>
        <p><b>PN (Princípios de Nen):</b> ${st.pn}</p>
        <p><b>Estágio do Usuário:</b> ${st.name} <small>(Iniciante:0–9, Perito:10–30, Mestre:31+)</small></p>
      `;

      // Build + Técnicas
      buildList.innerHTML = '';
      const ul = document.createElement('ul');
      for (const id of Engine.state.active) {
        const li = document.createElement('li');
        li.textContent = nodesById[id].label;
        ul.appendChild(li);
      }
      buildList.appendChild(ul);

      const techniques = [];
      for (const id of Engine.state.active){
        const n = nodesById[id];
        if (n && Array.isArray(n.techniques) && n.techniques.length){
          for (const t of n.techniques){ techniques.push(t); }
        }
      }
      if (techniques.length){
        const h = document.createElement('h4'); h.textContent = 'Técnicas adquiridas';
        buildList.appendChild(h);
        for (const t of techniques){
          const card = document.createElement('div');
          card.style.border='1px solid #1c2742';
          card.style.borderRadius='10px';
          card.style.padding='8px 10px';
          card.style.margin='6px 0';
          card.innerHTML = `<b>${t.name}</b><br/><small>${t.pa_cost||''} • ${t.duration||''} • ${t.range||''}</small><br/><em>${t.requisite||''}</em><br/>${t.text||''}`;
          buildList.appendChild(card);
        }
      }
    }

    refresh();

    function createSVG(tag, attrs={}){
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
      return el;
    }
  } catch (err) {
    console.error(err);
    const rules = document.getElementById('rules');
    if (rules){
      rules.innerHTML = `<p style="color:#ff7676"><b>Erro:</b> ${String(err)}</p>`;
    }
  }
})();
