// engine.js - validações, estado e cálculos (sem tiers) + estágio de Nen + requiresAny (OU)

const Engine = (() => {
  const state = {
    pointsMax: 0,
    pointsSpent: 0,
    active: new Set(),
    nodesById: new Map(),
    ruleset: null,
    stats: {}
  };

  function init(dataset) {
    state.ruleset = dataset.ruleset || {};
    state.pointsMax = state.ruleset.maxPoints ?? 0;
    state.pointsSpent = 0;
    state.active.clear();
    state.nodesById = new Map(dataset.nodes.map(n => [n.id, structuredClone(n)]));
    recomputeStats();
  }

  function setPointsMax(v){
    const n = Math.max(0, Number(v)||0);
    state.pointsMax = n;
  }

  function reset() {
    state.pointsSpent = 0;
    state.active.clear();
    state.stats = {};
  }

  function stageOrder(name){
    const map = { "Iniciante":1, "Perito":2, "Mestre":3 };
    return map[name]||0;
  }

  function hasAll(reqs){
    for (const r of (reqs||[])) if (!state.active.has(r)) return false;
    return true;
  }
  function hasAny(reqs){
    if (!reqs || reqs.length === 0) return true;
    for (const r of reqs) if (state.active.has(r)) return true;
    return false;
  }

  function canBuy(id) {
    const node = state.nodesById.get(id);
    if (!node) return { ok:false, reason:"Nó inexistente" };
    if (state.active.has(id)) return { ok:false, reason:"Já adquirido" };

    const cost = node.cost ?? 0;
    if (state.pointsSpent + cost > state.pointsMax)
      return { ok:false, reason:"Pontos insuficientes" };

    // requisitos de nós (AND / OR)
    if (!hasAll(node.requires)) return { ok:false, reason:"Faltam requisitos" };
    if (!hasAny(node.requiresAny)) return { ok:false, reason:"Requer um dos pré-requisitos alternativos" };

    // requisito de estágio
    const needStage = node.reqStage;
    if (needStage){
      const have = nenStage().name;
      if (stageOrder(have) < stageOrder(needStage))
        return { ok:false, reason:`Requer estágio ${needStage}` };
    }

    return { ok:true };
  }

  function buy(id) {
    const chk = canBuy(id);
    if (!chk.ok) return chk;
    const node = state.nodesById.get(id);
    state.active.add(id);
    state.pointsSpent += node.cost ?? 0;
    recomputeStats();
    return { ok:true };
  }

  function canRefund(id) {
    if (!state.active.has(id)) return { ok:false, reason:"Nó não está ativo" };
    // não permitir refundo se houver dependentes ativos
    for (const node of state.nodesById.values()) {
      if (!state.active.has(node.id)) continue;
      const all = new Set([...(node.requires||[]), ...(node.requiresAny||[])]);
      if (all.has(id)) return { ok:false, reason:`${node.label} depende deste nó` };
    }
    return { ok:true };
  }

  function refund(id) {
    const chk = canRefund(id);
    if (!chk.ok) return chk;
    const node = state.nodesById.get(id);
    state.active.delete(id);
    state.pointsSpent -= node.cost ?? 0;
    recomputeStats();
    return { ok:true };
  }

  function recomputeStats() {
    const agg = {};
    const apply = (stat, op, value) => {
      if (!(stat in agg)) agg[stat] = 0;
      if (op === "add") agg[stat] += value;
      else if (op === "mul") agg[stat] = (agg[stat]||0) * value || value;
    };
    for (const id of state.active) {
      const node = state.nodesById.get(id);
      for (const eff of (node.effects||[])) apply(eff.stat, eff.op, eff.value);
    }
    state.stats = agg;
  }

  function exportBuild() {
    return {
      pointsMax: state.pointsMax,
      pointsSpent: state.pointsSpent,
      active: Array.from(state.active),
      stats: state.stats
    };
  }

  function importBuild(obj) {
    reset();
    setPointsMax(obj.pointsMax ?? state.pointsMax);
    const want = new Set(obj.active||[]);
    const nodes = Array.from(state.nodesById.values());
    let progressed = true;
    while (progressed && want.size){
      progressed = false;
      for (const n of nodes){
        if (!want.has(n.id)) continue;
        const r = buy(n.id);
        if (r.ok){ want.delete(n.id); progressed = true; }
      }
    }
  }

  // ---- Serialização para persist.js ----
function serialize() {
  // Podemos simplesmente reutilizar o exportBuild existente
  return exportBuild();
}

function deserialize(payload) {
  if (!payload) return;
  // Reutiliza a lógica robusta de import (reseta, aplica pointsMax e compra nós)
  importBuild(payload);
  // Garante stats coerentes
  recomputeStats();
}


  // ---- PN dos Princípios de Nen (para Estágio) ----
  function nenPointsFundamentais(){
    const PRINCIPLES = new Set(["Ten","Zetsu","Ren","Hatsu","Fundamental"]);
    let sum = 0;
    for (const id of state.active){
      const n = state.nodesById.get(id);
      if (!n) continue;
      const tags = n.tags || [];
      if (tags.some(t => PRINCIPLES.has(t))) sum += (n.cost || 0);
    }
    return sum;
  }

  function nenStage(){
    const pn = nenPointsFundamentais();
    if (pn >= 31) return { name:"Mestre", pn };
    if (pn >= 10) return { name:"Perito", pn };
    return { name:"Iniciante", pn }; // 0–9
  }

return {
  state, init, setPointsMax, reset, canBuy, buy, canRefund, refund, recomputeStats,
  exportBuild, importBuild, nenPointsFundamentais, nenStage,
  serialize, deserialize
};

})();
