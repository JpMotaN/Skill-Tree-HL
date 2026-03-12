// node tools/build-icon-map.js
// Gera img/icons/map.json baseado em data/skills.json e arquivos em img/icons/

const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'data', 'skills.json');
const ICONS_DIR = path.join(__dirname, '..', 'img', 'icons');
const OUT = path.join(ICONS_DIR, 'map.json');

function deaccent(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function norm(s) {
  return deaccent(String(s||'').toLowerCase())
    .replace(/[’'"]/g,'')
    .replace(/[()]/g,'')
    .replace(/[–—]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
}
function stripPrefix(base) {
  // remove "N - " do começo, se existir
  return base.replace(/^\s*\d+\s*-\s*/, '').trim();
}

const skills = JSON.parse(fs.readFileSync(SKILLS,'utf8'));
const nodes = skills.nodes || [];

const files = fs.readdirSync(ICONS_DIR).filter(f => /\.(webp|png|jpe?g|svg)$/i.test(f));
const fileIndex = new Map();

for (const f of files) {
  const base = path.parse(f).name;               // ex: "1 - Ten"
  const cleaned = norm(stripPrefix(base));       // ex: "ten"
  fileIndex.set(cleaned, f);
}

const map = {};
const missing = [];

for (const n of nodes) {
  const keys = [];
  if (n.id)    keys.push(norm(n.id));
  if (n.label) keys.push(norm(n.label));
  if (n.title) keys.push(norm(n.title));
  if (n.name)  keys.push(norm(n.name));

  let hit = null;
  for (const k of keys) {
    if (fileIndex.has(k)) { hit = fileIndex.get(k); break; }
  }
  if (!hit) {
    // tenta também removendo sufixos comuns tipo " (Reação)"
    for (const k of keys) {
      const k2 = k.replace(/\s*-\s*reacao$|\s*reacao$|\s*reacao\)$/,'').trim();
      if (fileIndex.has(k2)) { hit = fileIndex.get(k2); break; }
    }
  }
  if (hit) {
    map[n.label || n.id] = hit; // mapeia pelo label (ou id)
  } else {
    missing.push(n.label || n.id);
  }
}

fs.writeFileSync(OUT, JSON.stringify(map, null, 2), 'utf8');
console.log('map.json gerado em', OUT);
if (missing.length) {
  console.log('\n⚠ Ícones não encontrados para:');
  for (const m of missing) console.log(' -', m);
}
