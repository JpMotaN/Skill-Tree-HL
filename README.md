# Skill Tree HL ~ By Jotape
Projeto mínimo para testar uma árvore de habilidades no navegador **sem build step**.

## Como Usar
1. Distribua sua quantidade de pontos;
2. Comece comprando os princípios basicos (Ren, Ten, Zetsu e Hatsu);
3. As habilidades que você pode comprar ficarão verdes, assim como princípíos avançados;
4. Confira os requisitos de cada item passando o mouse por cima;
5. Confira e as tecnicas adiquiridas à esquerda.

## Estrutura
```
skilltree-site/
├─ index.html
├─ css/
│  └─ styles.css
├─ data/
│  └─ skills.json      ← edite este arquivo para moldar sua árvore
└─ js/
   ├─ engine.js        ← regras: compra, requisitos, pontos, stats, export/import
   ├─ layout.js        ← layout simples por tier (colunas)
   └─ app.js           ← renderização SVG + UI
```

## Personalização rápida
- **Pontos máximos**: `data/skills.json` → `ruleset.maxPoints`.
- **Gates por tier**: `ruleset.tierGates` (ex.: `"2": 5` significa “libera Tier 2 após gastar 5 pontos”).
- **Nós**: adicione objetos em `nodes[]`. Campos suportados:
  - `id`, `label`, `tier`, `cost`, `tags[]`, `requires[]`, `effects[]` (`{ stat, op: "add|mul", value }`).
- **Import/Export de build**: botões no topo.

## Próximos passos (A princípio)
- Minimapa, teclas de atalho, desfazer/refazer.
- Efeitos com ordem determinística (add → mul → caps).
- Suporte a **exclusões** (A bloqueia B).
- Salvar build em `localStorage`/IndexedDB.
- Migração 1:1 dos dados do livro para `skills.json`.
