// ==UserScript==
// @name         TW Notes Scanner + K Multi Filter
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @description  Notes scanner + filtro por continentes K (multi-seleção)
// @author       You
// @match        *://*.tribalwars.com.pt/*
// @match        *://*.tribalwars.net/*
// @match        *://*.tribalwars.es/*
// @match        *://*.tribalwars.com.br/*
// @grant        none
// @run-at       document-idle
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

            if (hasJQ && hasUI && hasTable) {
                clearInterval(t);
                cb();
                return;
            }

            if (Date.now() - start > max) {
                clearInterval(t);
                console.warn('[TW Script] Timeout: jQuery/UI/#villages_list não encontrados.');
            }
        }, 200);
    }

    waitForTW(init);

    function init() {
        if (window.__pp_notes_initialized) return;
        window.__pp_notes_initialized = true;

        // Translations
        const translations = {
            en: {
                notes: 'Notes',
                offensiveCount: 'Offensive villages count',
                defensiveCount: 'Defensive villages count',
                unknownCount: 'Unknown/unclassified villages count',
                pendingCount: 'Villages not yet analyzed',
                scanAll: 'Scan',
                scanAllTooltip: 'Load notes for all villages automatically',
                filterOff: 'OFF',
                filterOffTooltip: 'Show only offensive villages',
                filterDef: 'DEF',
                filterDefTooltip: 'Show only defensive villages',
                filterUnknown: '?',
                filterUnknownTooltip: 'Show only unknown villages',
                showAll: 'All',
                showAllTooltip: 'Show all villages',
                filterKTooltip: 'Show villages by continent (auto list)',
                kFilterTitle: 'Continents',
                kApply: 'Apply K',
                kClear: 'Clear K',
                filteredKMulti: 'Filtered {0} villages from {1} (coords copied)',
                copyCoords: 'Copy Visible Coords',
                warningTitle: 'Warning:',
                warningMessage: 'Only {0} of {1} villages loaded. Click here to load all villages before scanning.',
                loadAll: 'Load All',
                villageIdNotFound: 'Village ID not found',
                gameDataNotAvailable: 'Game data not available',
                noNotesFound: 'No notes found for this village',
                failedToLoad: 'Failed to load note',
                filtered: 'Filtered {0} villages (coords copied)',
                copied: 'Copied {0} coordinates',
                villageNotes: 'Village Notes - {0}',
                scanConfirmMessage: 'This will load notes for all villages. This may take several minutes. Continue?',
                scanProgress: '{0}/{1} - {2}%',
                loadingAllVillages: 'Loading all villages...',
                scanningVillages: 'Scanning villages...'
            },
            pt_PT: {
                notes: 'Notas',
                offensiveCount: 'Contagem de aldeias ofensivas',
                defensiveCount: 'Contagem de aldeias defensivas',
                unknownCount: 'Contagem de aldeias desconhecidas/não classificadas',
                pendingCount: 'Aldeias ainda não analisadas',
                scanAll: 'Scan',
                scanAllTooltip: 'Carregar notas de todas as aldeias automaticamente',
                filterOff: 'OFF',
                filterOffTooltip: 'Mostrar apenas aldeias ofensivas',
                filterDef: 'DEF',
                filterDefTooltip: 'Mostrar apenas aldeias defensivas',
                filterUnknown: '?',
                filterUnknownTooltip: 'Mostrar apenas aldeias desconhecidas',
                showAll: 'Todas',
                showAllTooltip: 'Mostrar todas as aldeias',
                filterKTooltip: 'Mostrar aldeias por continente (lista automática)',
                kFilterTitle: 'Continentes',
                kApply: 'Aplicar K',
                kClear: 'Limpar K',
                filteredKMulti: 'Filtradas {0} aldeias de {1} (coords copiadas)',
                copyCoords: 'Copiar Coords Visíveis',
                warningTitle: 'Aviso:',
                warningMessage: 'Apenas {0} de {1} aldeias carregadas. Clique aqui para carregar todas as aldeias antes de analisar.',
                loadAll: 'Carregar Todas',
                villageIdNotFound: 'ID da aldeia não encontrado',
                gameDataNotAvailable: 'Dados do jogo não disponíveis',
                noNotesFound: 'Nenhuma nota encontrada para esta aldeia',
                failedToLoad: 'Falha ao carregar nota',
                filtered: 'Filtradas {0} aldeias (coords copiadas)',
                copied: 'Copiadas {0} coordenadas',
                villageNotes: 'Notas da Aldeia - {0}',
                scanConfirmMessage: 'Isto irá carregar notas de todas as aldeias. Pode demorar vários minutos. Continuar?',
                scanProgress: '{0}/{1} - {2}%',
                loadingAllVillages: 'A carregar todas as aldeias...',
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

        window.pp_settings = window.pp_settings || {
            noteStates: {},
            popupPosition: null
        };

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
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    window.pp_settings = { ...window.pp_settings, ...parsed };
                } catch (e) {
                    console.error('Failed to load pp_settings:', e);
                }
            }
        }

        function saveSettings() {
            try {
                localStorage.setItem('pp_settings', JSON.stringify(window.pp_settings));
            } catch (e) {
                console.error('Failed to save pp_settings:', e);
            }
        }

        loadSettings();

        $('<style>')
            .text(`
                /* ── ícones de nota ───────────────────────────── */
                .pp-note-icon { font-size:13px; display:inline-block; cursor:pointer; padding:2px 7px; border-radius:4px; transition:all .2s; color:white; font-weight:bold; }
                .pp-note-icon:hover { transform:scale(1.1); }
                .pp-note-icon.not-loaded { background:#c8c8c8; color:#555; }
                .pp-note-icon.loading   { background:#e08b00; color:#fff; animation:pulse 1s infinite; }
                .pp-note-icon.off       { background:#b71c1c; color:#fff; }
                .pp-note-icon.def       { background:#0d47a1; color:#fff; }
                .pp-note-icon.no-data   { background:#37474f; color:#fff; }
                @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }

                /* ── wrapper geral ────────────────────────────── */
                .pp-panel {
                    margin:6px 0; border:2px solid #6b4c24; border-radius:6px;
                    overflow:hidden; font-family:sans-serif;
                    box-shadow: 0 2px 6px rgba(0,0,0,.25);
                }

                /* ── linha 1: cabeçalho com stats + scan ─────── */
                .pp-row-header {
                    display:flex; align-items:center; gap:8px; flex-wrap:nowrap;
                    padding:7px 12px; background:#3d1f00; min-width:0; overflow:hidden;
                }
                .pp-row-header .pp-label {
                    font-size:12px; font-weight:bold; color:#f5e6c8; letter-spacing:1px; text-transform:uppercase; margin-right:2px;
                }
                .pp-stat {
                    display:inline-flex; align-items:center; gap:4px;
                    font-size:12px; padding:3px 10px; border-radius:4px; color:white; font-weight:bold; min-width:42px; justify-content:center;
                }
                .pp-stat.off     { background:#b71c1c; }
                .pp-stat.def     { background:#0d47a1; }
                .pp-stat.nd      { background:#424242; }
                .pp-stat.pending { background:#555; opacity:.8; }

                .pp-btn-scan {
                    font-size:11px; padding:4px 12px;
                    background:#e53935; border:1px solid #b71c1c;
                    border-radius:4px; color:#fff; font-weight:bold; cursor:pointer;
                    box-shadow:inset 0 1px 0 rgba(255,255,255,.2);
                    transition: background .15s;
                }
                .pp-btn-scan:hover { background:#ef5350; }
                .pp-btn-copy {
                    font-size:11px; padding:4px 14px;
                    background:#2e7d32; border:1px solid #1b5e20;
                    border-radius:4px; color:#fff; font-weight:bold; cursor:pointer;
                    box-shadow:inset 0 1px 0 rgba(255,255,255,.2);
                    transition: background .15s;
                    white-space:nowrap; flex-shrink:0;
                }
                .pp-btn-copy:hover { background:#388e3c; }

                /* ── linha 2: filtros tipo ───────────────────── */
                .pp-row-filters {
                    display:flex; align-items:center; gap:6px; flex-wrap:wrap;
                    padding:6px 12px; background:#fff8f0; border-top:2px solid #6b4c24;
                }
                .pp-filter-label { font-size:10px; font-weight:bold; color:#8B4513; text-transform:uppercase; letter-spacing:.5px; }
                /* botão OFF */
                #filter-off.pp-btn {
                    background:#b71c1c; border:1px solid #7f0000; color:#fff;
                    box-shadow:inset 0 1px 0 rgba(255,255,255,.2);
                }
                #filter-off.pp-btn:hover { background:#c62828; }
                #filter-off.pp-btn.active-filter {
                    box-shadow: 0 0 0 2px #ff8a80, inset 0 2px 5px rgba(0,0,0,.45);
                    filter: brightness(.85);
                }
                /* botão DEF */
                #filter-def.pp-btn {
                    background:#0d47a1; border:1px solid #002171; color:#fff;
                    box-shadow:inset 0 1px 0 rgba(255,255,255,.2);
                }
                #filter-def.pp-btn:hover { background:#1565c0; }
                #filter-def.pp-btn.active-filter {
                    box-shadow: 0 0 0 2px #82b1ff, inset 0 2px 5px rgba(0,0,0,.45);
                    filter: brightness(.85);
                }
                /* botão Sem info */
                #filter-nd.pp-btn {
                    background:#424242; border:1px solid #212121; color:#fff;
                    box-shadow:inset 0 1px 0 rgba(255,255,255,.15);
                }
                #filter-nd.pp-btn:hover { background:#616161; }
                #filter-nd.pp-btn.active-filter {
                    box-shadow: 0 0 0 2px #bdbdbd, inset 0 2px 5px rgba(0,0,0,.45);
                    filter: brightness(.85);
                }
                .pp-btn {
                    font-size:11px; padding:4px 12px; border-radius:4px;
                    font-weight:bold; cursor:pointer;
                    transition: box-shadow .15s, filter .15s, background .15s;
                    user-select:none;
                }
                .pp-btn-reset {
                    font-size:11px; padding:4px 12px; margin-left:auto;
                    background:#fff; border:2px solid #c0392b; border-radius:4px;
                    color:#c0392b; font-weight:bold; cursor:pointer;
                    transition: background .15s, color .15s;
                }
                .pp-btn-reset:hover { background:#c0392b; color:#fff; }

                /* ── linha 3: continentes K ──────────────────── */
                .pp-row-k {
                    display:flex; align-items:center; gap:5px; flex-wrap:wrap;
                    padding:6px 12px; background:#e8f0fe; border-top:2px solid #6b4c24;
                    min-height:32px;
                }
                .k-tag {
                    font-size:10px; padding:3px 10px; border-radius:12px; cursor:pointer; font-weight:bold;
                    background:#fff; border:1px solid #3949ab; color:#3949ab;
                    transition: background .15s, color .15s, box-shadow .15s;
                    user-select:none;
                }
                .k-tag:hover { background:#e8eaf6; }
                .k-tag.active-filter {
                    background:#3949ab; color:#fff; border-color:#1a237e;
                    box-shadow: 0 0 0 2px #9fa8da;
                }

                /* ── linha 4: edifícios ─────────────────────── */
                .pp-row-buildings {
                    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
                    padding:6px 12px; background:#f0f4ff; border-top:2px solid #6b4c24;
                    min-height:32px;
                }
                .pp-building-lvl-label {
                    display:inline-block; margin-left:3px; font-size:10px;
                    background:rgba(0,0,0,.18); border-radius:3px; padding:0 4px;
                    min-width:14px; text-align:center;
                }
                .pp-building-lvl-label:empty { display:none; }
                .pp-building-filter { display:inline-flex; align-items:center; gap:4px; }
                .pp-building-icon { font-size:16px; line-height:1; }
                .pp-building-label { font-size:11px; font-weight:bold; color:#3949ab; }
                .pp-building-input {
                    width:42px; padding:2px 4px; font-size:11px; font-weight:bold;
                    border:1px solid #3949ab; border-radius:4px; text-align:center;
                    color:#1a237e; background:#fff;
                }
                .pp-building-input:focus { outline:2px solid #7986cb; }
                .pp-building-input.input-active { background:#e8eaf6; border-color:#1a237e; box-shadow:0 0 0 2px #9fa8da; }
                .pp-btn-apply-buildings {
                    font-size:11px; padding:3px 10px;
                    background:#3949ab; border:1px solid #1a237e; border-radius:4px;
                    color:#fff; font-weight:bold; cursor:pointer;
                    transition: background .15s;
                }
                .pp-btn-apply-buildings:hover { background:#5c6bc0; }
                .pp-btn-clear-buildings {
                    font-size:11px; padding:3px 8px;
                    background:#fff; border:1px solid #c0392b; border-radius:4px;
                    color:#c0392b; font-weight:bold; cursor:pointer;
                    transition: background .15s, color .15s;
                }
                .pp-btn-clear-buildings:hover { background:#c0392b; color:#fff; }
                .pp-building-status {
                    font-size:10px; font-style:italic; color:#5c6bc0; margin-left:4px;
                }

                /* ── progress + notificação de scan ─────────── */
                .pp-progress-wrap {
                    padding:5px 10px; background:#fdf3e0; border-top:1px solid #c9a97a;
                    display:none;
                }
                .pp-progress-wrap.active { display:block; }
                .pp-progress-bar-text { font-size:11px; color:#5a3e1b; margin-bottom:4px; text-align:center; }
                .pp-progress-track { height:6px; background:#d6b47a; border-radius:3px; overflow:hidden; }
                .pp-progress-fill { height:100%; width:0%; background:#8B4513; border-radius:3px; transition:width .3s; }
                .pp-scan-done {
                    display:none; margin-top:5px; padding:5px 10px; border-radius:4px;
                    background:#d4edda; border:1px solid #4a7c59; color:#1b3a27;
                    font-size:11px; font-weight:bold; text-align:center;
                }
                .pp-scan-done.visible { display:block; }

                /* ── colunas muralha/torre na tabela ─────────── */
                .pp-building-cell {
                    text-align:center; font-size:11px; font-weight:bold;
                    padding:2px 6px; border-radius:3px; cursor:pointer;
                    min-width:28px; display:inline-block;
                    user-select:none; transition: filter .15s;
                }
                .pp-building-cell:hover { filter: brightness(1.15); }
                .pp-building-cell.wall-high  { background:#4e2a04; color:#f5e6c8; }
                .pp-building-cell.wall-mid   { background:#8B4513; color:#f5e6c8; }
                .pp-building-cell.wall-low   { background:#c8935a; color:#fff; }
                .pp-building-cell.wall-zero  { background:#e8d5b8; color:#7a5c3a; }
                .pp-building-cell.wall-none  { background:transparent; color:#bbb; font-weight:normal; }
                .pp-building-cell.tower-yes  { background:#33691e; color:#f1f8e9; }
                .pp-building-cell.tower-zero { background:#e8ead8; color:#7a8060; }
                .pp-building-cell.tower-none { background:transparent; color:#bbb; font-weight:normal; }
                /* popup de nível clicável */
                .pp-level-picker {
                    position:fixed; z-index:10002; background:#fff; border:2px solid #6b4c24;
                    border-radius:6px; padding:10px; box-shadow:0 4px 16px rgba(0,0,0,.35);
                    display:flex; flex-direction:column; gap:0; min-width:230px;
                }
                .pp-op-wrap { display:flex; flex-direction:column; gap:3px; margin-bottom:2px; }
                .pp-op-btn {
                    font-size:11px; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold; text-align:left;
                    background:#f5f5f5; border:1px solid #ccc; color:#444;
                    transition: background .1s;
                }
                .pp-op-btn:hover { background:#e8eaf6; border-color:#9fa8da; color:#1a237e; }
                .pp-op-btn.active { background:#3949ab; color:#fff; border-color:#1a237e; }
                .pp-lvl-grid { display:flex; flex-wrap:wrap; gap:3px; }
                .pp-level-picker .pp-lvl-btn {
                    font-size:11px; padding:3px 7px; border-radius:3px; cursor:pointer; font-weight:bold;
                    background:#e8eaf6; border:1px solid #9fa8da; color:#1a237e;
                    transition: background .1s;
                }
                .pp-level-picker .pp-lvl-btn:hover { background:#3949ab; color:#fff; }
                .pp-level-picker .pp-lvl-btn.active { background:#3949ab; color:#fff; border-color:#1a237e; }
                .pp-level-picker .pp-lvl-clear {
                    width:100%; font-size:10px; padding:3px; border-radius:3px; cursor:pointer;
                    background:#fff; border:1px solid #c0392b; color:#c0392b; font-weight:bold;
                    text-align:center; margin-top:6px;
                }
                .pp-level-picker .pp-lvl-clear:hover { background:#c0392b; color:#fff; }

                /* ── aviso de carregamento parcial ───────────── */
                .pp-load-warning {
                    background:#f1aeb5; border:1px solid #f5c2c7; border-radius:5px;
                    padding:8px 12px; margin-bottom:6px; color:#842029;
                    font-size:12px; cursor:pointer; display:flex; align-items:center; gap:8px;
                }
                .pp-load-warning:hover { background:#ea868f; }
                .pp-load-warning-icon { font-size:16px; }
                .pp-load-warning-text { flex:1; }
                .pp-load-warning-button { padding:3px 8px; background:#dc3545; border:1px solid #b02a37; border-radius:3px; color:#fff; font-weight:bold; font-size:11px; }

                /* ── popup de notas ──────────────────────────── */
                .note-popup {
                    position:fixed; background:#fff; border:2px solid #8B4513; border-radius:8px;
                    padding:0; width:450px; max-height:70vh; overflow:hidden;
                    z-index:10000; box-shadow:0 4px 20px rgba(0,0,0,.5); display:flex; flex-direction:column;
                }
                .note-popup-header {
                    font-size:15px; font-weight:bold; padding:10px 14px; background:#8B4513; color:#fff;
                    cursor:move; user-select:none; display:flex; justify-content:space-between; align-items:center;
                }
                .note-popup-close { cursor:pointer; font-size:20px; line-height:1; padding:0 4px; }
                .note-popup-close:hover { color:#ff6b6b; }
                .note-popup-content { padding:14px; overflow-y:auto; flex:1; }
            `)
            .appendTo('head');

        window.pp_rows = window.pp_rows || [];

        function extractCoordsFromRow($row) {
            let coords = null;
            $row.find('td').each(function () {
                const text = $(this).text().trim();
                const match = text.match(/^(\d+)\|(\d+)$/) || text.match(/(\d+)\|(\d+)/);
                if (match) {
                    coords = `${match[1]}|${match[2]}`;
                    return false;
                }
            });
            return coords;
        }

        // K = first digit of Y + first digit of X
        function getContinentFromCoords(coords) {
            const m = coords && coords.match(/^(\d+)\|(\d+)$/);
            if (!m) return null;
            return `K${m[2][0]}${m[1][0]}`;
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
            const totalCount   = getTotalVillagesCount();
            const analyzedCount = offCount + defCount + ndCount;
            const pendingCount = Math.max(0, totalCount - analyzedCount);

            $('#stat-off').text(offCount);
            $('#stat-def').text(defCount);
            $('#stat-nd').text(ndCount);
            $('#stat-pending').text(pendingCount);
        }

        function getBuildingCellHtml(villageId, type) {
            const levels = type === 'wall'
                ? (window.pp_settings.wallLevels  || {})
                : (window.pp_settings.towerLevels || {});
            const lvl = levels[villageId];
            const base = ' data-vid="' + villageId + '" data-type="' + type + '"';
            // Aldeia ainda não escaneada → hífen cinzento
            if (lvl === undefined) {
                return '<span class="pp-building-cell ' + type + '-none" title="Sem informação — faça scan"' + base + '>–</span>';
            }
            let cls = '';
            if (type === 'wall') {
                if (lvl >= 15) cls = 'wall-high';
                else if (lvl >= 5) cls = 'wall-mid';
                else if (lvl > 0) cls = 'wall-low';
                else cls = 'wall-zero';
            } else {
                cls = lvl > 0 ? 'tower-yes' : 'tower-zero';
            }
            const icon = type === 'wall' ? '🏰' : '🗼';
            return '<span class="pp-building-cell ' + cls + '" title="Clique para filtrar"' + base + '>' + icon + lvl + '</span>';
        }

        function initializeNoteIcons() {
            const $thead = $('#villages_list > thead > tr');
            if ($thead.find('th.pp-th-notes').length === 0) {
                $thead.each(function () {
                    $(this).append('<th class="pp-th-wall"  style="text-align:center;font-size:11px;">🏰 Muralha</th>');
                    $(this).append('<th class="pp-th-tower" style="text-align:center;font-size:11px;">🗼 Torre</th>');
                    $(this).append('<th class="pp-th-notes" style="text-align:center;">' + getTranslation('notes') + '</th>');
                });
            }

            $('#villages_list > tbody > tr').each(function () {
                const $row = $(this);
                if ($row.find('.pp-note-icon').length > 0) {
                    // já inicializado — só actualiza células de edifícios
                    const vid = $row.find('.pp-note-icon').data('village-id') + '';
                    $row.find('.pp-building-cell[data-type="wall"]').replaceWith(getBuildingCellHtml(vid, 'wall'));
                    $row.find('.pp-building-cell[data-type="tower"]').replaceWith(getBuildingCellHtml(vid, 'tower'));
                    return;
                }

                const $link = $row.find('td:first a');
                let villageId = null;
                if ($link.length > 0) {
                    const href = $link.attr('href') || '';
                    const match = href.match(/id=(\d+)/);
                    if (match) villageId = match[1];
                }

                const savedState = window.pp_settings.noteStates[villageId] || 'not-loaded';
                const iconLabel = getLabel(savedState);

                const $wallTd  = $('<td style="text-align:center;"></td>').html(getBuildingCellHtml(villageId, 'wall'));
                const $towerTd = $('<td style="text-align:center;"></td>').html(getBuildingCellHtml(villageId, 'tower'));
                const $icon    = $('<span class="pp-note-icon ' + savedState + '" data-village-id="' + villageId + '">' + iconLabel + '</span>');
                const $newTd   = $('<td style="text-align:center;cursor:pointer;"></td>').append($icon);

                $row.append($wallTd).append($towerTd).append($newTd);

                if (villageId) window.pp_settings.noteStates[villageId] = savedState;
                window.pp_rows.push({ row: $row, id: villageId, icon: $icon });
            });

            updateStats();
        }

        function populateContinentChecklist() {
            const $list = $('#k-filter-list');
            if (!$list.length) return;

            const selected = new Set(
                $('#k-filter-list input[type="checkbox"]:checked')
                    .map(function () { return this.value; })
                    .get()
            );

            const set = new Set();
            window.pp_rows.forEach(r => {
                const coords = extractCoordsFromRow(r.row);
                const k = coords ? getContinentFromCoords(coords) : null;
                if (k) set.add(k);
            });

            const continents = Array.from(set).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

            $list.empty();
            continents.forEach(k => {
                const checked = selected.has(k) ? 'checked' : '';
                $list.append(`<label class="k-filter-item"><input type="checkbox" value="${k}" ${checked}> ${k}</label>`);
            });
        }

        function getSelectedContinents() {
            return $('#k-filter-list input[type="checkbox"]:checked')
                .map(function () { return this.value; })
                .get();
        }

        // Estado activo dos filtros combinados
        window.pp_activeFilter = window.pp_activeFilter || { types: new Set(), kList: [], wallFilter: null, towerFilter: null };

        function applyFilters(types, kList, wallFilter, towerFilter) {
            // types pode ser um Set, ou undefined (não mudar), ou 'reset' (limpar tudo)
            // wallFilter/towerFilter: {op: '>='|'<='|'=', val: N} ou null
            if (types === 'reset') {
                window.pp_activeFilter.types       = new Set();
                window.pp_activeFilter.kList       = [];
                window.pp_activeFilter.wallFilter  = null;
                window.pp_activeFilter.towerFilter = null;
            } else {
                if (types        !== undefined) window.pp_activeFilter.types        = types;
                if (kList        !== undefined) window.pp_activeFilter.kList        = kList;
                if (wallFilter   !== undefined) window.pp_activeFilter.wallFilter   = wallFilter;
                if (towerFilter  !== undefined) window.pp_activeFilter.towerFilter  = towerFilter;
            }

            const activeTypes  = window.pp_activeFilter.types;
            const activeK      = window.pp_activeFilter.kList;
            const activeWall   = window.pp_activeFilter.wallFilter;
            const activeTower  = window.pp_activeFilter.towerFilter;
            const kSet = activeK.length > 0 ? new Set(activeK) : null;
            const noTypeFilter = activeTypes.size === 0;

            const coords = [];

            window.pp_rows.forEach(r => {
                const state = window.pp_settings.noteStates[r.id];

                // Filtro por tipo: sem filtro = mostra tudo; com filtro = tem que bater em algum
                const typeMatch = noTypeFilter ||
                    (activeTypes.has('no-data') && state !== 'off' && state !== 'def') ||
                    activeTypes.has(state);

                // Filtro por continente
                const rowCoords = extractCoordsFromRow(r.row);
                const rowK = rowCoords ? getContinentFromCoords(rowCoords) : null;
                const kMatch = !kSet || (rowK && kSet.has(rowK));

                // Filtro por nível de muralha
                const wallLvl  = (window.pp_settings.wallLevels  || {})[r.id];
                const towerLvl = (window.pp_settings.towerLevels || {})[r.id];
                function buildingMatch(lvl, filter) {
                    if (!filter) return true;
                    if (lvl === undefined) return false;
                    if (filter.op === '>=') return lvl >= filter.val;
                    if (filter.op === '<=') return lvl <= filter.val;
                    if (filter.op === '=')  return lvl === filter.val;
                    return true;
                }
                const wallMatch  = buildingMatch(wallLvl,  activeWall);
                const towerMatch = buildingMatch(towerLvl, activeTower);

                const show = typeMatch && kMatch && wallMatch && towerMatch;

                if (show) {
                    r.row.show();
                    if (rowCoords) coords.push(rowCoords);
                } else {
                    r.row.hide();
                }
            });

            // Feedback
            const hasTypeFilter = activeTypes.size > 0;
            const hasKFilter = activeK.length > 0;

            if ((hasTypeFilter || hasKFilter) && coords.length) {
                navigator.clipboard.writeText(coords.join(' '));
                const typeLabel = Array.from(activeTypes).map(t => t.toUpperCase()).join('+');
                let msg = '';
                if (hasTypeFilter && hasKFilter) {
                    msg = `Filtradas ${coords.length} aldeias [${typeLabel}] em [${activeK.join(', ')}] (coords copiadas)`;
                } else if (hasTypeFilter) {
                    msg = `Filtradas ${coords.length} aldeias [${typeLabel}] (coords copiadas)`;
                } else {
                    msg = getTranslation('filteredKMulti', coords.length, activeK.join(', '));
                }
                if (typeof UI !== 'undefined' && UI.SuccessMessage) UI.SuccessMessage(msg);
            }
        }

        // Toggle de um tipo: se já está activo remove, se não está adiciona
        function toggleType(type) {
            const types = new Set(window.pp_activeFilter.types);
            if (types.has(type)) types.delete(type);
            else types.add(type);
            applyFilters(types, undefined);
        }

        function filterByContinents(kList) { applyFilters(undefined, kList); }

        function checkAllVillagesLoaded() {
            const totalCount = getTotalVillagesCount();
            const displayedCount = $('#villages_list > tbody > tr').length;

            const lastRow = $('#villages_list > tbody > tr:last');
            const hasLoadAllLink = lastRow.find('a').filter(function () {
                const txt = ($(this).text() || '').toLowerCase();
                const oc = $(this).attr('onclick') || '';
                return txt.includes('todas') || txt.includes('all') || oc.includes('getAllVillages');
            }).length > 0;

            return !hasLoadAllLink && displayedCount >= totalCount;
        }

        function updateLoadWarning() {
            if (checkAllVillagesLoaded()) {
                $('#pp-load-warning').hide();
                return;
            }

            const totalCount = getTotalVillagesCount();
            const displayedCount = Math.max(0, $('#villages_list > tbody > tr').length - 1);

            if ($('#pp-load-warning').length === 0) {
                const warning = $(`
                    <div id="pp-load-warning" class="pp-load-warning">
                        <span class="pp-load-warning-icon">⚠️</span>
                        <span class="pp-load-warning-text">
                            <strong>${getTranslation('warningTitle')}</strong> ${getTranslation('warningMessage', displayedCount, totalCount)}
                        </span>
                        <span class="pp-load-warning-button">${getTranslation('loadAll')}</span>
                    </div>
                `);

                warning.on('click', function () {
                    const lastRow = $('#villages_list > tbody > tr:last');
                    const loadAllLink = lastRow.find('a').filter(function () {
                        const txt = ($(this).text() || '').toLowerCase();
                        const oc = $(this).attr('onclick') || '';
                        return txt.includes('todas') || txt.includes('all') || oc.includes('getAllVillages');
                    });
                    if (loadAllLink.length > 0) loadAllLink[0].click();
                });

                $('.notes-toolbar').before(warning);
            } else {
                $('#pp-load-warning').show();
                $('#pp-load-warning .pp-load-warning-text').html(
                    `<strong>${getTranslation('warningTitle')}</strong> ${getTranslation('warningMessage', displayedCount, totalCount)}`
                );
            }
        }

        const toolbar = $(`
            <div class="pp-panel">
                <div class="pp-row-header">
                    <span class="pp-label">Contadores</span>
                    <span class="pp-stat off"   title="${getTranslation('offensiveCount')}">⚔️ <b id="stat-off">0</b></span>
                    <span class="pp-stat def"   title="${getTranslation('defensiveCount')}">🛡️ <b id="stat-def">0</b></span>
                    <span class="pp-stat nd"    title="${getTranslation('unknownCount')}">❓ <b id="stat-nd">0</b></span>
                    <span class="pp-stat pending" title="${getTranslation('pendingCount')}">⏳ <b id="stat-pending">0</b></span>
                    <button id="copy-visible" class="pp-btn-copy" style="margin-left:auto;white-space:nowrap;">${getTranslation('copyCoords')}</button>
                    <button id="scan-all" class="pp-btn-scan" title="${getTranslation('scanAllTooltip')}">${getTranslation('scanAll')}</button>
                </div>
                <div class="pp-row-filters">
                    <span class="pp-filter-label">Filtros:</span>
                    <button id="filter-off" class="pp-btn" title="${getTranslation('filterOffTooltip')}">⚔️ OFF</button>
                    <button id="filter-def" class="pp-btn" title="${getTranslation('filterDefTooltip')}">🛡️ DEF</button>
                    <button id="filter-nd"  class="pp-btn" title="${getTranslation('filterUnknownTooltip')}">❓ Sem info</button>
                    <button id="filter-has-tower" class="pp-btn" title="Mostrar só aldeias com Torre">🗼 Torre</button>
                    <button id="reset-all-filters" class="pp-btn-reset" title="${getTranslation('showAllTooltip')}">✕ Limpar filtros</button>
                </div>
                <div class="pp-row-k">
                    <span class="pp-filter-label">K:</span>
                    <span class="k-tags-wrap" id="k-tags-wrap"></span>
                </div>
                <div class="pp-row-buildings">
                    <span class="pp-filter-label">Filtrar por nível:</span>
                    <button id="filter-wall-btn" class="pp-btn pp-building-toolbar-btn" title="Escolher nível de muralha">🏰 Muralha <span id="filter-wall-label" class="pp-building-lvl-label"></span></button>
                    <button id="filter-tower-btn" class="pp-btn pp-building-toolbar-btn" title="Escolher nível de torre">🗼 Torre <span id="filter-tower-label" class="pp-building-lvl-label"></span></button>
                    <span id="building-filter-status" class="pp-building-status" style="font-size:10px;font-style:italic;color:#888;margin-left:6px;"></span>
                </div>
                <div class="pp-progress-wrap" id="pp-progress-wrap">
                    <div class="pp-progress-bar-text" id="pp-progress-text">A analisar...</div>
                    <div class="pp-progress-track"><div class="pp-progress-fill" id="pp-progress-fill"></div></div>
                    <div class="pp-scan-done" id="pp-scan-done"></div>
                </div>
            </div>
        `);
        $('#villages_list').before(toolbar);

        // Botão copiar coords no fundo da tabela
        const copyBtnBottom = $('<div style="text-align:right;margin-top:6px;"><button id="copy-visible-bottom" class="pp-btn-copy" style="font-size:11px;padding:4px 12px;">' + getTranslation('copyCoords') + '</button></div>');
        $('#villages_list').after(copyBtnBottom);

        initializeNoteIcons();
        updateStats();
        populateContinentChecklist();
        updateLoadWarning();
        updateActiveFilterUI();

        let debounceTimer;
        const observer = new MutationObserver(function (mutations) {
            let shouldInit = false;
            mutations.forEach(function (mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            if ($(node).is('#villages_list tbody tr') || $(node).find('#villages_list tbody tr').length > 0) {
                                shouldInit = true;
                            }
                        }
                    });
                }
            });

            if (shouldInit) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    window.pp_rows = window.pp_rows.filter(r => r.row.closest('body').length > 0);
                    initializeNoteIcons();
                    populateContinentChecklist();
                    updateLoadWarning();
                }, 150);
            }
        });

        const villagesList = document.getElementById('villages_list');
        if (villagesList) observer.observe(villagesList, { childList: true, subtree: true });

        // Actualiza estado visual de todos os botões e tags K
        function updateActiveFilterUI() {
            const activeTypes = window.pp_activeFilter.types;
            const activeK     = window.pp_activeFilter.kList;

            // Botões de tipo (toggle visual)
            $('#filter-off').toggleClass('active-filter', activeTypes.has('off'));
            $('#filter-def').toggleClass('active-filter', activeTypes.has('def'));
            $('#filter-nd').toggleClass('active-filter', activeTypes.has('no-data'));

            // Tags K: mostra todas as disponíveis, activas ou não
            const $wrap = $('#k-tags-wrap');
            const activeKSet = new Set(activeK);
            const allK = [];
            window.pp_rows.forEach(r => {
                const coords = extractCoordsFromRow(r.row);
                const k = coords ? getContinentFromCoords(coords) : null;
                if (k && !allK.includes(k)) allK.push(k);
            });
            allK.sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

            $wrap.empty();
            allK.forEach(k => {
                const isActive = activeKSet.has(k);
                const $tag = $('<span class="k-tag"></span>')
                    .text(k)
                    .toggleClass('active-filter', isActive);
                $tag.on('click', function () {
                    const newKSet = new Set(window.pp_activeFilter.kList);
                    if (newKSet.has(k)) newKSet.delete(k);
                    else newKSet.add(k);
                    applyFilters(undefined, Array.from(newKSet));
                    updateActiveFilterUI();
                });
                $wrap.append($tag);
            });

            // Highlight botões de edifício
            updateBuildingStatus();
        }

        $('#filter-off').click(() => { toggleType('off'); updateActiveFilterUI(); });
        $('#filter-def').click(() => { toggleType('def'); updateActiveFilterUI(); });
        $('#filter-nd').click(() => { toggleType('no-data'); updateActiveFilterUI(); });

        $('#reset-all-filters').click(() => {
            applyFilters('reset');
            updateActiveFilterUI();
            updateBuildingStatus();
        });

        // Botões de filtro por nível na toolbar — abrem o picker
        function openToolbarPicker(type, $anchor) {
            $('.pp-level-picker').remove();
            const maxLvl = 20;
            const activeFilter = type === 'wall' ? window.pp_activeFilter.wallFilter : window.pp_activeFilter.towerFilter;
            const activeOp  = (activeFilter && activeFilter.op)  || '>=';
            const activeVal = (activeFilter && activeFilter.val != null) ? activeFilter.val : null;

            let selectedOp = activeOp;

            const $picker = $('<div class="pp-level-picker" style="min-width:230px;"></div>');

            // Título
            const title = type === 'wall' ? '🏰 Muralha' : '🗼 Torre';
            $picker.append('<div style="width:100%;font-size:11px;font-weight:bold;color:#3949ab;margin-bottom:6px;">' + title + '</div>');

            // Selector de operador
            const $opWrap = $('<div class="pp-op-wrap"></div>');
            const ops = [{ val: '>=', label: '≥ maior ou igual' }, { val: '<=', label: '≤ menor ou igual' }, { val: '=', label: '= igual a' }];
            ops.forEach(function(o) {
                const $ob = $('<button class="pp-op-btn' + (selectedOp === o.val ? ' active' : '') + '">' + o.label + '</button>');
                $ob.on('click', function(ev) {
                    ev.stopPropagation();
                    selectedOp = o.val;
                    $picker.find('.pp-op-btn').removeClass('active');
                    $ob.addClass('active');
                });
                $opWrap.append($ob);
            });
            $picker.append($opWrap);

            // Separador
            $picker.append('<div style="width:100%;font-size:10px;color:#888;margin:6px 0 4px;">Nível:</div>');

            // Grid de níveis
            const $grid = $('<div class="pp-lvl-grid"></div>');
            for (let i = 0; i <= maxLvl; i++) {
                const $btn = $('<button class="pp-lvl-btn">' + i + '</button>');
                if (activeVal == i) $btn.addClass('active');
                $btn.on('click', function(ev) {
                    ev.stopPropagation();
                    $('.pp-level-picker').remove();
                    const f = { op: selectedOp, val: i };
                    if (type === 'wall') applyFilters(undefined, undefined, f, undefined);
                    else                 applyFilters(undefined, undefined, undefined, f);
                    updateActiveFilterUI();
                    updateBuildingStatus();
                });
                $grid.append($btn);
            }
            $picker.append($grid);

            // Limpar
            const $clear = $('<button class="pp-lvl-clear">✕ Sem filtro</button>');
            $clear.on('click', function(ev) {
                ev.stopPropagation();
                $('.pp-level-picker').remove();
                if (type === 'wall') applyFilters(undefined, undefined, null, undefined);
                else                 applyFilters(undefined, undefined, undefined, null);
                updateActiveFilterUI();
                updateBuildingStatus();
            });
            $picker.append($clear);

            $('body').append($picker);
            const rect = $anchor[0].getBoundingClientRect();
            $picker.css({ top: rect.bottom + 4 + 'px', left: Math.min(rect.left, window.innerWidth - 240) + 'px' });
        }

        $('#filter-wall-btn').click(function(e) {
            e.stopPropagation();
            openToolbarPicker('wall', $(this));
        });
        $('#filter-tower-btn').click(function(e) {
            e.stopPropagation();
            openToolbarPicker('tower', $(this));
        });

        // Toggle "tem torre"
        $('#filter-has-tower').click(() => {
            const current = window.pp_activeFilter.towerFilter;
            const isActive = current && current.op === '>=' && current.val === 1;
            const next = isActive ? null : { op: '>=', val: 1 };
            applyFilters(undefined, undefined, undefined, next);
            updateActiveFilterUI();
            updateBuildingStatus();
        });

        // Clique nas células de edifício abre picker de nível mínimo
        $(document).on('click', '.pp-building-cell', function(e) {
            e.stopPropagation();
            openToolbarPicker($(this).data('type'), $(this));
        });

        // Fechar picker ao clicar fora
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.pp-level-picker').length) {
                $('.pp-level-picker').remove();
            }
        });

        function filterLabel(f) {
            if (!f) return '';
            const opSym = f.op === '>=' ? '≥' : f.op === '<=' ? '≤' : '=';
            return '<i style="font-style:italic;font-weight:normal;">' + opSym + f.val + '</i>';
        }

        function updateBuildingStatus() {
            const w = window.pp_activeFilter.wallFilter;
            const t = window.pp_activeFilter.towerFilter;
            const wActive = !!w;
            const tActive = !!t;
            $('#filter-wall-label').html(wActive ? filterLabel(w) : '');
            $('#filter-tower-label').html(tActive ? filterLabel(t) : '');
            $('#filter-wall-btn').toggleClass('active-filter', wActive);
            $('#filter-tower-btn').toggleClass('active-filter', tActive);
            const towerToggleActive = tActive && t.op === '>=' && t.val === 1;
            $('#filter-has-tower').toggleClass('active-filter', towerToggleActive);
            const parts = [];
            if (wActive) parts.push('🏰' + filterLabel(w));
            if (tActive) parts.push('🗼' + filterLabel(t));
            $('#building-filter-status').html(parts.length ? parts.join(' | ') : '');
        }

        function doCopyVisible() {
            const coords = [];
            window.pp_rows.forEach(r => {
                if (r.row.is(':visible')) {
                    const c = extractCoordsFromRow(r.row);
                    if (c) coords.push(c);
                }
            });
            if (coords.length) {
                navigator.clipboard.writeText(coords.join(' '));
                if (typeof UI !== 'undefined' && UI.SuccessMessage) {
                    UI.SuccessMessage(getTranslation('copied', coords.length));
                }
            }
        }
        $('#copy-visible').click(doCopyVisible);
        $(document).on('click', '#copy-visible-bottom', doCopyVisible);

        $('#scan-all').click(async () => {
            const performScan = async () => {
                const $progressWrapEarly = $('#pp-progress-wrap');
                $progressWrapEarly.addClass('active');
                $('#pp-scan-done').removeClass('visible');
                $('#pp-progress-fill').css('width','0%');
                $('#pp-progress-text').text(getTranslation('loadingAllVillages'));

                if (!checkAllVillagesLoaded()) {

                    const lastRow = $('#villages_list > tbody > tr:last');
                    const loadAllLink = lastRow.find('a').filter(function () {
                        const txt = ($(this).text() || '').toLowerCase();
                        const oc = $(this).attr('onclick') || '';
                        return txt.includes('todas') || txt.includes('all') || oc.includes('getAllVillages');
                    });

                    if (loadAllLink.length > 0) {
                        loadAllLink[0].click();

                        await new Promise(resolve => {
                            const checkInterval = setInterval(() => {
                                if (checkAllVillagesLoaded()) {
                                    clearInterval(checkInterval);
                                    resolve();
                                }
                            }, 500);

                            setTimeout(() => {
                                clearInterval(checkInterval);
                                resolve();
                            }, 30000);
                        });
                    }
                }

                const $progressWrap = $('#pp-progress-wrap');
                const $progressText = $('#pp-progress-text');
                const $progressFill = $('#pp-progress-fill');
                const $scanDone     = $('#pp-scan-done');

                $scanDone.removeClass('visible');
                $progressFill.css('width', '0%');
                $progressText.text(getTranslation('scanningVillages'));
                $progressWrap.addClass('active');

                const total = window.pp_rows.length;

                for (let i = 0; i < window.pp_rows.length; i++) {
                    const r = window.pp_rows[i];
                    await new Promise(resolve => {
                        r.icon.click();
                        setTimeout(resolve, 600);
                    });

                    const current = i + 1;
                    const percentage = Math.round((current / total) * 100);
                    $progressText.text(getTranslation('scanProgress', current, total, percentage));
                    $progressFill.css('width', percentage + '%');
                }

                $progressFill.css('width', '100%');
                $progressText.text('✔ Concluído');
                $scanDone.text('✅ Scan completo! Todas as aldeias foram analisadas.').addClass('visible');
                updateActiveFilterUI();
                populateContinentChecklist();

                setTimeout(() => {
                    $progressWrap.removeClass('active');
                    $scanDone.removeClass('visible');
                }, 5000);
            };

            const buttons = [{ text: getTranslation('scanAll'), callback: performScan, confirm: true }];
            UI.ConfirmationBox(getTranslation('scanConfirmMessage'), buttons, false, []);
        });

        $('#villages_list').on('click', '.pp-note-icon', function (e) {
            e.stopPropagation();

            const $icon = $(this);
            const villageId = $icon.data('village-id');

            if (!villageId) {
                alert(getTranslation('villageIdNotFound'));
                return;
            }

            const currentState = window.pp_settings.noteStates[villageId];
            if (currentState === 'loading') return;

            window.pp_settings.noteStates[villageId] = 'loading';
            $icon.removeClass('not-loaded off def no-data').addClass('loading').text('...');

            if (typeof game_data === 'undefined' || !game_data.village) {
                alert(getTranslation('gameDataNotAvailable'));
                return;
            }

            const $row = $icon.closest('tr');
            const coords = extractCoordsFromRow($row) || '';
            const coordMatch = coords.match(/(\d+)\|(\d+)/);

            let noteUrl = `${location.origin}/game.php?village=${game_data.village.id}&screen=info_village&id=${villageId}`;
            if (coordMatch) noteUrl += `#${coordMatch[1]};${coordMatch[2]}`;

            $.ajax({
                url: noteUrl,
                type: 'GET',
                dataType: 'html',
                success: function (data) {
                    const $loadedContent = $(data);
                    const $noteBody = $loadedContent.find('.village-note-body');

                    let noteContent = '';
                    let hasData = false;

                    if ($noteBody.length > 0) {
                        $noteBody.each(function () {
                            const content = ($(this).html() || '').trim();
                            if (content.length > 0) {
                                hasData = true;
                                noteContent += $(this).prop('outerHTML');
                            }
                        });
                    }

                    const villageType = hasData ? classifyVillage(noteContent) : 'no-data';

                    // Extrair nivel de muralha e torre da tabela de edificios
                    // O HTML PT tem: <td>Muralha</td><td>20</td> e <td>Torre de vigia</td><td>1</td>
                    // Se o edificio nao aparece na tabela, o nivel e 0.
                    function extractBuildingFromTable($doc, namePatterns) {
                        var found = null;
                        $doc.find('td').each(function() {
                            var cellText = $(this).text().trim().toLowerCase();
                            if (namePatterns.some(function(p) { return cellText === p; })) {
                                var $next = $(this).next('td');
                                if ($next.length) {
                                    var lvl = parseInt($next.text().trim(), 10);
                                    if (!isNaN(lvl)) { found = lvl; return false; }
                                }
                            }
                        });
                        return found; // null = não aparece na tabela = edifício não existe ou não escaneado
                    }

                    var wallLevel  = extractBuildingFromTable($loadedContent, ['muralha', 'wall']);
                    var towerLevel = extractBuildingFromTable($loadedContent, ['torre de vigia', 'watchtower']);

                    window.pp_settings.noteStates[villageId] = villageType;
                    window.pp_settings.wallLevels  = window.pp_settings.wallLevels  || {};
                    window.pp_settings.towerLevels = window.pp_settings.towerLevels || {};
                    if (wallLevel  !== null) window.pp_settings.wallLevels[villageId]  = wallLevel;
                    else delete window.pp_settings.wallLevels[villageId];
                    if (towerLevel !== null) window.pp_settings.towerLevels[villageId] = towerLevel;
                    else delete window.pp_settings.towerLevels[villageId];
                    saveSettings();

                    $icon.removeClass('loading not-loaded off def no-data').addClass(villageType).text(getLabel(villageType));

                    // Actualizar células de muralha e torre nesta linha
                    const $row = $icon.closest('tr');
                    $row.find('.pp-building-cell[data-type="wall"]').replaceWith(getBuildingCellHtml(villageId, 'wall'));
                    $row.find('.pp-building-cell[data-type="tower"]').replaceWith(getBuildingCellHtml(villageId, 'tower'));

                    updateStats();
                    populateContinentChecklist();

                    if (hasData) {
                        showNotePopup(villageId, noteContent, coords);
                    } else {
                        if (typeof UI !== 'undefined' && UI.ErrorMessage) UI.ErrorMessage(getTranslation('noNotesFound'));
                        else alert(getTranslation('noNotesFound'));
                    }
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
            $popup.html(`
                <div class="note-popup-header">
                    <span>${getTranslation('villageNotes', coords || villageId)}</span>
                    <span class="note-popup-close">×</span>
                </div>
                <div class="note-popup-content">${content}</div>
            `);

            $('body').append($popup);

            if (window.pp_settings.popupPosition) {
                $popup.css({
                    top: window.pp_settings.popupPosition.top + 'px',
                    left: window.pp_settings.popupPosition.left + 'px'
                });
            } else {
                const defaultLeft = $(window).width() - $popup.outerWidth() - 20;
                $popup.css({ top: '100px', left: `${defaultLeft}px` });
            }

            $popup.find('.note-popup-close').on('click', function (e) {
                e.stopPropagation();
                $(document).off('.ppDrag');
                $popup.fadeOut(200, function () { $(this).remove(); });
            });

            let isDragging = false;
            let offsetX = 0;
            let offsetY = 0;

            $popup.find('.note-popup-header').on('mousedown', function (e) {
                if ($(e.target).hasClass('note-popup-close')) return;

                isDragging = true;
                const rect = $popup[0].getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;

                $popup.find('.note-popup-header').css('cursor', 'grabbing');
                e.preventDefault();
            });

            $(document).on('mousemove.ppDrag', function (e) {
                if (!isDragging) return;
                e.preventDefault();

                let newLeft = e.clientX - offsetX;
                let newTop = e.clientY - offsetY;

                const windowWidth = $(window).width();
                const windowHeight = $(window).height();
                const popupWidth = $popup.outerWidth();

                const maxLeft = windowWidth - popupWidth;
                const maxTop = windowHeight - 50;

                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));

                $popup.css({ left: `${newLeft}px`, top: `${newTop}px`, right: 'auto' });
            });

            $(document).on('mouseup.ppDrag', function () {
                if (!isDragging) return;
                isDragging = false;
                $popup.find('.note-popup-header').css('cursor', 'move');

                const position = $popup.position();
                window.pp_settings.popupPosition = { top: position.top, left: position.left };
                saveSettings();
            });
        }
    }
})();
