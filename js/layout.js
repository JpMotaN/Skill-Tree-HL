// layout.js — duas faixas independentes: BÁSICOS em cima, AVANÇADOS embaixo.
// Colunas e espaçamentos calculados por bloco (não mais por todos os grupos juntos).
// Anti-overlap por linha + "stagger" vertical para desgrudar labels.

const Layout = (() => {
  const ORDER = ["Ten","Zetsu","Ren","Hatsu","Gyo","Shu","In","En","Ryu","Ken","Ko"];
  const BASIC = new Set(["Ten","Zetsu","Ren","Hatsu"]);
  const ADV   = new Set(["Gyo","Shu","In","En","Ryu","Ken","Ko"]);

  // Controles de densidade
  const CFG = {
    TOP_BASIC: 30,          // Y inicial do bloco dos básicos
    GAP_ROWS: 150,          // distância mínima entre linhas (vertical)
    GAP_BLOCKS_EXTRA_ROWS: 2, // linhas extras entre blocos (respiro)
    COL_SPAN: 0.86,         // fração da coluna usada para distribuir badges
    MIN_COL_GAP: 32,        // distância mínima entre badges na mesma linha
    ROW_STAGGER: 16         // deslocamento +/- dentro da mesma linha
  };

  function groupOf(node){
    const tags = node.tags || [];
    for (const g of ORDER) if (tags.includes(g)) return g;
    return "Outros";
  }

  // Estimativa de largura do rótulo para evitar sobreposição
  function estimateLabelWidth(node, colW){
    const txt = (node.label || "");
    const est = 28 + txt.length * 7.4 + 22; // padding + char médio
    return Math.min(Math.max(70, est), colW * 0.92);
  }

  function compute(nodes, width, height) {
    // --- Agrupar nós por "coluna" (princípio) ---
    const byGroup = new Map();
    for (const n of nodes){
      const g = groupOf(n);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(n);
    }

    // Grupos presentes em cada bloco, na ordem canônica
    const basicGroups = ORDER.filter(g => BASIC.has(g) && byGroup.has(g));
    const advGroups   = ORDER.filter(g => ADV.has(g)   && byGroup.has(g));
    const others      = (!basicGroups.length && !advGroups.length && byGroup.has("Outros")) ? ["Outros"] : [];

    // Largura/centro de coluna por BLOCO
    const centers = new Map(); // Map<group, centerX>
    const colWMap = new Map(); // Map<group, colWidthNaqueleBloco>

    const assignCols = (groups, left, right) => {
      if (!groups.length) return;
      const blockW = Math.max(1, right - left);
      const colW = blockW / groups.length;
      groups.forEach((g, i) => {
        centers.set(g, left + (i + 0.5) * colW);
        colWMap.set(g, colW);
      });
    };

    // Ambos os blocos ocupam 100% da largura e começam no mesmo alinhamento à esquerda
    assignCols(basicGroups, 0, width);
    assignCols(advGroups,   0, width);
    assignCols(others,      0, width);

    // Dependências (para calcular profundidade local dentro da coluna)
    const preds = new Map(nodes.map(n => [
      n.id,
      new Set([...(n.requires||[]), ...(n.requiresAny||[])])
    ]));

    // Profundidade LOCAL por grupo (só ligações dentro do mesmo grupo)
    const groupDepths = new Map();
    const groupMaxDepth = new Map();

    const allGroups = [...basicGroups, ...advGroups, ...others];
    for (const g of allGroups){
      const groupNodes = byGroup.get(g);
      const depth = new Map();

      const root = groupNodes.find(n => n.type === "principle") || groupNodes[0];
      depth.set(root.id, 0);

      let changed = true, guard = 0;
      while (changed && guard++ < 300) {
        changed = false;
        for (const n of groupNodes){
          if (n.id === root.id) continue;
          const ps = Array.from(preds.get(n.id) || []);
          const inGroup = ps.filter(pid => groupNodes.some(x => x.id === pid));
          const d = inGroup.length
            ? Math.max(...inGroup.map(pid => (depth.get(pid) ?? 0))) + 1
            : 1;
          if (depth.get(n.id) !== d){ depth.set(n.id, d); changed = true; }
        }
      }

      groupDepths.set(g, depth);
      groupMaxDepth.set(g, Math.max(...depth.values()));
    }

    // Quantas linhas o bloco dos básicos ocupa (para posicionar o bloco avançado logo ABAIXO)
    const basicMaxDepth = Math.max(0, ...basicGroups.map(g => groupMaxDepth.get(g) || 0));
    const topBasic = CFG.TOP_BASIC;
    const topAdv   = topBasic + (basicMaxDepth + CFG.GAP_BLOCKS_EXTRA_ROWS) * CFG.GAP_ROWS;

    // (Opcional) garante que o bloco avançado cabe na viewport: se precisar, aumenta GAP_ROWS
    // (para MVP mantemos como está; a altura é o que o container fornecer)

    // --- Posicionamento: anti-overlap por linha + "stagger" vertical ---
    const positions = new Map();

    const placeGroup = (g, baseTop) => {
      const groupNodes = byGroup.get(g);
      if (!groupNodes || !groupNodes.length) return;

      const depth = groupDepths.get(g);
      const colCenterX = centers.get(g);
      const colW = colWMap.get(g) || (width / Math.max(1, allGroups.length));
      const span = colW * CFG.COL_SPAN;

      // Agrupar nós por profundidade local (linhas)
      const rows = {};
      for (const n of groupNodes){
        const d = depth.get(n.id) ?? 0;
        (rows[d] ||= []).push(n);
      }

      Object.keys(rows).sort((a,b)=>Number(a)-Number(b)).forEach(dStr => {
        const d = Number(dStr);
        const row = rows[d];

        // Larguras estimadas + distribuição centralizada sem overlap
        let widths = row.map(n => estimateLabelWidth(n, colW));
        const sum = widths.reduce((a,b)=>a+b, 0);
        const gap = CFG.MIN_COL_GAP;
        let total = sum + gap * Math.max(0, row.length - 1);

        if (total > span) {
          const available = Math.max(60, span - gap * Math.max(0, row.length - 1));
          const scale = Math.max(0.6, available / sum);
          widths = widths.map(w => w * scale);
          total  = widths.reduce((a,b)=>a+b,0) + gap * Math.max(0, row.length - 1);
        }

        let xLeft = colCenterX - total / 2;
        const yBase = baseTop + d * CFG.GAP_ROWS;

        for (let i=0; i<row.length; i++){
          const stagger = ((i % 2) ? +CFG.ROW_STAGGER : -CFG.ROW_STAGGER);
          const w = widths[i];
          const x = xLeft + w/2;
          const y = yBase + stagger;
          positions.set(row[i].id, { x, y });
          xLeft += w + gap;
        }
      });
    };

    // Colocar básicos (em cima) e avançados (logo ABAIXO, alinhados horizontalmente)
    for (const g of basicGroups) placeGroup(g, topBasic);
    for (const g of advGroups)   placeGroup(g,   topAdv);
    for (const g of others)      placeGroup(g,   topAdv); // fallback

    return positions;
  }

  return { compute };
})();
