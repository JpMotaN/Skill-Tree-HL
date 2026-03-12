// app.js - drag & drop, layout salvo, links tempo real, tooltips, AND/OR, técnicas + ÍCONES simples (PNG)

(async function () {
  try {
    const LAYOUT_KEY = 'skilltree_layout_v1';
    const DEFAULT_LAYOUT_URL = 'data/default-positions.json';

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

    // Carrega dados
    const data = await fetch('data/skills.json').then((r) => r.json());

    // === MOVER reqStage => _reqStage (Engine não faz gate interno) ===
    for (const n of data.nodes) {
      if (n.reqStage) {
        n._reqStage = n.reqStage;
        delete n.reqStage;
      }
    }

    // Inicializa engine sem reqStage interno
    Engine.init(data);

    // --------- PN = Gastos; estágio derivado dos gastos ---------
    function stageFromPN(pn) {
      if (pn >= 31) return 'Mestre';
      if (pn >= 10) return 'Perito';
      return 'Iniciante';
    }
    Engine.nenStage = function () {
      const pn = Engine.state.pointsSpent; // conta tudo que foi gasto
      return { pn, name: stageFromPN(pn) };
    };

    // --------- Layout padrão (se existir) ----------
    let defaultLayout = null;
    try {
      const r = await fetch(DEFAULT_LAYOUT_URL, { cache: 'no-store' });
      if (r.ok) defaultLayout = await r.json();
    } catch (_) {}

    // total de pontos editável
    totalPointsInput.value = Engine.state.pointsMax;
    totalPointsInput.addEventListener('input', () => {
      Engine.setPointsMax(totalPointsInput.value);
      refresh();
    });

    const W = graph.clientWidth || 1200, H = graph.clientHeight || 700;
    const gRoot  = createSVG('g', { id: 'root' });
    const gLinks = createSVG('g', { id: 'links' });
    const gNodes = createSVG('g', { id: 'nodes' });
    graph.appendChild(gRoot);
    gRoot.appendChild(gLinks);
    gRoot.appendChild(gNodes);

    // posições
    let positions = Layout.compute(data.nodes, W * 0.9, H * 0.9);
    if (defaultLayout && defaultLayout.positions) {
      for (const [id, p] of Object.entries(defaultLayout.positions)) {
        positions.set(id, { x: p.x, y: p.y });
      }
    }
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    for (const n of data.nodes) if (saved[n.id]) positions.set(n.id, saved[n.id]);

    const nodesById = Object.fromEntries(data.nodes.map((n) => [n.id, n]));

    // === Gate de estágio aplicado no app.js ===
    const stageOrder = { Iniciante: 0, Perito: 1, Mestre: 2 };
    function hasRequiredStage(node) {
      if (!node || !node._reqStage) return true;
      const have = Engine.nenStage().name;
      return (stageOrder[have] ?? 0) >= (stageOrder[node._reqStage] ?? 0);
    }
    const baseCanBuy = Engine.canBuy.bind(Engine);
    Engine.canBuy = function (id) {
      const res = baseCanBuy(id);
      if (!res.ok) return res;
      const node = nodesById[id];
      if (!hasRequiredStage(node)) {
        return { ok: false, reason: `Requer estágio ${node._reqStage}` };
      }
      return res;
    };
    const baseBuy = Engine.buy.bind(Engine);
    Engine.buy = function (id) {
      const gate = Engine.canBuy(id);
      if (!gate.ok) return gate;
      return baseBuy(id);
    };

    // ===== ÍCONES (SIMPLES) =====
    const ICON_DIR = 'img/icons/'; // sempre esta pasta
    function iconPath(node) {
      const explicit = (node.icon || '').trim();
      if (!explicit) return null;
      if (/^https?:\/\//.test(explicit) || explicit.startsWith('/') || explicit.startsWith('./') || explicit.startsWith('../')) {
        return explicit;
      }
      return ICON_DIR + explicit;
    }
    // ÍCONES recortados no círculo
    function addIcon(g, circle, node, svgRoot = graph) {
      const href = iconPath(node);
      if (!href) return;

      const r = parseFloat(circle.getAttribute('r')) || 20;

      // garante um <defs> no <svg id="graph">
      let defs = svgRoot.querySelector('defs');
      if (!defs) {
        defs = createSVG('defs', {});
        svgRoot.insertBefore(defs, svgRoot.firstChild);
      }

      // clipPath único por nó
      const clipId = `icon-clip-${node.id}`;
      let clip = defs.querySelector('#' + clipId);
      if (!clip) {
        clip = createSVG('clipPath', { id: clipId });
        clip.appendChild(createSVG('circle', { cx: 0, cy: 0, r }));
        defs.appendChild(clip);
      } else {
        const c = clip.querySelector('circle');
        if (c) c.setAttribute('r', r);
      }

      // imagem do ícone, cortada pelo círculo
      const img = createSVG('image', {
        x: -r, y: -r, width: r * 2, height: r * 2,
        preserveAspectRatio: 'xMidYMid slice',
        'clip-path': `url(#${clipId})`,
        class: 'node-icon',
        style: 'pointer-events:none'
      });

      // href (com compat xlink)
      img.setAttribute('href', href);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);

      img.addEventListener('error', () => img.remove());

      // coloca a imagem **antes** do círculo -> borda fica por cima
      g.insertBefore(img, circle);
    }
    // ===== /ÍCONES =====

    // ====== STACKABLE (Expansão de Aura) ======
    const STACKS_KEY = 'skilltree_stacks_v1';

    // "stackable": true no JSON, ou detecta por rótulo
    function isStackableNode(node) {
      if (!node) return false;
      if (node.stackable === true) return true;
      const label = (node.label || '').toLowerCase();
      return /expans[aã]o\s+de\s+aura/.test(label);
    }

    // carrega/salva contadores
    Engine.state.stacks = (() => {
      try { return JSON.parse(localStorage.getItem(STACKS_KEY) || '{}'); }
      catch { return {}; }
    })();
    function getStacks(id) { return Number(Engine.state.stacks[id] || 0); }
    function setStacks(id, n) {
      if (n <= 0) delete Engine.state.stacks[id];
      else Engine.state.stacks[id] = n;
      localStorage.setItem(STACKS_KEY, JSON.stringify(Engine.state.stacks));
    }

    (function reconcileStacksWithActive() {
  const s = Engine.state.stacks || {};
  let changed = false;

  for (const id of Object.keys(s)) {
    // some se o nó não existe OU se o nó base não está ativo
    if (!nodesById[id] || !Engine.state.active.has(id)) {
      delete s[id];
      changed = true;
    }
  }

  if (changed) {
    localStorage.setItem(STACKS_KEY, JSON.stringify(s));
  }
})();

    // custo do próximo nível: custo base + níveis já comprados
    function nextStackCost(node) {
      const base = Number(node.cost || 0);
      const cur  = getStacks(node.id);
      return base + cur; // 2, depois 3, depois 4...
    }

    // requisitos para empilháveis (usa _reqStage)
    function meetsRequirements(node) {
      const active = Engine.state.active;
      // ALL
      if (Array.isArray(node.requires) && node.requires.length) {
        for (const id of node.requires) if (!active.has(id)) return false;
      }
      // ANY
      if (Array.isArray(node.requiresAny) && node.requiresAny.length) {
        let ok = false;
        for (const id of node.requiresAny) if (active.has(id)) { ok = true; break; }
        if (!ok) return false;
      }
      // estágio
      if (node._reqStage) {
        if (!hasRequiredStage(node)) return false;
      }
      return true;
    }

    // podemos comprar +1 nível?
    function canBuyStack(node) {
      if (!meetsRequirements(node)) return false;
      const need = nextStackCost(node);
      const left = Engine.state.pointsMax - Engine.state.pointsSpent;
      return left >= need;
    }

    // Guardar originais
    const _buy    = Engine.buy;
    const _refund = Engine.refund;

    // Compra +1 nível
    Engine.buyStack = function (id) {
      const node = nodesById[id];
      if (!node || !isStackableNode(node)) return _buy(id);

      const cur = getStacks(id);
      if (cur === 0) {
        // primeira compra: usa fluxo normal (ativa o nó e desconta custo base)
        const r = _buy(id);
        if (r && r.ok) { setStacks(id, 1); }
        return r;
      } else {
        // compra extra: só desconta PN adicional
        if (!canBuyStack(node)) return { ok: false, reason: 'PN insuficiente ou requisitos não atendidos.' };
        Engine.state.pointsSpent += nextStackCost(node); // desconta (base + cur)
        setStacks(id, cur + 1);
        return { ok: true };
      }
    };

    // Remove -1 nível (Shift+Clique ou clique direito)
    Engine.refundStack = function (id) {
      const node = nodesById[id];
      if (!node || !isStackableNode(node)) return _refund(id);

      const cur = getStacks(id);
      if (cur <= 0) return { ok: false, reason: 'Nada para remover.' };

      if (cur > 1) {
        // devolve o custo do último nível comprado: base + (cur-1)
        const refund = Number(node.cost || 0) + (cur - 1);
        Engine.state.pointsSpent = Math.max(0, Engine.state.pointsSpent - refund);
        setStacks(id, cur - 1);
        return { ok: true };
      } else {
        // voltando de 1 -> 0: usa fluxo normal para desativar e estornar custo base
        const r = _refund(id);
        if (r && r.ok) setStacks(id, 0);
        return r;
      }
    };
    // ====== /STACKABLE ======

    // Zoom/Pan
    let scale = 1, offsetX = W * 0.05, offsetY = H * 0.05;
    function updateTransform() {
      gRoot.setAttribute('transform', `translate(${offsetX},${offsetY}) scale(${scale})`);
    }
    updateTransform();

    graph.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * -0.1;
      scale = Math.min(2.5, Math.max(0.4, scale + delta));
      updateTransform();
    }, { passive: false });

    let panning = false, panLast = null;
    graph.addEventListener('mousedown', (e) => {
      panning = true; panLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => (panning = false));
    window.addEventListener('mousemove', (e) => {
      if (!panning || draggingNode) return;
      const dx = e.clientX - panLast.x, dy = e.clientY - panLast.y;
      panLast = { x: e.clientX, y: e.clientY };
      offsetX += dx; offsetY += dy; updateTransform();
    });

    fitBtn.onclick = () => { scale = 1; offsetX = W * 0.05; offsetY = H * 0.05; updateTransform(); };

    clearLayoutBtn.onclick = () => {
      localStorage.removeItem(LAYOUT_KEY);
      if (defaultLayout && defaultLayout.positions) {
        Engine.setPositions(defaultLayout.positions);
      } else {
        positions = Layout.compute(data.nodes, W * 0.9, H * 0.9);
        const all = Object.fromEntries([...positions].map(([id,p]) => [id, {x:p.x, y:p.y}]));
        Engine.setPositions(all);
      }
      Engine.requestRender();
      const tip = document.createElement('div');
      tip.textContent = 'Layout restaurado para o padrão.';
      tip.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:8px 12px;background:#0c1222;border:1px solid #1e2740;border-radius:10px;z-index:9999';
      document.body.appendChild(tip);
      setTimeout(()=>tip.remove(), 1500);
    };

resetBtn.onclick = () => {
  Engine.reset();
  // limpa todas as pilhas empilháveis
  Engine.state.stacks = {};
  localStorage.removeItem(STACKS_KEY);
  refresh();
};

    // helpers
    function toLocal(clientX, clientY) {
      const r = graph.getBoundingClientRect();
      return { x: (clientX - r.left - offsetX) / scale, y: (clientY - r.top - offsetY) / scale };
    }
    function saveLayout() {
      const out = {}; for (const [id, pos] of positions) out[id] = pos;
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
    }

    // links
    for (const node of data.nodes) {
      const to = positions.get(node.id); if (!to) continue;
      const isAdvancedPrinciple = node.type === 'principle' && (node.tags || []).includes('Avançado');
      if (isAdvancedPrinciple) continue;

      const deps = [...(node.requires || []), ...(node.requiresAny || [])];
      for (const dep of deps) {
        const from = positions.get(dep); if (!from) continue;
        const path = createSVG('path', {
          d: cubicV(from.x, from.y, to.x, to.y),
          class: 'link',
          'data-src': dep,
          'data-dst': node.id,
        });
        gLinks.appendChild(path);
      }
    }
    function redrawLinksFor(nodeId) {
      for (const path of gLinks.childNodes) {
        const src = path.getAttribute('data-src');
        const dst = path.getAttribute('data-dst');
        if (src === nodeId || dst === nodeId) {
          const s = positions.get(src), t = positions.get(dst);
          if (s && t) path.setAttribute('d', cubicV(s.x, s.y, t.x, t.y));
        }
      }
    }
    function redrawAllLinks() {
      for (const path of gLinks.childNodes) {
        const s = positions.get(path.getAttribute('data-src'));
        const t = positions.get(path.getAttribute('data-dst'));
        if (s && t) path.setAttribute('d', cubicV(s.x, s.y, t.x, t.y));
      }
    }

    // expor posições
    window.Engine = window.Engine || Engine;
    Engine.getPositions = () => {
      const out = {}; for (const [id, pos] of positions) out[id] = { x: pos.x, y: pos.y }; return out;
    };
    Engine.setPositions = (plain) => {
      if (!plain) return;
      for (const [id, pos] of Object.entries(plain)) {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          positions.set(id, { x: pos.x, y: pos.y });
          const g = nodeEls.get(id); if (g) g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
        }
      }
      redrawAllLinks();
      Engine.hasAppliedPositions = true;
    };
    Engine.requestRender = () => refresh();

    // tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    document.body.appendChild(tooltip);

    // nós
    let draggingNode = null;
    const nodeEls = new Map();

    for (const node of data.nodes) {
      const pos = positions.get(node.id);
      if (!pos) continue;

      const g = createSVG('g', {
        class: 'node',
        tabindex: 0,
        transform: `translate(${pos.x},${pos.y})`,
        'data-id': node.id,
      });

      const circle = createSVG('circle', { r: 20, stroke: 'var(--locked)', fill: 'transparent'});
      g.appendChild(circle);

      // ÍCONE (PNG transparente, com clip dentro do círculo)
      addIcon(g, circle, node, graph);

      const label = createSVG('text', { x: 0, y: 34, 'text-anchor': 'middle' });
      label.textContent = node.label;
      const bg = createSVG('rect', { class: 'label-bg', x: -40, y: 24, width: 80, height: 22, rx: 10, ry: 10 });
      g.appendChild(bg);
      g.appendChild(label);

      gNodes.appendChild(g);
      nodeEls.set(node.id, g);

      requestAnimationFrame(() => {
        const bb = label.getBBox();
        bg.setAttribute('x', bb.x - 10);
        bg.setAttribute('y', bb.y - 4);
        bg.setAttribute('width', bb.width + 20);
        bg.setAttribute('height', bb.height + 8);
      });

      g.addEventListener('mouseenter', () => {
        const rect = graph.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = rect.left + pos.x * scale + offsetX + 14 + 'px';
        tooltip.style.top  = rect.top  + pos.y * scale + offsetY - 10 + 'px';
        tooltip.innerHTML = renderTooltip(node);
      });
      g.addEventListener('mouseleave', () => (tooltip.style.display = 'none'));

      g.addEventListener('mousedown', (e) => {
        e.stopPropagation();
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
        positions.set(id, { x: nx, y: ny });
        nodeEls.get(id).setAttribute('transform', `translate(${nx},${ny})`);
        redrawLinksFor(id);
      });

      window.addEventListener('mouseup', () => {
        if (!draggingNode) return;
        nodeEls.get(draggingNode.id)?.classList.remove('dragging');
        if (draggingNode.moved) saveLayout();
        draggingNode = null;
      });

      // ---------- CLIQUES (inclui empilháveis) ----------
      g.addEventListener('click', (e) => {
        if (draggingNode && draggingNode.moved) return;
        if (draggingNode) return;

        const id = node.id;

        if (isStackableNode(node)) {
          // Shift+Clique = remover 1 nível; clique normal = adicionar 1 nível
          const r = e.shiftKey ? Engine.refundStack(id) : Engine.buyStack(id);
          if (!r.ok) return toast(r.reason || 'Ação não permitida.');
          refresh();
          return;
        }

        // comportamento normal para não-empilháveis
        if (Engine.state.active.has(id)) {
          const r = Engine.refund(id); if (!r.ok) return toast(r.reason);
        } else {
          const r = Engine.buy(id); if (!r.ok) return toast(r.reason);
        }
        refresh();
      });

      // clique direito = remover 1 nível nas empilháveis
      g.addEventListener('contextmenu', (e) => {
        if (!isStackableNode(node)) return;
        e.preventDefault();
        const r = Engine.refundStack(node.id);
        if (!r.ok) return toast(r.reason || 'Não foi possível remover.');
        refresh();
      });
    }

    function renderTooltip(node) {
      const reqAll = (node.requires || []).map((id) => nodesById[id]?.label || id).join(', ');
      const reqAny = (node.requiresAny || []).map((id) => nodesById[id]?.label || id).join(' ou ');
      const reqsText = [reqAll || null, reqAny ? `(qualquer um de: ${reqAny})` : null].filter(Boolean).join(' • ') || '—';

      const SHOW_TECH = false;
      const effectsList = (node.effects || []).map((e) => `<code>${e.op}</code> ${e.stat} = ${e.value}`).join('<br/>');
      const techBlock = SHOW_TECH && effectsList ? `<hr class="sep"/><p><b>Efeitos (técnicos):</b><br/>${effectsList}</p>` : '';

      const tags = (node.tags || []).map((t) => `<span class="tag">${t}</span>`).join('');
      const stageBadge = node._reqStage ? `<span class="tag">Requer: ${node._reqStage}</span>` : '';
      const summary = node.notes ? `<p><b>Resumo:</b> ${node.notes}</p>` : '';

      const desc = node.type === 'principle' && node.desc ? `<p>${node.desc}</p>` : '';
      const characteristic = node.type === 'principle' && node.characteristic ? `<p><b>Característica:</b> ${node.characteristic}</p>` : '';

      const extra = node.extra ? `<hr class="sep"/><p><b>${node.extra.title}:</b> ${node.extra.text}</p>` : '';
      const reqNote = node.reqNote ? `<p style="opacity:.85"><i>⚠ ${node.reqNote}</i></p>` : '';

      return `
        <h3>${node.label}</h3>
        <div>${tags} ${stageBadge}</div>
        ${desc}
        ${characteristic}
        <p>Custo: <b>${node.cost ?? 0} pt(s)</b></p>
        <p><b>Requisitos:</b> ${reqsText}</p>
        ${reqNote}
        ${summary}
        ${extra}
        ${techBlock}
      `;
    }

    function toast(msg) {
      const el = document.createElement('div');
      el.textContent = msg;
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.top = '18px';
      el.style.transform = 'translateX(-50%)';
      el.style.padding = '10px 14px';
      el.style.background = '#0c1222';
      el.style.border = '1px solid #1e2740';
      el.style.borderRadius = '10px';
      el.style.zIndex = '9999';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1800);
      return el;
    }

    function cubicV(sx, sy, tx, ty) {
      const my = (sy + ty) / 2;
      return `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`;
    }

    function refresh() {
      spentEl.textContent = Engine.state.pointsSpent;
      remainingEl.textContent = Math.max(0, Engine.state.pointsMax - Engine.state.pointsSpent);

      // estados visuais dos nós + badge ×N
      for (const node of data.nodes) {
        const el = nodeEls.get(node.id); if (!el) continue;
        const circle = el.querySelector('circle');

        let isActive, canMore;
        if (isStackableNode(node)) {
          const stacks = getStacks(node.id);
          isActive = stacks > 0 || Engine.state.active.has(node.id);
          canMore  = canBuyStack(node);
        } else {
          isActive = Engine.state.active.has(node.id);
          canMore  = Engine.canBuy(node.id).ok;
        }

        if (isActive) circle.setAttribute('stroke', 'var(--active)');
        else if (canMore) circle.setAttribute('stroke', 'var(--available)');
        else circle.setAttribute('stroke', 'var(--locked)');

        el.classList.toggle('active', isActive);
        el.classList.toggle('available', !isActive && canMore);
        el.classList.toggle('unavailable', !isActive && !canMore);

        // Badge "×N" (mostra se N>1)
        let badge = el.querySelector('.stack-badge');
        if (!badge) {
          badge = createSVG('text', { class: 'stack-badge', 'text-anchor':'middle', x: 14, y: -14 });
          badge.setAttribute('font-size', '12');
          badge.setAttribute('fill', '#fff');
          el.appendChild(badge);
        }
        const n = getStacks(node.id);
        badge.textContent = (isStackableNode(node) && n > 1) ? `×${n}` : '';
      }

      // estados das arestas
      for (const path of gLinks.childNodes) {
        const dst = path.getAttribute('data-dst');
        const node = nodesById[dst];
        let isDstActive, can;
        if (isStackableNode(node)) {
          isDstActive = (getStacks(dst) > 0) || Engine.state.active.has(dst);
          can = canBuyStack(node);
        } else {
          isDstActive = Engine.state.active.has(dst);
          can = Engine.canBuy(dst).ok;
        }

        let klass = 'link ';
        if (isDstActive) klass += 'active';
        else if (can) klass += 'available';
        else klass += 'locked';
        path.setAttribute('class', klass);
      }

      const st = Engine.nenStage();
      rules.innerHTML = `
        <p><b>Total:</b> ${Engine.state.pointsMax}</p>
        <p><b>Gastos:</b> ${Engine.state.pointsSpent}</p>
        <p><b>PN (Princípios de Nen):</b> ${st.pn}</p>
        <p><b>Estágio do Usuário:</b> ${st.name} <small>(Iniciante:0–9, Perito:10–30, Mestre:31+)</small></p>
      `;

      // Build (lista) com ×N
      buildList.innerHTML = '';
      const ul = document.createElement('ul');
      for (const id of Engine.state.active) {
        const n = nodesById[id];
        if (!n) continue;
        const li = document.createElement('li');
        if (isStackableNode(n)) {
          const cnt = Math.max(1, getStacks(id));
          li.textContent = `${n.label} ${cnt > 1 ? `×${cnt}` : ''}`.trim();
        } else {
          li.textContent = n.label;
        }
        ul.appendChild(li);
      }
      buildList.appendChild(ul);

      // Técnicas
      const techniques = [];
      for (const id of Engine.state.active) {
        const n = nodesById[id];
        if (n && Array.isArray(n.techniques) && n.techniques.length) {
          for (const t of n.techniques) techniques.push(t);
        }
      }
      if (techniques.length) {
        const h = document.createElement('h4'); h.textContent = 'Técnicas adquiridas';
        buildList.appendChild(h);
        for (const t of techniques) {
          const card = document.createElement('div');
          card.style.border = '1px solid #1c2742';
          card.style.borderRadius = '10px';
          card.style.padding = '8px 10px';
          card.style.margin = '6px 0';
          card.innerHTML = `<b>${t.name}</b><br/><small>${t.pa_cost || ''} • ${t.duration || ''} • ${t.range || ''}</small><br/><em>${t.requisite || ''}</em><br/>${t.text || ''}`;
          buildList.appendChild(card);
        }
      }
    }

    refresh();

    function createSVG(tag, attrs = {}) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }
  } catch (err) {
    console.error(err);
    const rules = document.getElementById('rules');
    if (rules) rules.innerHTML = `<p style="color:#ff7676"><b>Erro:</b> ${String(err)}</p>`;
  }
})();
