// persist.js — exporta/importa incluindo posições + salva builds no navegador

(() => {
  const LS_BUILDS = "skilltree:builds:v1";
  const LS_POS    = "skilltree:positions:v1"; // backup de posições entre sessões

  // --------- ADAPTADORES (não quebra nada se Engine não tiver todos) ----------
  function getPositions() {
    if (window.Engine && typeof Engine.getPositions === "function") {
      return Engine.getPositions();
    }
    // fallback: último layout salvo
    try { return JSON.parse(localStorage.getItem(LS_POS) || "{}"); }
    catch { return {}; }
  }
  function setPositions(pos) {
    if (window.Engine && typeof Engine.setPositions === "function") {
      Engine.setPositions(pos || {});
      if (Engine.requestRender) Engine.requestRender();
    }
    localStorage.setItem(LS_POS, JSON.stringify(pos || {}));
  }
  function serializeState() {
    // Esperado: Engine.serialize() retorna estado jogável (nós comprados, pontos etc.)
    if (window.Engine && typeof Engine.serialize === "function") {
      const s = Engine.serialize();
      s.positions = getPositions();
      return s;
    }
    // fallback mínimo para não travar export: só posições
    return { positions: getPositions(), meta: { note: "fallback-export" } };
  }
  function deserializeState(payload) {
    if (!payload) return;
    if (window.Engine && typeof Engine.deserialize === "function") {
      Engine.deserialize(payload);
      if (payload.positions) setPositions(payload.positions);
      if (Engine.requestRender) Engine.requestRender();
    } else if (payload.positions) {
      setPositions(payload.positions);
    }
  }

  // ---------- EXPORT / IMPORT (botões do cabeçalho) ----------
  function wireExportImport() {
    const exportBtn = document.getElementById("exportBtn");
    const importBtn = document.getElementById("importBtn");
    const importFile = document.getElementById("importFile");

    if (exportBtn) {
      exportBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(serializeState(), null, 2)], {type: "application/json"});
        const a = document.createElement("a");
        a.download = `skilltree-build-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }

    if (importBtn && importFile) {
      importBtn.onclick = () => importFile.click();
      importFile.onchange = () => {
        const f = importFile.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const payload = JSON.parse(String(e.target?.result || "{}"));
            deserializeState(payload);
            alert("Build importada com sucesso.");
          } catch (err) {
            console.error(err);
            alert("Arquivo inválido.");
          }
        };
        reader.readAsText(f);
        importFile.value = "";
      };
    }
  }

  // ---------- SALVAR LOCAL (lista no navegador) ----------
  function listBuilds() {
    try { return JSON.parse(localStorage.getItem(LS_BUILDS) || "[]"); }
    catch { return []; }
  }
  function saveBuild(name) {
    const builds = listBuilds();
    const id = Date.now().toString(36);
    const payload = serializeState();
    builds.unshift({ id, name: name || `Build ${builds.length+1}`, savedAt: new Date().toISOString(), payload });
    localStorage.setItem(LS_BUILDS, JSON.stringify(builds.slice(0, 80))); // mantém até 80
    refreshList();
  }
  function deleteBuild(id) {
    const builds = listBuilds().filter(b => b.id !== id);
    localStorage.setItem(LS_BUILDS, JSON.stringify(builds));
    refreshList();
  }
  function loadBuild(id) {
    const b = listBuilds().find(x => x.id === id);
    if (!b) return;
    deserializeState(b.payload);
  }

  // ---------- UI do painel ----------
  function refreshList() {
    const sel = document.getElementById("buildsSelect");
    if (!sel) return;
    const builds = listBuilds();
    sel.innerHTML = "";
    builds.forEach(b => {
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = `${b.name} — ${new Date(b.savedAt).toLocaleString()}`;
      sel.appendChild(o);
    });
  }

  function wireLocalPanel() {
    const saveLocalBtn = document.getElementById("saveLocalBtn"); // atalho no header
    const saveName = document.getElementById("saveName");
    const saveNowBtn = document.getElementById("saveNowBtn");
    const loadBtn = document.getElementById("loadBuildBtn");
    const delBtn = document.getElementById("deleteBuildBtn");
    const select = document.getElementById("buildsSelect");

    refreshList();

    if (saveLocalBtn) {
      saveLocalBtn.onclick = () => {
        const name = prompt("Nome da build:", saveName?.value || "");
        if (name !== null) saveBuild(name.trim());
      };
    }
    if (saveNowBtn) {
      saveNowBtn.onclick = () => {
        const name = (saveName?.value || "").trim();
        saveBuild(name);
        if (saveName) saveName.value = "";
      };
    }
    if (loadBtn) {
      loadBtn.onclick = () => {
        const id = select?.value;
        if (id) loadBuild(id);
      };
    }
    if (delBtn) {
      delBtn.onclick = () => {
        const id = select?.value;
        if (id && confirm("Excluir essa build salva?")) deleteBuild(id);
      };
    }
  }

  // ---------- AUTO-BACKUP de posições ao arrastar ----------
  // Se o Engine expuser um callback de dragEnd, usamos; senão, ouvimos um evento customizado.
  function installAutoPositionBackup() {
    // 1) fallback: a cada 2s salva as posições atuais (barato)
    setInterval(() => {
      try { localStorage.setItem(LS_POS, JSON.stringify(getPositions())); } catch {}
    }, 2000);

    // 2) se a engine emitir evento customizado:
    window.addEventListener("node:dragend", () => {
      try { localStorage.setItem(LS_POS, JSON.stringify(getPositions())); } catch {}
    });
  }

  // boot
  document.addEventListener("DOMContentLoaded", () => {
    wireExportImport();
    wireLocalPanel();
    installAutoPositionBackup();
    // restaura posições do último layout salvo (se a engine ainda não o fez)
    const cached = localStorage.getItem(LS_POS);
    if (cached && (!window.Engine || !Engine.hasAppliedPositions)) {
      try { setPositions(JSON.parse(cached)); } catch {}
    }
  });
})();
