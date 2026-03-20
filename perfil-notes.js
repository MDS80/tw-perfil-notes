// ==UserScript==
// @name         Filtros de Perfil por NOTAS
// @namespace    http://tampermonkey.net/
// @version      1.5.7
// @description  Notes scanner + filtro por continentes K + muralha/torre + pontos da aldeia + filtro X/Y
// @author       You
// @match        *://*.tribalwars.com.pt/*
// @match        *://*.tribalwars.net/*
// @match        *://*.tribalwars.es/*
// @match        *://*.tribalwars.com.br/*
// @grant        none
// @run-at       document-idle
// @icon https://raw.githubusercontent.com/MDS80/tw-perfil-notes/main/logo MDS scripts.png
// ==/UserScript==

(function () {
    'use strict';

    function waitForTW(cb) {
        const start = Date.now();
        const max = 20000;
        const t = setInterval(() => {
            const hasJQ = typeof window.$ !== 'undefined';
            const hasUI = typeof window.UI !== 'undefined';
            const hasTable = document.querySelector('#villages_list');
            if (hasJQ && hasUI && hasTable) { clearInterval(t); cb(); return; }
            if (Date.now() - start > max) { clearInterval(t); console.warn('[TW Script] Timeout.'); }
        }, 200);
    }

    waitForTW(init);

    function init() {
        if (window.__pp_notes_initialized) return;
        window.__pp_notes_initialized = true;

        const translations = {
            en: {
                notes: 'Notes', offensiveCount: 'Offensive villages count',
                defensiveCount: 'Defensive villages count', unknownCount: 'Unknown/unclassified villages count',
                pendingCount: 'Villages not yet analyzed', scanAll: 'Scan',
                scanAllTooltip: 'Load notes for all villages automatically',
                filterOff: 'OFF', filterOffTooltip: 'Show only offensive villages',
                filterDef: 'DEF', filterDefTooltip: 'Show only defensive villages',
                filterUnknown: '?', filterUnknownTooltip: 'Show only unknown villages',
                showAll: 'All', showAllTooltip: 'Show all villages',
                copyCoords: 'Copy Visible Coords', warningTitle: 'Warning:',
                warningMessage: 'Only {0} of {1} villages loaded. Click here to load all villages before scanning.',
                loadAll: 'Load All', villageIdNotFound: 'Village ID not found',
                gameDataNotAvailable: 'Game data not available',
                noNotesFound: 'No notes found for this village', failedToLoad: 'Failed to load note',
                copied: 'Copied {0} coordinates', villageNotes: 'Village Notes - {0}',
                scanConfirmMessage: 'This will load notes for all villages. This may take several minutes. Continue?',
                scanProgress: '{0}/{1} - {2}%', loadingAllVillages: 'Loading all villages...',
                scanningVillages: 'Scanning villages...'
            },
            pt_PT: {
                notes: 'Notas', offensiveCount: 'Contagem de aldeias ofensivas',
                defensiveCount: 'Contagem de aldeias defensivas',
                unknownCount: 'Contagem de aldeias desconhecidas/não classificadas',
                pendingCount: 'Aldeias ainda não analisadas', scanAll: 'Scan',
                scanAllTooltip: 'Carregar notas de todas as aldeias automaticamente',
                filterOff: 'OFF', filterOffTooltip: 'Mostrar apenas aldeias ofensivas',
                filterDef: 'DEF', filterDefTooltip: 'Mostrar apenas aldeias defensivas',
                filterUnknown: '?', filterUnknownTooltip: 'Mostrar apenas aldeias desconhecidas',
                showAll: 'Todas', showAllTooltip: 'Mostrar todas as aldeias',
                copyCoords: 'Copiar Coords Visíveis', warningTitle: 'Aviso:',
                warningMessage: 'Apenas {0} de {1} aldeias carregadas. Clique aqui para carregar todas as aldeias antes de analisar.',
                loadAll: 'Carregar Todas', villageIdNotFound: 'ID da aldeia não encontrado',
                gameDataNotAvailable: 'Dados do jogo não disponíveis',
                noNotesFound: 'Nenhuma nota encontrada para esta aldeia', failedToLoad: 'Falha ao carregar nota',
                copied: 'Copiadas {0} coordenadas', villageNotes: 'Notas da Aldeia - {0}',
                scanConfirmMessage: 'Isto irá carregar notas de todas as aldeias. Pode demorar vários minutos. Continuar?',
                scanProgress: '{0}/{1} - {2}%', loadingAllVillages: 'A carregar todas as aldeias...',
                scanningVillages: 'A analisar aldeias...'
            }
        };

        function getTranslation(key, ...args) {
            const locale = (typeof game_data !== 'undefined' && game_data.locale) || 'en';
            const lang = translations[locale] || translations.en;
            let text = lang[key] || translations.en[key] || key;
            args.forEach((arg, index) => { text = text.replace(`{${index}}`, arg); });
            return text;
        }

        window.pp_settings = window.pp_settings || { noteStates: {}, popupPosition: null, wallLevels: {}, towerLevels: {} };

        function classifyVillage(content) {
            const text = content.toLowerCase();
            if (text.includes('ofensiva') || text.includes('off')) return 'off';
            if (text.includes('defensiva') || text.includes('def')) return 'def';
            return 'no-data';
        }

        function getLabel(type) {
            if (type === 'off') return '⚔️';
            if (type === 'def') return '🛡️';
            if (type === 'no-data') return '❓';
            if (type === 'loading') return '...';
            return '⏳';
        }

        function loadSettings() {
            const saved = localStorage.getItem('pp_settings');
            if (saved) { try { const parsed = JSON.parse(saved); window.pp_settings = { ...window.pp_settings, ...parsed }; } catch (e) {} }
        }

        function saveSettings() {
            try { localStorage.setItem('pp_settings', JSON.stringify(window.pp_settings)); } catch (e) {}
        }

        loadSettings();

        $('<style>').text(`
            /* ── Note icons ── */
            .pp-note-icon {
                font-size:12px; display:inline-block; cursor:pointer;
                padding:2px 8px; border-radius:3px; transition:all .2s;
                font-weight:bold; letter-spacing:.3px;
            }
            .pp-note-icon:hover { transform:scale(1.08); }
            .pp-note-icon.not-loaded { background:#e8dcc8; color:#8a7a60; border:1px solid #c8b890; }
            .pp-note-icon.loading    { background:#d4900a; color:#fff; border:1px solid #a06808; animation:pp-pulse 1s infinite; }
            .pp-note-icon.off        { background:#7a1515; color:#ffd0d0; border:1px solid #5a0a0a; }
            .pp-note-icon.def        { background:#153060; color:#c8dcff; border:1px solid #0a1e44; }
            .pp-note-icon.no-data    { background:#505048; color:#c8c8b8; border:1px solid #383830; }
            @keyframes pp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

            /* ── Panel ── */
            .pp-panel {
                margin:6px 0;
                border:1px solid #b89050;
                border-top:3px solid #c8952a;
                border-radius:4px;
                overflow:hidden;
                font-family:Verdana,sans-serif;
                font-size:11px;
                box-shadow:0 2px 6px rgba(100,60,0,.2);
                width:100%; box-sizing:border-box;
            }

            /* ── Header ── */
            .pp-row-header {
                display:flex; align-items:center; gap:6px; flex-wrap:nowrap;
                padding:7px 12px;
                background:linear-gradient(180deg,#6b3a12 0%,#4a2408 100%);
                border-bottom:2px solid #c8952a;
                min-width:0; overflow-x:auto;
            }
            .pp-row-header .pp-label {
                font-size:10px; font-weight:bold; color:#e8c878;
                letter-spacing:1.5px; text-transform:uppercase; flex:0 0 auto;
            }

            /* ── Stat counters ── */
            .pp-stat {
                display:inline-flex; align-items:center; gap:3px;
                font-size:11px; padding:2px 9px; border-radius:3px;
                font-weight:bold; min-width:38px; justify-content:center;
                flex:0 0 auto;
            }
            .pp-stat.off     { background:#7a1515; color:#ffd0d0; border:1px solid #5a0a0a; }
            .pp-stat.def     { background:#153060; color:#c8dcff; border:1px solid #0a1e44; }
            .pp-stat.nd      { background:#484840; color:#c0c0b0; border:1px solid #303028; }
            .pp-stat.pending { background:#5a5040; color:#c8c0a0; border:1px solid #3a3028; }

            /* ── Scan & Copy ── */
            .pp-btn-scan {
                font-size:10px; padding:3px 11px;
                background:linear-gradient(180deg,#9a1c1c,#6a1010);
                border:1px solid #4a0808; border-bottom:2px solid #380606;
                border-radius:3px; color:#ffe0e0; font-weight:bold;
                cursor:pointer; transition:all .12s;
                white-space:nowrap; flex:0 0 auto;
            }
            .pp-btn-scan:hover { background:linear-gradient(180deg,#b82424,#8a1414); color:#fff; }

            .pp-btn-copy {
                font-size:10px; padding:3px 11px;
                background:linear-gradient(180deg,#2e6818,#1e4810);
                border:1px solid #184010; border-bottom:2px solid #102808;
                border-radius:3px; color:#c8f0a8; font-weight:bold;
                cursor:pointer; transition:all .12s;
                white-space:nowrap; flex:0 0 auto; margin-left:auto;
            }
            .pp-btn-copy:hover { background:linear-gradient(180deg,#3a8020,#286018); color:#e8ffd8; }

            /* ── Minimize ── */
            .pp-btn-minimize {
                font-size:12px; line-height:1; padding:2px 7px; margin-left:4px;
                background:rgba(0,0,0,.2); border:1px solid rgba(255,220,120,.35);
                border-radius:3px; color:#e8c878; cursor:pointer;
                transition:all .15s; flex:0 0 auto; user-select:none;
            }
            .pp-btn-minimize:hover { background:rgba(0,0,0,.38); color:#fff; border-color:rgba(255,220,120,.7); }

            .pp-panel-body { overflow:hidden; transition:max-height .35s ease; }

            /* ── Filter rows ── */
            .pp-row-filters,
            .pp-row-k,
            .pp-row-buildings,
            .pp-row-coords {
                display:flex; align-items:center; gap:5px; flex-wrap:nowrap;
                padding:5px 10px; overflow-x:auto;
                border-top:1px solid #d8b880;
            }
            .pp-row-filters            { background:#faf3e3; }
            .pp-row-filters.pp-attacks { background:#f5edd8; }
            .pp-row-k                  { background:#faf3e3; min-height:30px; }
            .pp-row-buildings          { background:#f5edd8; min-height:30px; }
            .pp-row-coords             { background:#faf3e3; align-items:flex-start; min-height:34px; padding-top:6px; }

            .pp-filter-label {
                font-size:9px; font-weight:bold; color:#8a5820;
                text-transform:uppercase; letter-spacing:.8px;
                flex:0 0 auto; min-width:max-content; opacity:.9;
            }

            /* ── Generic button base ── */
            .pp-btn {
                font-size:10px; padding:3px 9px;
                border-radius:3px; font-weight:bold; cursor:pointer;
                transition:all .12s; user-select:none;
                flex:0 0 auto; white-space:nowrap;
                border-bottom:2px solid rgba(0,0,0,.25);
            }

            #filter-off.pp-btn       { background:#8a1818; border-top:1px solid #6a1010; border-left:1px solid #6a1010; border-right:1px solid #6a1010; color:#ffe0e0; }
            #filter-off.pp-btn:hover { background:#a82020; }
            #filter-off.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #ff9090; filter:brightness(.88); }

            #filter-def.pp-btn       { background:#184a8a; border-top:1px solid #103070; border-left:1px solid #103070; border-right:1px solid #103070; color:#d0e8ff; }
            #filter-def.pp-btn:hover { background:#2060aa; }
            #filter-def.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #88bbff; filter:brightness(.88); }

            #filter-nd.pp-btn        { background:#4a4a42; border-top:1px solid #323230; border-left:1px solid #323230; border-right:1px solid #323230; color:#d0d0c0; }
            #filter-nd.pp-btn:hover  { background:#606058; }
            #filter-nd.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #c0c0b0; filter:brightness(.88); }

            #filter-attack-mine.pp-btn       { background:#6a1888; border-top:1px solid #4a1068; border-left:1px solid #4a1068; border-right:1px solid #4a1068; color:#ead0ff; }
            #filter-attack-mine.pp-btn:hover { background:#8020a8; }
            #filter-attack-mine.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #cc88ff; filter:brightness(.88); }

            #filter-attack-ally.pp-btn       { background:#184a8a; border-top:1px solid #103070; border-left:1px solid #103070; border-right:1px solid #103070; color:#d0e8ff; }
            #filter-attack-ally.pp-btn:hover { background:#2060aa; }
            #filter-attack-ally.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #88bbff; filter:brightness(.88); }

            #filter-attack-none.pp-btn       { background:#286818; border-top:1px solid #184a10; border-left:1px solid #184a10; border-right:1px solid #184a10; color:#c8f0a8; }
            #filter-attack-none.pp-btn:hover { background:#347a20; }
            #filter-attack-none.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #88dd88; filter:brightness(.88); }

            #filter-has-tower.pp-btn       { background:#7a5018; border-top:1px solid #5a3808; border-left:1px solid #5a3808; border-right:1px solid #5a3808; color:#ffe8c0; }
            #filter-has-tower.pp-btn:hover { background:#8a6020; }
            #filter-has-tower.pp-btn.active-filter { box-shadow:inset 0 2px 4px rgba(0,0,0,.4), 0 0 0 2px #ffcc88; filter:brightness(.88); }

            .pp-btn-reset {
                font-size:10px; padding:3px 9px; margin-left:auto;
                background:#f8f0e4; border:1px solid #c0392b;
                border-bottom:2px solid #901e15;
                border-radius:3px; color:#c0392b; font-weight:bold;
                cursor:pointer; transition:all .12s; flex:0 0 auto; white-space:nowrap;
            }
            .pp-btn-reset:hover { background:#c0392b; color:#fff; }

            /* ── K continent tags ── */
            .k-tag {
                font-size:10px; padding:2px 10px; border-radius:10px;
                cursor:pointer; font-weight:bold;
                background:#f0e8d4; border:1px solid #b89050; color:#7a4a18;
                transition:all .15s; user-select:none; flex:0 0 auto; white-space:nowrap;
            }
            .k-tag:hover { background:#e4d4b4; border-color:#9a7030; }
            .k-tag.active-filter {
                background:#7a4a18; color:#ffe8b8; border-color:#5a3008;
                box-shadow:0 0 0 2px #c8952a;
            }

            /* ── Building inputs ── */
            .pp-building-lvl-label {
                display:inline-block; margin-left:3px; font-size:10px;
                background:rgba(0,0,0,.18); border-radius:3px;
                padding:0 4px; min-width:14px; text-align:center;
            }
            .pp-building-lvl-label:empty { display:none; }

            .pp-building-input {
                width:62px; padding:2px 5px; font-size:11px; font-weight:bold;
                border:1px solid #b89050; border-radius:3px; text-align:center;
                color:#5a3008; background:#fff; flex:0 0 auto;
            }
            .pp-building-input:focus { outline:2px solid #c8952a; border-color:#c8952a; }

            .pp-btn-clear-buildings {
                font-size:10px; padding:3px 8px;
                background:#f8f0e4; border:1px solid #c0392b;
                border-bottom:2px solid #901e15;
                border-radius:3px; color:#c0392b; font-weight:bold;
                cursor:pointer; transition:all .12s; flex:0 0 auto; white-space:nowrap;
            }
            .pp-btn-clear-buildings:hover { background:#c0392b; color:#fff; }

            .pp-building-status {
                font-size:10px; font-style:italic; color:#9a7a40;
                margin-left:4px; flex:0 0 auto; white-space:nowrap;
            }

            .pp-building-toolbar-btn.pp-btn {
                background:#f0e4c4; border:1px solid #b89050;
                border-bottom:2px solid #8a6830; color:#5a3008;
            }
            .pp-building-toolbar-btn.pp-btn:hover { background:#e4d4a8; }
            .pp-building-toolbar-btn.pp-btn.active-filter {
                background:#7a4a18; color:#ffe8b8; border-color:#5a3008;
                box-shadow:0 0 0 2px #c8952a; border-bottom-color:#3a1808;
            }

            /* ── Progress ── */
            .pp-progress-wrap { padding:5px 10px; background:#f0e8d0; border-top:1px solid #d8b880; display:none; }
            .pp-progress-wrap.active { display:block; }
            .pp-progress-bar-text { font-size:10px; color:#5a3e1b; margin-bottom:4px; text-align:center; font-style:italic; }
            .pp-progress-track { height:5px; background:#d6b47a; border-radius:3px; overflow:hidden; }
            .pp-progress-fill { height:100%; width:0%; background:linear-gradient(90deg,#8B4513,#c8952a); border-radius:3px; transition:width .3s; }
            .pp-scan-done { display:none; margin-top:5px; padding:4px 10px; border-radius:3px; background:#d4edda; border:1px solid #4a7c59; color:#1b3a27; font-size:11px; font-weight:bold; text-align:center; }
            .pp-scan-done.visible { display:block; }

            /* ── Building cells in table ── */
            .pp-building-cell {
                text-align:center; font-size:11px; font-weight:bold;
                padding:2px 6px; border-radius:3px; cursor:pointer;
                min-width:28px; display:inline-block; user-select:none; transition:filter .15s;
            }
            .pp-building-cell:hover { filter:brightness(1.15); }
            .pp-building-cell.wall-high  { background:#4e2a04; color:#f5e6c8; }
            .pp-building-cell.wall-mid   { background:#8B4513; color:#f5e6c8; }
            .pp-building-cell.wall-low   { background:#c8935a; color:#fff; }
            .pp-building-cell.wall-zero  { background:#e8d5b8; color:#7a5c3a; }
            .pp-building-cell.wall-none  { background:transparent; color:#bbb; font-weight:normal; }
            .pp-building-cell.tower-yes  { background:#286818; color:#d8f8c0; }
            .pp-building-cell.tower-zero { background:#e4e8d4; color:#6a7850; }
            .pp-building-cell.tower-none { background:transparent; color:#bbb; font-weight:normal; }

            /* ── Level picker popup ── */
            .pp-level-picker {
                position:fixed; z-index:10002; background:#faf3e3;
                border:1px solid #b89050; border-top:3px solid #c8952a;
                border-radius:4px; padding:10px;
                box-shadow:0 4px 16px rgba(100,60,0,.3);
                display:flex; flex-direction:column; gap:0; min-width:230px;
            }
            .pp-op-wrap { display:flex; flex-direction:column; gap:3px; margin-bottom:4px; }
            .pp-op-btn { font-size:11px; padding:4px 8px; border-radius:3px; cursor:pointer; font-weight:bold; text-align:left; background:#f0e8d4; border:1px solid #c8a870; color:#5a3008; transition:all .1s; }
            .pp-op-btn:hover { background:#e4d4b4; }
            .pp-op-btn.active { background:#7a4a18; color:#ffe8b8; border-color:#5a3008; }
            .pp-lvl-grid { display:flex; flex-wrap:wrap; gap:3px; }
            .pp-level-picker .pp-lvl-btn { font-size:11px; padding:3px 7px; border-radius:3px; cursor:pointer; font-weight:bold; background:#f0e8d4; border:1px solid #c8a870; color:#5a3008; transition:all .1s; }
            .pp-level-picker .pp-lvl-btn:hover { background:#e4d4b4; }
            .pp-level-picker .pp-lvl-btn.active { background:#7a4a18; color:#ffe8b8; border-color:#5a3008; }
            .pp-level-picker .pp-lvl-clear { width:100%; font-size:10px; padding:3px; border-radius:3px; cursor:pointer; background:#f8f0e4; border:1px solid #c0392b; color:#c0392b; font-weight:bold; text-align:center; margin-top:6px; }
            .pp-level-picker .pp-lvl-clear:hover { background:#c0392b; color:#fff; }

            /* ── Load warning ── */
            .pp-load-warning {
                background:#f8ddd0; border:1px solid #e0a880; border-left:3px solid #c05820;
                border-radius:3px; padding:8px 12px; margin-bottom:6px; color:#7a3010;
                font-size:11px; cursor:pointer; display:flex; align-items:center; gap:8px;
            }
            .pp-load-warning:hover { background:#f0ccc0; }
            .pp-load-warning-icon { font-size:16px; }
            .pp-load-warning-text { flex:1; }
            .pp-load-warning-button { padding:3px 8px; background:#c05820; border:1px solid #8a3808; border-radius:3px; color:#fff; font-weight:bold; font-size:11px; white-space:nowrap; }

            /* ── Coords filter ── */
            .pp-coord-group { display:inline-flex; flex-direction:column; align-items:center; gap:1px; flex:0 0 auto; }
            .pp-coord-group-inner { display:inline-flex; align-items:center; gap:3px; }
            .pp-coord-arrow { font-size:13px; line-height:1; opacity:.65; min-height:14px; text-align:center; }
            .pp-coord-op { font-size:11px; padding:2px 4px; border:1px solid #b89050; border-radius:3px; background:#fff; color:#5a3008; font-weight:bold; cursor:pointer; flex:0 0 auto; }
            .pp-coord-input { width:52px; padding:2px 4px; font-size:11px; font-weight:bold; border:1px solid #b89050; border-radius:3px; text-align:center; color:#5a3008; background:#fff; flex:0 0 auto; }
            .pp-coord-input:focus { outline:2px solid #c8952a; border-color:#c8952a; }
            .pp-coord-status { font-size:10px; font-style:italic; color:#9a7a40; margin-left:4px; flex:0 0 auto; white-space:nowrap; align-self:flex-start; margin-top:4px; }
            .pp-coord-sep { font-size:13px; color:#8B4513; font-weight:bold; flex:0 0 auto; padding:0 5px; opacity:.5; align-self:flex-start; margin-top:3px; }

            /* ── Note popup ── */
            .note-popup {
                position:fixed; background:#faf3e3;
                border:1px solid #b89050; border-top:3px solid #c8952a;
                border-radius:4px; padding:0; width:450px; max-height:70vh;
                overflow:hidden; z-index:10000;
                box-shadow:0 4px 20px rgba(100,60,0,.4); display:flex; flex-direction:column;
            }
            .note-popup-header {
                font-size:14px; font-weight:bold; padding:9px 14px;
                background:linear-gradient(180deg,#6b3a12,#4a2408);
                color:#f0d090; cursor:move; user-select:none;
                display:flex; justify-content:space-between; align-items:center;
                border-bottom:2px solid #c8952a;
            }
            .note-popup-close { cursor:pointer; font-size:20px; line-height:1; padding:0 4px; color:#c8a860; }
            .note-popup-close:hover { color:#ff8080; }
            .note-popup-content { padding:14px; overflow-y:auto; flex:1; }
        `).appendTo('head');

        window.pp_rows = window.pp_rows || [];

        function extractCoordsFromRow($row) {
            let coords = null;
            $row.find('td').each(function () {
                const text = $(this).text().trim();
                const match = text.match(/^(\d+)\|(\d+)$/) || text.match(/(\d+)\|(\d+)/);
                if (match) { coords = `${match[1]}|${match[2]}`; return false; }
            });
            return coords;
        }

        function extractPointsFromRow($row) {
            let points = null;
            $row.find('td').each(function () {
                const txt = $(this).text().trim();
                if (/^\d+\|\d+$/.test(txt)) {
                    const $next = $(this).next('td');
                    if ($next.length) {
                        const raw = $next.text().trim().replace(/\./g,'').replace(/\s/g,'').replace(/[^\d]/g,'');
                        const val = parseInt(raw, 10);
                        if (!isNaN(val)) points = val;
                    }
                    return false;
                }
            });
            return points;
        }

        function getContinentFromCoords(coords) {
            const m = coords && coords.match(/^(\d+)\|(\d+)$/);
            if (!m) return null;
            return `K${m[2][0]}${m[1][0]}`;
        }

        function getXYFromCoords(coords) {
            const m = coords && coords.match(/^(\d+)\|(\d+)$/);
            if (!m) return null;
            return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
        }

        function getTotalVillagesCount() {
            const headerText = $('#villages_list > thead > tr > th[colspan="2"]').text();
            const match = headerText.match(/\((\d+)\)/);
            return match ? parseInt(match[1], 10) : 0;
        }

        function updateStats() {
            const offCount = $('#villages_list .pp-note-icon.off').length;
            const defCount = $('#villages_list .pp-note-icon.def').length;
            const ndCount  = $('#villages_list .pp-note-icon.no-data').length;
            const totalCount = getTotalVillagesCount();
            const pendingCount = Math.max(0, totalCount - offCount - defCount - ndCount);
            $('#stat-off').text(offCount);
            $('#stat-def').text(defCount);
            $('#stat-nd').text(ndCount);
            $('#stat-pending').text(pendingCount);
        }

        function getBuildingCellHtml(villageId, type) {
            const levels = type === 'wall' ? (window.pp_settings.wallLevels || {}) : (window.pp_settings.towerLevels || {});
            const lvl = levels[villageId];
            const base = ` data-vid="${villageId}" data-type="${type}"`;
            if (lvl === undefined) return `<span class="pp-building-cell ${type}-none" title="Sem informação — faça scan"${base}>–</span>`;
            let cls = '';
            if (type === 'wall') {
                if (lvl >= 15) cls = 'wall-high';
                else if (lvl >= 5) cls = 'wall-mid';
                else if (lvl > 0) cls = 'wall-low';
                else cls = 'wall-zero';
            } else { cls = lvl > 0 ? 'tower-yes' : 'tower-zero'; }
            const icon = type === 'wall' ? '🏰' : '🗼';
            return `<span class="pp-building-cell ${cls}" title="Clique para filtrar"${base}>${icon}${lvl}</span>`;
        }

        function initializeNoteIcons() {
            const $thead = $('#villages_list > thead > tr');
            if ($thead.find('th.pp-th-notes').length === 0) {
                $thead.each(function () {
                    $(this).append('<th class="pp-th-wall" style="text-align:center;font-size:11px;">🏰 Muralha</th>');
                    $(this).append('<th class="pp-th-tower" style="text-align:center;font-size:11px;">🗼 Torre</th>');
                    $(this).append('<th class="pp-th-notes" style="text-align:center;">' + getTranslation('notes') + '</th>');
                });
            }
            $('#villages_list > tbody > tr').each(function () {
                const $row = $(this);
                if ($row.find('.pp-note-icon').length > 0) {
                    const vid = $row.find('.pp-note-icon').data('village-id') + '';
                    $row.find('.pp-building-cell[data-type="wall"]').replaceWith(getBuildingCellHtml(vid, 'wall'));
                    $row.find('.pp-building-cell[data-type="tower"]').replaceWith(getBuildingCellHtml(vid, 'tower'));
                    return;
                }
                const $link = $row.find('td:first a');
                let villageId = null;
                if ($link.length > 0) { const m = ($link.attr('href')||'').match(/id=(\d+)/); if (m) villageId = m[1]; }
                const savedState = window.pp_settings.noteStates[villageId] || 'not-loaded';
                const $wallTd  = $('<td style="text-align:center;"></td>').html(getBuildingCellHtml(villageId, 'wall'));
                const $towerTd = $('<td style="text-align:center;"></td>').html(getBuildingCellHtml(villageId, 'tower'));
                const $icon = $(`<span class="pp-note-icon ${savedState}" data-village-id="${villageId}">${getLabel(savedState)}</span>`);
                const $newTd = $('<td style="text-align:center;cursor:pointer;"></td>').append($icon);
                $row.append($wallTd).append($towerTd).append($newTd);
                if (villageId) window.pp_settings.noteStates[villageId] = savedState;
                window.pp_rows.push({ row: $row, id: villageId, icon: $icon });
            });
            updateStats();
        }

        window.pp_activeFilter = window.pp_activeFilter || {
            types: new Set(), kList: [], wallFilter: null, towerFilter: null,
            pointsFilter: null, attackFilter: null, coordXFilter: null, coordYFilter: null
        };

        function getAttackState($row) {
            const mine = $row.find('span.command-attack').not('.command-attack-ally').length > 0;
            const ally = $row.find('span.command-attack-ally').length > 0;
            return { mine, ally };
        }

        function applyFilters(types, kList, wallFilter, towerFilter, pointsFilter, attackFilter, coordXFilter, coordYFilter) {
            if (types === 'reset') {
                window.pp_activeFilter = { types: new Set(), kList: [], wallFilter: null, towerFilter: null, pointsFilter: null, attackFilter: null, coordXFilter: null, coordYFilter: null };
            } else {
                if (types !== undefined)       window.pp_activeFilter.types       = types;
                if (kList !== undefined)        window.pp_activeFilter.kList        = kList;
                if (wallFilter !== undefined)   window.pp_activeFilter.wallFilter   = wallFilter;
                if (towerFilter !== undefined)  window.pp_activeFilter.towerFilter  = towerFilter;
                if (pointsFilter !== undefined) window.pp_activeFilter.pointsFilter = pointsFilter;
                if (attackFilter !== undefined) window.pp_activeFilter.attackFilter = attackFilter;
                if (coordXFilter !== undefined) window.pp_activeFilter.coordXFilter = coordXFilter;
                if (coordYFilter !== undefined) window.pp_activeFilter.coordYFilter = coordYFilter;
            }
            const { types: aTypes, kList: aK, wallFilter: aWall, towerFilter: aTower,
                    pointsFilter: aPoints, attackFilter: aAttack, coordXFilter: aX, coordYFilter: aY } = window.pp_activeFilter;
            const kSet = aK.length > 0 ? new Set(aK) : null;
            const noTypeFilter = aTypes.size === 0;

            window.pp_rows.forEach(r => {
                const state = window.pp_settings.noteStates[r.id];
                const typeMatch = noTypeFilter || (aTypes.has('no-data') && state !== 'off' && state !== 'def') || aTypes.has(state);
                const rowCoords = extractCoordsFromRow(r.row);
                const kMatch = !kSet || (rowCoords && kSet.has(getContinentFromCoords(rowCoords)));
                const wallLvl  = (window.pp_settings.wallLevels  || {})[r.id];
                const towerLvl = (window.pp_settings.towerLevels || {})[r.id];
                const rowPoints = extractPointsFromRow(r.row);
                const xy = rowCoords ? getXYFromCoords(rowCoords) : null;

                function bMatch(lvl, f) {
                    if (!f) return true; if (lvl === undefined) return false;
                    if (f.op === '>=') return lvl >= f.val; if (f.op === '<=') return lvl <= f.val; if (f.op === '=') return lvl === f.val; return true;
                }
                function pMatch(pts, f) {
                    if (!f) return true; if (pts == null || isNaN(pts)) return false;
                    if (f.mode === 'max') return pts <= f.value; if (f.mode === 'min') return pts >= f.value;
                    if (f.mode === 'between') return pts >= f.min && pts <= f.max; return true;
                }
                function cMatch(xy, f, axis) {
                    if (!f) return true; if (!xy) return false;
                    const v = axis === 'x' ? xy.x : xy.y;
                    if (f.op === '>=') return v >= f.val; if (f.op === '<=') return v <= f.val; return true;
                }

                let attackOk = true;
                if (aAttack) {
                    const atk = getAttackState(r.row);
                    if (aAttack === 'mine') attackOk = atk.mine;
                    else if (aAttack === 'ally') attackOk = atk.ally;
                    else if (aAttack === 'none') attackOk = !atk.mine && !atk.ally;
                }

                const show = typeMatch && kMatch && bMatch(wallLvl, aWall) && bMatch(towerLvl, aTower) &&
                             pMatch(rowPoints, aPoints) && attackOk && cMatch(xy, aX, 'x') && cMatch(xy, aY, 'y');
                if (show) r.row.show(); else r.row.hide();
            });
        }

        function toggleType(type) {
            const types = new Set(window.pp_activeFilter.types);
            if (types.has(type)) types.delete(type); else types.add(type);
            applyFilters(types);
        }

        function checkAllVillagesLoaded() {
            const totalCount = getTotalVillagesCount();
            const displayedCount = $('#villages_list > tbody > tr').length;
            const hasLoadAllLink = $('#villages_list > tbody > tr:last').find('a').filter(function () {
                const txt = ($(this).text()||'').toLowerCase(), oc = $(this).attr('onclick')||'';
                return txt.includes('todas') || txt.includes('all') || oc.includes('getAllVillages');
            }).length > 0;
            return !hasLoadAllLink && displayedCount >= totalCount;
        }

        function clickLoadAllVillages() {
            const loadAllLink = $('#villages_list > tbody > tr:last').find('a').filter(function () {
                const txt = ($(this).text()||'').toLowerCase(), oc = $(this).attr('onclick')||'';
                return txt.includes('todas') || txt.includes('all') || oc.includes('getAllVillages');
            });
            if (loadAllLink.length > 0) { loadAllLink[0].click(); return true; }
            if (typeof UI !== 'undefined' && UI.ErrorMessage) UI.ErrorMessage('Não encontrei o botão para carregar todas as aldeias.');
            return false;
        }

        function updateLoadWarning() {
            if (checkAllVillagesLoaded()) { $('#pp-load-warning').hide(); return; }
            const totalCount = getTotalVillagesCount();
            const displayedCount = Math.max(0, $('#villages_list > tbody > tr').length - 1);
            if ($('#pp-load-warning').length === 0) {
                const warning = $(`<div id="pp-load-warning" class="pp-load-warning">
                    <span class="pp-load-warning-icon">⚠️</span>
                    <span class="pp-load-warning-text"><strong>${getTranslation('warningTitle')}</strong> ${getTranslation('warningMessage', displayedCount, totalCount)}</span>
                    <span class="pp-load-warning-button">${getTranslation('loadAll')}</span>
                </div>`);
                warning.on('click', clickLoadAllVillages);
                $('#villages_list').before(warning);
            } else {
                $('#pp-load-warning').show();
                $('#pp-load-warning .pp-load-warning-text').html(`<strong>${getTranslation('warningTitle')}</strong> ${getTranslation('warningMessage', displayedCount, totalCount)}`);
            }
        }

        const toolbar = $(`
            <div class="pp-panel">
                <div class="pp-row-header">
                    <span class="pp-label">◈ Contador:</span>
                    <span class="pp-stat off"     title="${getTranslation('offensiveCount')}">⚔️ <b id="stat-off">0</b></span>
                    <span class="pp-stat def"     title="${getTranslation('defensiveCount')}">🛡️ <b id="stat-def">0</b></span>
                    <span class="pp-stat nd"      title="${getTranslation('unknownCount')}">❓ <b id="stat-nd">0</b></span>
                    <span class="pp-stat pending" title="${getTranslation('pendingCount')}">⏳ <b id="stat-pending">0</b></span>
                    <button id="copy-visible" class="pp-btn-copy">${getTranslation('copyCoords')}</button>
                    <button id="scan-all" class="pp-btn-scan" title="${getTranslation('scanAllTooltip')}">${getTranslation('scanAll')}</button>
                    <button id="pp-minimize" class="pp-btn-minimize" title="Minimizar">—</button>
                </div>
                <div class="pp-panel-body" id="pp-panel-body">
                    <div class="pp-row-filters">
                        <span class="pp-filter-label">Filtros:</span>
                        <button id="filter-off" class="pp-btn" title="${getTranslation('filterOffTooltip')}">⚔️ OFF</button>
                        <button id="filter-def" class="pp-btn" title="${getTranslation('filterDefTooltip')}">🛡️ DEF</button>
                        <button id="filter-nd"  class="pp-btn" title="${getTranslation('filterUnknownTooltip')}">❓ Sem info</button>
                        <button id="filter-has-tower" class="pp-btn" title="Mostrar só aldeias com Torre">🗼 Torre</button>
                        <button id="reset-all-filters" class="pp-btn-reset" title="${getTranslation('showAllTooltip')}">✕ Limpar filtros</button>
                    </div>
                    <div class="pp-row-filters pp-attacks">
                        <span class="pp-filter-label">Ataques:</span>
                        <button id="filter-attack-mine" class="pp-btn">⚔️ Atacado por mim</button>
                        <button id="filter-attack-ally" class="pp-btn">🗡️ Atacado por aliado</button>
                        <button id="filter-attack-none" class="pp-btn">✅ Sem ataque</button>
                    </div>
                    <div class="pp-row-k">
                        <span class="pp-filter-label">K:</span>
                        <span class="k-tags-wrap" id="k-tags-wrap"></span>
                    </div>
                    <div class="pp-row-buildings">
                        <span class="pp-filter-label">Nível:</span>
                        <button id="filter-wall-btn"  class="pp-btn pp-building-toolbar-btn" title="Escolher nível de muralha">🏰 Muralha <span id="filter-wall-label"  class="pp-building-lvl-label"></span></button>
                        <button id="filter-tower-btn" class="pp-btn pp-building-toolbar-btn" title="Escolher nível de torre">🗼 Torre <span id="filter-tower-label" class="pp-building-lvl-label"></span></button>
                        <span id="building-filter-status" class="pp-building-status"></span>
                    </div>
                    <div class="pp-row-buildings">
                        <span class="pp-filter-label">Pontos:</span>
                        <select id="points-mode" class="pp-building-input" style="width:82px;">
                            <option value="max">Até</option>
                            <option value="between">Entre</option>
                            <option value="min">Mais de</option>
                        </select>
                        <input type="number" id="points-value-1" class="pp-building-input" placeholder="Valor">
                        <input type="number" id="points-value-2" class="pp-building-input" placeholder="Máx" style="display:none;">
                        <button id="clear-points-filter" class="pp-btn-clear-buildings">Limpar</button>
                        <span id="points-filter-status" class="pp-building-status"></span>
                    </div>
                    <div class="pp-row-coords">
                        <span class="pp-filter-label" style="align-self:center;">Coords:</span>
                        <div class="pp-coord-group">
                            <div class="pp-coord-group-inner">
                                <span class="pp-filter-label" style="min-width:auto;">X</span>
                                <select id="coord-x-op" class="pp-coord-op"><option value=">=">≥</option><option value="<=">≤</option></select>
                                <input type="number" id="coord-x-val" class="pp-coord-input" placeholder="ex: 500" min="0" max="999">
                            </div>
                            <span id="coord-arrow-x" class="pp-coord-arrow"></span>
                        </div>
                        <span class="pp-coord-sep">|</span>
                        <div class="pp-coord-group">
                            <div class="pp-coord-group-inner">
                                <span class="pp-filter-label" style="min-width:auto;">Y</span>
                                <select id="coord-y-op" class="pp-coord-op"><option value=">=">≥</option><option value="<=">≤</option></select>
                                <input type="number" id="coord-y-val" class="pp-coord-input" placeholder="ex: 500" min="0" max="999">
                            </div>
                            <span id="coord-arrow-y" class="pp-coord-arrow"></span>
                        </div>
                        <button id="clear-coords-filter" class="pp-btn-clear-buildings" style="align-self:flex-start;">Limpar</button>
                        <span id="coords-filter-status" class="pp-coord-status"></span>
                    </div>
                    <div class="pp-progress-wrap" id="pp-progress-wrap">
                        <div class="pp-progress-bar-text" id="pp-progress-text">A analisar...</div>
                        <div class="pp-progress-track"><div class="pp-progress-fill" id="pp-progress-fill"></div></div>
                        <div class="pp-scan-done" id="pp-scan-done"></div>
                    </div>
                </div>
            </div>
        `);

        $('#villages_list').before(toolbar);

        // Minimize / maximize
        const $panelBody = $('#pp-panel-body');
        $panelBody.css('max-height', $panelBody[0].scrollHeight + 'px');
        let ppMinimized = false;
        $('#pp-minimize').on('click', function () {
            ppMinimized = !ppMinimized;
            $panelBody.css('max-height', ppMinimized ? '0' : ($panelBody[0].scrollHeight + 600) + 'px');
            $(this).text(ppMinimized ? '+' : '—').attr('title', ppMinimized ? 'Maximizar' : 'Minimizar');
        });

        const copyBtnBottom = $('<div style="text-align:right;margin-top:6px;"><button id="copy-visible-bottom" class="pp-btn-copy" style="font-size:11px;padding:4px 12px;margin-left:0;">' + getTranslation('copyCoords') + '</button></div>');
        $('#villages_list').after(copyBtnBottom);

        initializeNoteIcons();
        updateStats();
        updateLoadWarning();

        let debounceTimer;
        const observer = new MutationObserver(function (mutations) {
            let shouldInit = false;
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1 && ($(node).is('#villages_list tbody tr') || $(node).find('#villages_list tbody tr').length > 0)) shouldInit = true;
                    });
                }
            });
            if (shouldInit) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    window.pp_rows = window.pp_rows.filter(r => r.row.closest('body').length > 0);
                    initializeNoteIcons(); updateLoadWarning(); updateActiveFilterUI();
                    applyFilters(undefined, undefined, undefined, undefined, undefined);
                }, 150);
            }
        });
        const villagesList = document.getElementById('villages_list');
        if (villagesList) observer.observe(villagesList, { childList: true, subtree: true });

        function filterLabel(f) {
            if (!f) return '';
            return '<i style="font-style:italic;font-weight:normal;">' + (f.op === '>=' ? '≥' : f.op === '<=' ? '≤' : '=') + f.val + '</i>';
        }

        function updatePointsModeUI() {
            const mode = $('#points-mode').val();
            if (mode === 'between') { $('#points-value-1').attr('placeholder','Min'); $('#points-value-2').show().attr('placeholder','Max'); }
            else { $('#points-value-1').attr('placeholder','Valor'); $('#points-value-2').hide().val(''); }
        }

        function updatePointsFilterStatus() {
            const pf = window.pp_activeFilter.pointsFilter;
            if (!pf) { $('#points-filter-status').text(''); $('#points-value-1').val(''); $('#points-value-2').val(''); return; }
            if (pf.mode === 'max')     { $('#points-mode').val('max');     $('#points-value-1').val(pf.value); $('#points-value-2').val('');    $('#points-filter-status').text('Até ' + pf.value); }
            else if (pf.mode === 'min') { $('#points-mode').val('min');    $('#points-value-1').val(pf.value); $('#points-value-2').val('');    $('#points-filter-status').text('Acima de ' + pf.value); }
            else if (pf.mode === 'between') { $('#points-mode').val('between'); $('#points-value-1').val(pf.min); $('#points-value-2').val(pf.max); $('#points-filter-status').text(pf.min + '–' + pf.max); }
            updatePointsModeUI();
        }

        function coordHintText(axis, op) {
            if (axis === 'x') return op === '>=' ? '➡️' : '⬅️';
            return op === '>=' ? '⬇️' : '⬆️';
        }

        function updateCoordsFilterStatus() {
            const xf = window.pp_activeFilter.coordXFilter, yf = window.pp_activeFilter.coordYFilter;
            const parts = [];
            if (xf) parts.push('X ' + xf.op + ' ' + xf.val);
            if (yf) parts.push('Y ' + yf.op + ' ' + yf.val);
            $('#coords-filter-status').text(parts.length ? parts.join(' | ') : '');
            if (xf) { $('#coord-x-op').val(xf.op); $('#coord-x-val').val(xf.val); }
            if (yf) { $('#coord-y-op').val(yf.op); $('#coord-y-val').val(yf.val); }
            const rawX = $('#coord-x-val').val().trim(), rawY = $('#coord-y-val').val().trim();
            $('#coord-arrow-x').text(rawX !== '' && !isNaN(parseInt(rawX,10)) ? coordHintText('x', $('#coord-x-op').val()) : '');
            $('#coord-arrow-y').text(rawY !== '' && !isNaN(parseInt(rawY,10)) ? coordHintText('y', $('#coord-y-op').val()) : '');
        }

        function updateBuildingStatus() {
            const w = window.pp_activeFilter.wallFilter, t = window.pp_activeFilter.towerFilter;
            $('#filter-wall-label').html(w ? filterLabel(w) : '');
            $('#filter-tower-label').html(t ? filterLabel(t) : '');
            $('#filter-wall-btn').toggleClass('active-filter', !!w);
            $('#filter-tower-btn').toggleClass('active-filter', !!t);
            $('#filter-has-tower').toggleClass('active-filter', !!(t && t.op === '>=' && t.val === 1));
            const parts = [];
            if (w) parts.push('🏰' + filterLabel(w));
            if (t) parts.push('🗼' + filterLabel(t));
            $('#building-filter-status').html(parts.join(' | '));
        }

        function updateActiveFilterUI() {
            const { types: aTypes, kList: aK, attackFilter: af } = window.pp_activeFilter;
            $('#filter-off').toggleClass('active-filter', aTypes.has('off'));
            $('#filter-def').toggleClass('active-filter', aTypes.has('def'));
            $('#filter-nd').toggleClass('active-filter', aTypes.has('no-data'));
            $('#filter-attack-mine').toggleClass('active-filter', af === 'mine');
            $('#filter-attack-ally').toggleClass('active-filter', af === 'ally');
            $('#filter-attack-none').toggleClass('active-filter', af === 'none');

            const $wrap = $('#k-tags-wrap'), activeKSet = new Set(aK), allK = [];
            window.pp_rows.forEach(r => { const coords = extractCoordsFromRow(r.row); const k = coords ? getContinentFromCoords(coords) : null; if (k && !allK.includes(k)) allK.push(k); });
            allK.sort((a, b) => parseInt(a.slice(1),10) - parseInt(b.slice(1),10));
            $wrap.empty();
            allK.forEach(k => {
                const $tag = $('<span class="k-tag"></span>').text(k).toggleClass('active-filter', activeKSet.has(k));
                $tag.on('click', function () {
                    const newKSet = new Set(window.pp_activeFilter.kList);
                    if (newKSet.has(k)) newKSet.delete(k); else newKSet.add(k);
                    applyFilters(undefined, Array.from(newKSet)); updateActiveFilterUI();
                });
                $wrap.append($tag);
            });
            updateBuildingStatus(); updatePointsFilterStatus(); updateCoordsFilterStatus();
        }

        function openToolbarPicker(type, $anchor) {
            $('.pp-level-picker').remove();
            const activeFilter = type === 'wall' ? window.pp_activeFilter.wallFilter : window.pp_activeFilter.towerFilter;
            let selectedOp = (activeFilter && activeFilter.op) || '>=';
            const activeVal = activeFilter ? activeFilter.val : null;
            const $picker = $('<div class="pp-level-picker"></div>');
            $picker.append('<div style="font-size:11px;font-weight:bold;color:var(--tb-gold-lt);margin-bottom:6px;">' + (type === 'wall' ? '🏰 Muralha' : '🗼 Torre') + '</div>');
            const $opWrap = $('<div class="pp-op-wrap"></div>');
            [{ val: '>=', label: '≥ maior ou igual' }, { val: '<=', label: '≤ menor ou igual' }, { val: '=', label: '= igual a' }].forEach(o => {
                const $ob = $('<button class="pp-op-btn' + (selectedOp === o.val ? ' active' : '') + '">' + o.label + '</button>');
                $ob.on('click', function (ev) { ev.stopPropagation(); selectedOp = o.val; $picker.find('.pp-op-btn').removeClass('active'); $ob.addClass('active'); });
                $opWrap.append($ob);
            });
            $picker.append($opWrap);
            $picker.append('<div style="font-size:10px;color:var(--tb-dim);margin:6px 0 4px;">Nível:</div>');
            const $grid = $('<div class="pp-lvl-grid"></div>');
            for (let i = 0; i <= 20; i++) {
                const $btn = $('<button class="pp-lvl-btn">' + i + '</button>');
                if (activeVal == i) $btn.addClass('active');
                $btn.on('click', function (ev) {
                    ev.stopPropagation(); $('.pp-level-picker').remove();
                    const f = { op: selectedOp, val: i };
                    if (type === 'wall') applyFilters(undefined, undefined, f); else applyFilters(undefined, undefined, undefined, f);
                    updateActiveFilterUI(); updateBuildingStatus();
                });
                $grid.append($btn);
            }
            $picker.append($grid);
            const $clear = $('<button class="pp-lvl-clear">✕ Sem filtro</button>');
            $clear.on('click', function (ev) {
                ev.stopPropagation(); $('.pp-level-picker').remove();
                if (type === 'wall') applyFilters(undefined, undefined, null); else applyFilters(undefined, undefined, undefined, null);
                updateActiveFilterUI(); updateBuildingStatus();
            });
            $picker.append($clear);
            $('body').append($picker);
            const rect = $anchor[0].getBoundingClientRect();
            $picker.css({ top: rect.bottom + 4 + 'px', left: Math.min(rect.left, window.innerWidth - 240) + 'px' });
        }

        function doCopyVisible() {
            const coords = [];
            window.pp_rows.forEach(r => { if (r.row.is(':visible')) { const c = extractCoordsFromRow(r.row); if (c) coords.push(c); } });
            if (coords.length) {
                navigator.clipboard.writeText(coords.join(' '));
                if (typeof UI !== 'undefined' && UI.SuccessMessage) UI.SuccessMessage(getTranslation('copied', coords.length));
            }
        }

        function applyPointsFilterLive() {
            const mode = $('#points-mode').val(), raw1 = $('#points-value-1').val().trim(), raw2 = $('#points-value-2').val().trim();
            if (raw1 === '' && raw2 === '') { applyFilters(undefined, undefined, undefined, undefined, null); updatePointsFilterStatus(); return; }
            const v1 = parseInt(raw1, 10), v2 = parseInt(raw2, 10);
            if (mode === 'max'     && !isNaN(v1)) applyFilters(undefined, undefined, undefined, undefined, { mode: 'max', value: v1 });
            else if (mode === 'min' && !isNaN(v1)) applyFilters(undefined, undefined, undefined, undefined, { mode: 'min', value: v1 });
            else if (mode === 'between' && !isNaN(v1) && !isNaN(v2)) applyFilters(undefined, undefined, undefined, undefined, { mode: 'between', min: Math.min(v1,v2), max: Math.max(v1,v2) });
            updatePointsFilterStatus();
        }

        function applyCoordsFilterLive() {
            const rawX = $('#coord-x-val').val().trim(), rawY = $('#coord-y-val').val().trim();
            const opX = $('#coord-x-op').val(), opY = $('#coord-y-op').val();
            const xF = rawX !== '' && !isNaN(parseInt(rawX,10)) ? { op: opX, val: parseInt(rawX,10) } : null;
            const yF = rawY !== '' && !isNaN(parseInt(rawY,10)) ? { op: opY, val: parseInt(rawY,10) } : null;
            applyFilters(undefined, undefined, undefined, undefined, undefined, undefined, xF, yF);
            updateCoordsFilterStatus();
        }

        // ── Bindings ──
        $('#copy-visible').click(doCopyVisible);
        $(document).on('click', '#copy-visible-bottom', doCopyVisible);

        $('#filter-off').click(() => { toggleType('off');     updateActiveFilterUI(); });
        $('#filter-def').click(() => { toggleType('def');     updateActiveFilterUI(); });
        $('#filter-nd' ).click(() => { toggleType('no-data'); updateActiveFilterUI(); });

        $('#reset-all-filters').click(() => {
            applyFilters('reset'); $('#coord-x-val').val(''); $('#coord-y-val').val('');
            updateActiveFilterUI(); updateBuildingStatus(); updatePointsFilterStatus(); updateCoordsFilterStatus();
        });

        $('#filter-wall-btn' ).click(function (e) { e.stopPropagation(); openToolbarPicker('wall',  $(this)); });
        $('#filter-tower-btn').click(function (e) { e.stopPropagation(); openToolbarPicker('tower', $(this)); });

        $('#filter-has-tower').click(() => {
            const cur = window.pp_activeFilter.towerFilter;
            applyFilters(undefined, undefined, undefined, (cur && cur.op === '>=' && cur.val === 1) ? null : { op: '>=', val: 1 });
            updateActiveFilterUI(); updateBuildingStatus();
        });

        $('#filter-attack-mine').click(() => { const c = window.pp_activeFilter.attackFilter; applyFilters(undefined,undefined,undefined,undefined,undefined, c==='mine'?null:'mine'); updateActiveFilterUI(); });
        $('#filter-attack-ally').click(() => { const c = window.pp_activeFilter.attackFilter; applyFilters(undefined,undefined,undefined,undefined,undefined, c==='ally'?null:'ally'); updateActiveFilterUI(); });
        $('#filter-attack-none').click(() => { const c = window.pp_activeFilter.attackFilter; applyFilters(undefined,undefined,undefined,undefined,undefined, c==='none'?null:'none'); updateActiveFilterUI(); });

        $('#points-mode'   ).on('change', function () { updatePointsModeUI(); applyPointsFilterLive(); });
        $('#points-value-1').on('input', applyPointsFilterLive);
        $('#points-value-2').on('input', applyPointsFilterLive);
        $('#clear-points-filter').click(() => { $('#points-value-1').val(''); $('#points-value-2').val(''); applyFilters(undefined,undefined,undefined,undefined,null); updatePointsFilterStatus(); });

        $('#coord-x-val').on('input', applyCoordsFilterLive);
        $('#coord-y-val').on('input', applyCoordsFilterLive);
        $('#coord-x-op' ).on('change', applyCoordsFilterLive);
        $('#coord-y-op' ).on('change', applyCoordsFilterLive);
        $('#clear-coords-filter').click(() => { $('#coord-x-val').val(''); $('#coord-y-val').val(''); applyFilters(undefined,undefined,undefined,undefined,undefined,undefined,null,null); updateCoordsFilterStatus(); });

        $(document).on('click', '.pp-building-cell', function (e) { e.stopPropagation(); openToolbarPicker($(this).data('type'), $(this)); });
        $(document).on('click', function (e) { if (!$(e.target).closest('.pp-level-picker').length) $('.pp-level-picker').remove(); });

        $('#scan-all').click(async () => {
            const performScan = async () => {
                $('#pp-progress-wrap').addClass('active');
                $('#pp-scan-done').removeClass('visible');
                $('#pp-progress-fill').css('width','0%');
                $('#pp-progress-text').text(getTranslation('loadingAllVillages'));

                if (!checkAllVillagesLoaded()) {
                    clickLoadAllVillages();
                    await new Promise(resolve => {
                        const t = setInterval(() => { if (checkAllVillagesLoaded()) { clearInterval(t); resolve(); } }, 500);
                        setTimeout(() => { clearInterval(t); resolve(); }, 30000);
                    });
                }

                $('#pp-scan-done').removeClass('visible');
                $('#pp-progress-fill').css('width','0%');
                $('#pp-progress-text').text(getTranslation('scanningVillages'));
                $('#pp-progress-wrap').addClass('active');

                const total = window.pp_rows.length;
                for (let i = 0; i < window.pp_rows.length; i++) {
                    const r = window.pp_rows[i];
                    await new Promise(resolve => { r.icon.click(); setTimeout(resolve, 600); });
                    const pct = Math.round(((i+1)/total)*100);
                    $('#pp-progress-text').text(getTranslation('scanProgress', i+1, total, pct));
                    $('#pp-progress-fill').css('width', pct + '%');
                }

                $('#pp-progress-fill').css('width','100%');
                $('#pp-progress-text').text('✔ Concluído');
                $('#pp-scan-done').text('✅ Scan completo!').addClass('visible');
                updateActiveFilterUI();
                setTimeout(() => { $('#pp-progress-wrap').removeClass('active'); $('#pp-scan-done').removeClass('visible'); }, 5000);
            };
            UI.ConfirmationBox(getTranslation('scanConfirmMessage'), [{ text: getTranslation('scanAll'), callback: performScan, confirm: true }], false, []);
        });

        $('#villages_list').on('click', '.pp-note-icon', function (e) {
            e.stopPropagation();
            const $icon = $(this), villageId = $icon.data('village-id');
            if (!villageId) { alert(getTranslation('villageIdNotFound')); return; }
            if (window.pp_settings.noteStates[villageId] === 'loading') return;
            window.pp_settings.noteStates[villageId] = 'loading';
            $icon.removeClass('not-loaded off def no-data').addClass('loading').text('...');
            if (typeof game_data === 'undefined' || !game_data.village) { alert(getTranslation('gameDataNotAvailable')); return; }
            const $row = $icon.closest('tr'), coords = extractCoordsFromRow($row) || '';
            const coordMatch = coords.match(/(\d+)\|(\d+)/);
            let noteUrl = `${location.origin}/game.php?village=${game_data.village.id}&screen=info_village&id=${villageId}`;
            if (coordMatch) noteUrl += `#${coordMatch[1]};${coordMatch[2]}`;

            $.ajax({
                url: noteUrl, type: 'GET', dataType: 'html',
                success: function (data) {
                    const $lc = $(data), $noteBody = $lc.find('.village-note-body');
                    let noteContent = '', hasData = false;
                    $noteBody.each(function () { const c = ($(this).html()||'').trim(); if (c.length > 0) { hasData = true; noteContent += $(this).prop('outerHTML'); } });
                    const villageType = hasData ? classifyVillage(noteContent) : 'no-data';

                    function extractBuilding($doc, patterns) {
                        let found = null;
                        $doc.find('td').each(function () {
                            if (patterns.some(p => $(this).text().trim().toLowerCase() === p)) {
                                const lvl = parseInt($(this).next('td').text().trim(), 10);
                                if (!isNaN(lvl)) { found = lvl; return false; }
                            }
                        });
                        return found;
                    }

                    const wallLevel  = extractBuilding($lc, ['muralha','wall']);
                    const towerLevel = extractBuilding($lc, ['torre de vigia','watchtower']);
                    window.pp_settings.noteStates[villageId] = villageType;
                    window.pp_settings.wallLevels  = window.pp_settings.wallLevels  || {};
                    window.pp_settings.towerLevels = window.pp_settings.towerLevels || {};
                    if (wallLevel  !== null) window.pp_settings.wallLevels[villageId]  = wallLevel;  else delete window.pp_settings.wallLevels[villageId];
                    if (towerLevel !== null) window.pp_settings.towerLevels[villageId] = towerLevel; else delete window.pp_settings.towerLevels[villageId];
                    saveSettings();

                    $icon.removeClass('loading not-loaded off def no-data').addClass(villageType).text(getLabel(villageType));
                    const $cr = $icon.closest('tr');
                    $cr.find('.pp-building-cell[data-type="wall"]' ).replaceWith(getBuildingCellHtml(villageId, 'wall'));
                    $cr.find('.pp-building-cell[data-type="tower"]').replaceWith(getBuildingCellHtml(villageId, 'tower'));
                    updateStats(); updateActiveFilterUI();
                    applyFilters(undefined, undefined, undefined, undefined, undefined);

                    if (hasData) showNotePopup(villageId, noteContent, coords);
                    else { if (typeof UI !== 'undefined' && UI.ErrorMessage) UI.ErrorMessage(getTranslation('noNotesFound')); else alert(getTranslation('noNotesFound')); }
                },
                error: function () {
                    alert(getTranslation('failedToLoad'));
                    window.pp_settings.noteStates[villageId] = 'not-loaded';
                    $icon.removeClass('loading').addClass('not-loaded').text(getLabel('not-loaded'));
                }
            });
        });

        function showNotePopup(villageId, content, coords) {
            $('.note-popup').remove();
            const $popup = $('<div class="note-popup"></div>');
            $popup.html(`<div class="note-popup-header"><span>${getTranslation('villageNotes', coords || villageId)}</span><span class="note-popup-close">×</span></div><div class="note-popup-content">${content}</div>`);
            $('body').append($popup);
            if (window.pp_settings.popupPosition) {
                $popup.css({ top: window.pp_settings.popupPosition.top + 'px', left: window.pp_settings.popupPosition.left + 'px' });
            } else {
                $popup.css({ top: '100px', left: ($(window).width() - $popup.outerWidth() - 20) + 'px' });
            }
            $popup.find('.note-popup-close').on('click', function (e) { e.stopPropagation(); $(document).off('.ppDrag'); $popup.fadeOut(200, function () { $(this).remove(); }); });
            let isDragging = false, offsetX = 0, offsetY = 0;
            $popup.find('.note-popup-header').on('mousedown', function (e) {
                if ($(e.target).hasClass('note-popup-close')) return;
                isDragging = true;
                const rect = $popup[0].getBoundingClientRect();
                offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
                $popup.find('.note-popup-header').css('cursor','grabbing');
                e.preventDefault();
            });
            $(document).on('mousemove.ppDrag', function (e) {
                if (!isDragging) return; e.preventDefault();
                const newLeft = Math.max(0, Math.min(e.clientX - offsetX, $(window).width() - $popup.outerWidth()));
                const newTop  = Math.max(0, Math.min(e.clientY - offsetY, $(window).height() - 50));
                $popup.css({ left: newLeft + 'px', top: newTop + 'px', right: 'auto' });
            });
            $(document).on('mouseup.ppDrag', function () {
                if (!isDragging) return; isDragging = false;
                $popup.find('.note-popup-header').css('cursor','move');
                const pos = $popup.position();
                window.pp_settings.popupPosition = { top: pos.top, left: pos.left };
                saveSettings();
            });
        }

        updatePointsModeUI();
        updateActiveFilterUI();
        applyFilters(undefined, undefined, undefined, undefined, undefined);
    }
})();
