/* ------------------------------------------------------------------
   Dashboard — reads the filtered ticket set and paints the tiles,
   charts and table. Every chart is one measure on one axis.
   ------------------------------------------------------------------ */

window.Dashboard = (function () {
  var filter = Object.assign({}, window.Store.EMPTY_FILTER);
  var sort = { key: 'loggedAt', dir: -1 };
  var onEdit = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function $(sel) { return document.querySelector(sel); }

  function getFilter() { return filter; }

  function setFilter(patch, rerender) {
    Object.assign(filter, patch);
    syncFilterControls();
    if (rerender !== false) render();
  }

  function clearFilter() {
    filter = Object.assign({}, window.Store.EMPTY_FILTER);
    syncFilterControls();
    render();
  }

  function activeCount() {
    return Object.keys(window.Store.EMPTY_FILTER).filter(function (k) { return filter[k]; }).length;
  }

  /* ---------------- filter bar ---------------- */

  function buildFilterControls() {
    var cfg = window.Store.getConfig();
    fill('#f-system', cfg.systems.map(function (s) { return { v: s.no, t: s.no + '. ' + s.name }; }), 'All systems');
    fill('#f-unit', cfg.businessUnits.map(function (u) { return { v: u.no, t: u.no + '. ' + u.name }; }), 'All business units');
    fill('#f-answer', cfg.answerCodes.map(function (a) { return { v: a.code, t: a.code + ' — ' + a.label }; }), 'All answer codes');
    fill('#f-status', cfg.statuses.map(function (s) { return { v: s, t: s }; }), 'Any status');
    fill('#f-priority', cfg.priorities.map(function (p) { return { v: p, t: p }; }), 'Any priority');
  }

  function fill(sel, items, allLabel) {
    var node = $(sel);
    if (!node) return;
    var current = node.value;
    node.innerHTML = '<option value="">' + esc(allLabel) + '</option>' +
      items.map(function (i) { return '<option value="' + esc(i.v) + '">' + esc(i.t) + '</option>'; }).join('');
    node.value = current;
  }

  function syncFilterControls() {
    var map = {
      '#f-system': 'system', '#f-unit': 'unit', '#f-answer': 'answer',
      '#f-status': 'status', '#f-priority': 'priority',
      '#f-from': 'from', '#f-to': 'to', '#f-text': 'text'
    };
    Object.keys(map).forEach(function (sel) {
      var node = $(sel);
      if (node && node.value !== String(filter[map[sel]] || '')) node.value = filter[map[sel]] || '';
    });
    var badge = $('#filter-count');
    if (badge) {
      var n = activeCount();
      badge.textContent = n ? n + ' filter' + (n === 1 ? '' : 's') + ' active' : 'No filters';
      badge.classList.toggle('is-on', n > 0);
    }
  }

  function wireFilters(rerender) {
    var map = {
      'f-system': 'system', 'f-unit': 'unit', 'f-answer': 'answer',
      'f-status': 'status', 'f-priority': 'priority',
      'f-from': 'from', 'f-to': 'to'
    };
    Object.keys(map).forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.addEventListener('change', function () { filter[map[id]] = node.value; syncFilterControls(); rerender(); });
    });
    var text = document.getElementById('f-text');
    if (text) {
      var timer = null;
      text.addEventListener('input', function () {
        clearTimeout(timer);
        timer = setTimeout(function () { filter.text = text.value; syncFilterControls(); rerender(); }, 180);
      });
    }
    var clear = document.getElementById('f-clear');
    if (clear) clear.addEventListener('click', clearFilter);
  }

  /* ---------------- tiles ---------------- */

  function tile(label, value, note, tone) {
    return '<div class="tile' + (tone ? ' tone-' + tone : '') + '">' +
      '<span class="tile-label">' + esc(label) + '</span>' +
      '<span class="tile-value">' + esc(value) + '</span>' +
      '<span class="tile-note">' + (note || '') + '</span></div>';
  }

  function renderTiles(list) {
    var s = window.Store.summary(list);
    var host = $('#tiles');
    if (!host) return;
    host.innerHTML =
      tile('Tickets shown', s.total, s.today + ' logged today') +
      tile('Still open', s.open, s.p1 ? '<span class="pill tone-critical">' + s.p1 + ' P1</span>' : 'No P1s open', s.p1 ? 'critical' : '') +
      tile('Systems impacted', s.systemsImpacted + ' / ' + window.Store.getConfig().systems.length,
           s.topSystem ? 'Worst: ' + esc(s.topSystem.short) + ' (' + s.topSystem.value + ')' : '&nbsp;') +
      tile('Business units hit', s.unitsImpacted + ' / ' + window.Store.getConfig().businessUnits.length,
           s.topUnit ? 'Worst: ' + esc(s.topUnit.short) + ' (' + s.topUnit.value + ')' : '&nbsp;') +
      tile('Top answer code', s.topAnswer ? s.topAnswer.short : '—',
           s.topAnswer ? esc((window.Store.answerByCode(s.topAnswer.key) || {}).label || 'Not in the code list') : '&nbsp;') +
      tile('From photos', s.fromPhoto, s.uncoded ? '<span class="pill tone-warning">' + s.uncoded + ' uncoded</span>' : 'All tickets coded');
  }

  /* ---------------- charts ---------------- */

  function renderCharts(list) {
    var total = list.length;

    window.Charts.barH($('#chart-systems'), {
      data: window.Store.countBySystem(list),
      total: total, limit: 22, labelWidth: 190, color: 'var(--series-1)',
      ariaLabel: 'Tickets by system',
      emptyText: 'No tickets for these filters.',
      onSelect: function (d) { setFilter({ system: String(d.key) }); }
    });

    window.Charts.barH($('#chart-units'), {
      data: window.Store.countByUnit(list),
      total: total, labelWidth: 150, color: 'var(--series-2)',
      ariaLabel: 'Tickets by business unit',
      onSelect: function (d) { setFilter({ unit: String(d.key) }); }
    });

    window.Charts.barH($('#chart-answers'), {
      data: window.Store.countByAnswer(list), limit: 10,
      total: total, labelWidth: 76, color: 'var(--series-3)',
      ariaLabel: 'Most used answer codes',
      onSelect: function (d) { setFilter({ answer: String(d.key) }); }
    });

    var priTone = { P1: 'var(--status-critical)', P2: 'var(--status-serious)', P3: 'var(--status-warning)', P4: 'var(--status-good)' };
    var pri = window.Store.getConfig().priorities.map(function (p) {
      return {
        key: p, label: p, short: p, color: priTone[p] || 'var(--series-1)',
        value: list.filter(function (t) { return t.priority === p; }).length
      };
    });
    window.Charts.barH($('#chart-priority'), {
      data: pri, sort: false, total: total, labelWidth: 60, rowHeight: 22,
      ariaLabel: 'Tickets by priority',
      onSelect: function (d) { setFilter({ priority: String(d.key) }); }
    });

    window.Charts.line($('#chart-trend'), {
      data: window.Store.countByDay(list, 21), height: 190,
      ariaLabel: 'Tickets logged per day'
    });

    var m = window.Store.impactMatrix(list);
    window.Charts.heatmap($('#chart-heatmap'), {
      rows: m.rows, cols: m.cols, cells: m.cells,
      onSelect: function (r, c) { setFilter({ system: String(r.key), unit: String(c.key) }); }
    });
  }

  /* ---------------- table ---------------- */

  var COLUMNS = [
    { key: 'ref', label: 'Ref' },
    { key: 'loggedAt', label: 'Logged' },
    { key: 'systemNo', label: 'Sys' },
    { key: 'systemName', label: 'System' },
    { key: 'systemId', label: 'System id' },
    { key: 'businessUnits', label: 'Business units', sortable: false },
    { key: 'answerCode', label: 'Answer' },
    { key: 'priority', label: 'Pri' },
    { key: 'status', label: 'Status' },
    { key: 'summary', label: 'Summary', sortable: false },
    { key: 'source', label: 'Source' }
  ];

  function sortList(list) {
    var k = sort.key, dir = sort.dir;
    return list.slice().sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function renderTable(list) {
    var host = $('#table-host');
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<p class="viz-empty">No tickets match the current filters.</p>';
      return;
    }
    var rows = sortList(list);
    var head = COLUMNS.map(function (c) {
      var on = sort.key === c.key;
      return '<th' + (c.sortable === false ? '' : ' class="sortable' + (on ? ' is-sorted' : '') +
        '" data-sort="' + c.key + '" tabindex="0" role="button"') + '>' +
        esc(c.label) + (on ? '<span aria-hidden="true">' + (sort.dir > 0 ? ' ▲' : ' ▼') + '</span>' : '') + '</th>';
    }).join('');

    var body = rows.map(function (t) {
      var idCheck = window.Store.validateSystemId(t.systemNo, t.systemId);
      var ans = window.Store.answerByCode(t.answerCode);
      return '<tr data-id="' + esc(t.id) + '">' +
        '<td class="mono">' + esc(t.ref) + '</td>' +
        '<td class="nowrap">' + esc(fmtDateTime(t.loggedAt)) + '</td>' +
        '<td class="num">' + esc(t.systemNo) + '</td>' +
        '<td>' + esc(t.systemName) + '</td>' +
        '<td class="mono">' + esc(t.systemId || '—') +
          (t.systemId && !idCheck.ok ? ' <span class="pill tone-warning" title="Expected something like ' +
            esc(idCheck.expected) + '">?</span>' : '') + '</td>' +
        '<td>' + (t.businessUnits.length
            ? t.businessUnits.map(function (u) {
                return '<span class="chip" title="' + esc(window.Store.unitLabel(u)) + '">' + u + '</span>';
              }).join('')
            : '—') + '</td>' +
        '<td class="mono" title="' + esc(ans ? ans.label : 'Not in the code list') + '">' + esc(t.answerCode || '—') +
          (t.answerCode && !ans ? ' <span class="pill tone-warning">?</span>' : '') + '</td>' +
        '<td><span class="pri pri-' + esc(t.priority) + '">' + esc(t.priority) + '</span></td>' +
        '<td class="nowrap">' + esc(t.status) + '</td>' +
        '<td class="summary">' + esc(t.summary || '—') + '</td>' +
        '<td>' + (t.source === 'photo'
            ? '<span class="pill tone-photo" title="Captured from a photograph">photo</span>'
            : '<span class="pill">' + esc(t.source) + '</span>') + '</td>' +
        '</tr>';
    }).join('');

    host.innerHTML = '<table class="grid"><thead><tr>' + head +
      '</tr></thead><tbody>' + body + '</tbody></table>';

    host.querySelectorAll('th.sortable').forEach(function (th) {
      function apply() {
        var k = th.getAttribute('data-sort');
        if (sort.key === k) sort.dir *= -1; else { sort.key = k; sort.dir = 1; }
        renderTable(list);
      }
      th.addEventListener('click', apply);
      th.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); } });
    });

    host.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () {
        if (onEdit) onEdit(tr.getAttribute('data-id'));
      });
    });

    var count = $('#table-count');
    if (count) count.textContent = list.length + ' of ' + window.Store.all().length + ' tickets';
  }

  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------- entry point ---------------- */

  function filtered() {
    return window.Store.applyFilter(window.Store.all(), filter);
  }

  function render() {
    var list = filtered();
    syncFilterControls();
    renderTiles(list);
    renderCharts(list);
    renderTable(list);
    var insight = $('#insight');
    if (insight) insight.innerHTML = insightText(list);
  }

  function insightText(list) {
    if (!list.length) return 'Log a ticket — or photograph one — and the picture builds itself.';
    var s = window.Store.summary(list);
    var bits = [];
    if (s.topSystem) {
      bits.push('<strong>' + esc(s.topSystem.short) + '</strong> carries the most tickets (' +
        s.topSystem.value + ', ' + Math.round((s.topSystem.value / s.total) * 100) + '% of those shown)');
    }
    if (s.topUnit) {
      bits.push('<strong>' + esc(s.topUnit.short) + '</strong> is the hardest hit business unit (' + s.topUnit.value + ')');
    }
    if (s.topAnswer) {
      var a = window.Store.answerByCode(s.topAnswer.key);
      bits.push('the commonest answer is <strong>' + esc(s.topAnswer.short) + '</strong>' +
        (a ? ' — ' + esc(a.label.toLowerCase()) : ''));
    }
    return bits.join('; ') + '.';
  }

  function init(opts) {
    onEdit = opts && opts.onEdit;
    buildFilterControls();
    wireFilters(render);
    window.addEventListener('resize', debounce(render, 200));
  }

  function debounce(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  return {
    init: init, render: render, filtered: filtered,
    getFilter: getFilter, setFilter: setFilter, clearFilter: clearFilter,
    buildFilterControls: buildFilterControls
  };
})();
