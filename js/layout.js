// layout.js — colunas por princípio + OFFSET vertical
// Objetivo: básicos (princípios + habilidades) vêm antes; depois avançados.

const Layout = (() => {
  const ORDER = ["Ten","Zetsu","Ren","Hatsu","Gyo","Shu","In","En","Ryu","Ken","Ko"];
  const BASIC = new Set(["Ten","Zetsu","Ren","Hatsu"]);
  const ADV   = new Set(["Gyo","Shu","In","En","Ryu","Ken","Ko"]);

  function groupOf(node){
    const tags = node.tags || [];
    for (const g of ORDER) if (tags.includes(g)) return g;
    return "Outros";
  }

  function compute(nodes, width, height) {
    // --- agrupa por coluna (princípio) ---
    const byGroup = new Map();
    for (const n of nodes){
      const g = groupOf(n);
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(n);
    }

    // ordem das colunas existentes
    const groups = ORDER.filter(g => byGroup.has(g));
    if (byGroup.has("Outros")) groups.push("Outros");

    const colW = width / Math.max(1, groups.length);

    // dependências (AND + OR)
    const preds = new Map(nodes.map(n => [
      n.id,
      new Set([...(n.requires||[]), ...(n.requiresAny||[])])
    ]));

    // --- profundidade LOCAL por grupo (apenas entre nós do mesmo grupo) ---
    const groupDepths = new Map(); // Map<group, Map<nodeId, depth>>
    const groupMaxDepth = new Map(); // Map<group, maxDepth>
    for (const g of groups){
      const groupNodes = byGroup.get(g);
      const depth = new Map();

      // raiz preferida: princípio da coluna (se existir)
      const root = groupNodes.find(n => n.type === "principle") || groupNodes[0];
      depth.set(root.id, 0);

      let changed = true, guard = 0;
      while (changed && guard++ < 200) {
        changed = false;
        for (const n of groupNodes){
          if (n.id === root.id) continue;
          const ps = Array.from(preds.get(n.id) || []);
          // considere só predecessores dentro do mesmo grupo
          const inGroup = ps.filter(pid => groupNodes.some(x => x.id === pid));
          let d;
          if (inGroup.length){
            d = Math.max(...inGroup.map(pid => (depth.get(pid) ?? 0))) + 1;
          } else {
            d = 1; // sem predecessor no grupo: logo abaixo do princípio
          }
          if (depth.get(n.id) !== d){ depth.set(n.id, d); changed = true; }
        }
      }

      groupDepths.set(g, depth);
      groupMaxDepth.set(g, Math.max(...depth.values()));
    }

    // --- OFFSET vertical global: empurra grupos avançados para depois dos básicos ---
    const basicMax = Math.max(
      0,
      ...Array.from(groupMaxDepth.entries())
        .filter(([g]) => BASIC.has(g))
        .map(([_, m]) => m)
    );
    //  +1 de respiro entre blocos
    const offsetForGroup = (g) => ADV.has(g) ? (basicMax + 1) : 0;

    // precisamos do "max depth global" já com offset para calcular o espaçamento (yGap)
    const globalMaxDepth = Math.max(
      1,
      ...groups.map(g => (groupMaxDepth.get(g) || 0) + offsetForGroup(g))
    );
    const yGap = height / (globalMaxDepth + 2);

    // --- posições finais ---
    const positions = new Map();
    groups.forEach((g, gi) => {
      const groupNodes = byGroup.get(g);
      if (!groupNodes || !groupNodes.length) return;

      const colCenterX = gi * colW + colW * 0.5;
      const span = colW * 0.65;

      // agrupa por (depthLocal + offset)
      const depth = groupDepths.get(g);
      const rows = {};
      const off = offsetForGroup(g);
      for (const n of groupNodes){
        const dGlobal = (depth.get(n.id) ?? 0) + off;
        (rows[dGlobal] ||= []).push(n);
      }

      Object.keys(rows).sort((a,b)=>Number(a)-Number(b)).forEach(dStr => {
        const d = Number(dStr);
        const row = rows[d];
        const count = row.length;
        for (let i=0; i<count; i++){
          const x = colCenterX + ((i + 1) - (count + 1)/2) * (span / Math.max(count,1));
          const y = (d + 1) * yGap;
          positions.set(row[i].id, { x, y });
        }
      });
    });

    return positions;
  }

  return { compute };
})();
