/* ------------------------------------------------------------------
   Charts — small dependency-free SVG renderers.

   Colour roles come from CSS custom properties on .viz-root so light
   and dark modes swap in one place. Every chart carries a hover layer.
   ------------------------------------------------------------------ */

window.Charts = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var tip = null;

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) {
      if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function ensureTip() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'viz-tip';
      tip.setAttribute('role', 'status');
      tip.hidden = true;
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showTip(html, evt) {
    var t = ensureTip();
    t.innerHTML = html;
    t.hidden = false;
    var pad = 14;
    var rect = t.getBoundingClientRect();
    var x = evt.clientX + pad;
    var y = evt.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = Math.max(8, y) + 'px';
  }

  function hideTip() { if (tip) tip.hidden = true; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function empty(host, message) {
    host.innerHTML = '<p class="viz-empty">' + esc(message || 'No tickets match the current filters.') + '</p>';
  }

  function niceMax(v) {
    if (v <= 5) return Math.max(1, v);
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / (mag / 2)) * (mag / 2);
  }

  /* ---------------- horizontal bar chart ----------------
     Magnitude comparison across a named list. Rows keep a fixed
     order so a colour never migrates between entities. */
  function barH(host, opts) {
    host.innerHTML = '';
    var data = (opts.data || []).slice();
    if (opts.sort !== false) data.sort(function (a, b) { return b.value - a.value; });
    if (opts.limit) data = data.slice(0, opts.limit);
    if (!data.length || data.every(function (d) { return !d.value; })) return empty(host, opts.emptyText);

    var rowH = opts.rowHeight || 26;
    var gap = 6;
    var labelW = opts.labelWidth || 168;
    var valueW = 46;
    var width = host.clientWidth || 640;
    var plotW = Math.max(60, width - labelW - valueW - 8);
    var height = data.length * (rowH + gap) - gap + 4;
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.value; })));

    var svg = el('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: '100%', height: height,
      role: 'img', 'aria-label': opts.ariaLabel || 'Bar chart'
    }, host);

    data.forEach(function (d, i) {
      var y = i * (rowH + gap);
      var w = max ? Math.max(d.value ? 3 : 0, (d.value / max) * plotW) : 0;
      var g = el('g', { class: 'viz-row' + (opts.onSelect ? ' is-clickable' : '') }, svg);

      el('rect', { x: 0, y: y, width: width, height: rowH, fill: 'transparent' }, g);

      var label = el('text', {
        x: labelW - 10, y: y + rowH / 2, 'text-anchor': 'end',
        'dominant-baseline': 'central', class: 'viz-label'
      }, g);
      label.textContent = d.short || d.label;

      el('rect', {
        x: labelW, y: y + 3, width: plotW, height: rowH - 6,
        rx: 4, class: 'viz-track'
      }, g);

      if (w > 0) {
        el('rect', {
          x: labelW, y: y + 3, width: w, height: rowH - 6,
          rx: 4, fill: d.color || opts.color || 'var(--series-1)'
        }, g);
      }

      var val = el('text', {
        x: labelW + plotW + 8, y: y + rowH / 2,
        'dominant-baseline': 'central', class: 'viz-value'
      }, g);
      val.textContent = d.value;

      g.addEventListener('mousemove', function (e) {
        showTip('<strong>' + esc(d.label) + '</strong><br>' +
          esc(d.value) + ' ' + (d.value === 1 ? 'ticket' : 'tickets') +
          (opts.total ? ' &middot; ' + Math.round((d.value / opts.total) * 100) + '% of shown' : ''), e);
      });
      g.addEventListener('mouseleave', hideTip);
      if (opts.onSelect) {
        g.addEventListener('click', function () { hideTip(); opts.onSelect(d); });
      }
    });
    return svg;
  }

  /* ---------------- trend line ----------------
     One series over time: 2px line, area wash, crosshair tooltip. */
  function line(host, opts) {
    host.innerHTML = '';
    var data = opts.data || [];
    if (data.length < 2) return empty(host, opts.emptyText || 'Not enough history to draw a trend yet.');

    var width = host.clientWidth || 640;
    var height = opts.height || 200;
    var m = { top: 12, right: 12, bottom: 26, left: 34 };
    var plotW = width - m.left - m.right;
    var plotH = height - m.top - m.bottom;
    /* pick a maximum the tick count divides exactly, so every axis
       label is a whole number of tickets */
    var ticks = 4;
    var peak = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    var step = Math.ceil(peak / ticks);
    [1, 2, 5, 10, 20, 25, 50, 100].some(function (n) { if (n >= step) { step = n; return true; } });
    var max = step * ticks;

    var svg = el('svg', {
      viewBox: '0 0 ' + width + ' ' + height, width: '100%', height: height,
      role: 'img', 'aria-label': opts.ariaLabel || 'Tickets over time'
    }, host);

    var x = function (i) { return m.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW); };
    var y = function (v) { return m.top + plotH - (v / max) * plotH; };

    /* recessive gridlines + axis */
    for (var g = 0; g <= ticks; g++) {
      var v = (max / ticks) * g;
      el('line', { x1: m.left, x2: m.left + plotW, y1: y(v), y2: y(v), class: 'viz-grid' }, svg);
      var lab = el('text', { x: m.left - 8, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'central', class: 'viz-axis' }, svg);
      lab.textContent = Math.round(v);
    }

    var path = data.map(function (d, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(d.value); }).join(' ');
    el('path', {
      d: path + ' L' + x(data.length - 1) + ' ' + (m.top + plotH) + ' L' + x(0) + ' ' + (m.top + plotH) + ' Z',
      class: 'viz-area'
    }, svg);
    el('path', { d: path, class: 'viz-line' }, svg);

    /* x labels: first, middle, last only — no collisions */
    [0, Math.floor((data.length - 1) / 2), data.length - 1].filter(function (v, i, a) { return a.indexOf(v) === i; })
      .forEach(function (i) {
        var t = el('text', {
          x: x(i), y: height - 6,
          'text-anchor': i === 0 ? 'start' : (i === data.length - 1 ? 'end' : 'middle'),
          class: 'viz-axis'
        }, svg);
        t.textContent = fmtDay(data[i].key);
      });

    var cross = el('line', { class: 'viz-cross', y1: m.top, y2: m.top + plotH, x1: 0, x2: 0, opacity: 0 }, svg);
    var dot = el('circle', { r: 4.5, class: 'viz-dot', opacity: 0 }, svg);

    var hit = el('rect', { x: m.left, y: m.top, width: plotW, height: plotH, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', function (e) {
      var box = svg.getBoundingClientRect();
      var px = (e.clientX - box.left) * (width / box.width);
      var i = Math.round(((px - m.left) / plotW) * (data.length - 1));
      i = Math.max(0, Math.min(data.length - 1, i));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(data[i].value)); dot.setAttribute('opacity', 1);
      showTip('<strong>' + esc(fmtDayLong(data[i].key)) + '</strong><br>' +
        data[i].value + ' ' + (data[i].value === 1 ? 'ticket' : 'tickets') + ' logged', e);
    });
    hit.addEventListener('mouseleave', function () {
      cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip();
    });
    return svg;
  }

  /* ---------------- heatmap ----------------
     One hue, light to dark — magnitude of system x business unit. */
  function heatmap(host, opts) {
    host.innerHTML = '';
    var rows = opts.rows || [], cols = opts.cols || [], cells = opts.cells || [];
    var max = 0;
    cells.forEach(function (r) { r.forEach(function (v) { max = Math.max(max, v); }); });
    if (!max) return empty(host, opts.emptyText);

    var labelW = 170, headH = 82, gap = 3;
    /* the rotated column headings run up and to the right of the last cell */
    var rightPad = 92;
    /* grow the cells to use the width available, within sensible bounds */
    var avail = (host.clientWidth || 640) - labelW - rightPad - 2;
    var cell = Math.max(28, Math.min(48, Math.floor(avail / cols.length) - gap));
    var width = labelW + cols.length * (cell + gap) + rightPad;
    var height = headH + rows.length * (cell + gap);

    var svg = el('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      width: width, height: height,
      style: 'display:block',
      role: 'img', 'aria-label': 'System by business unit impact matrix'
    }, host);

    cols.forEach(function (c, j) {
      var cx = labelW + j * (cell + gap) + cell / 2;
      var t = el('text', {
        x: cx, y: headH - 10, class: 'viz-axis',
        transform: 'rotate(-45 ' + cx + ' ' + (headH - 10) + ')', 'text-anchor': 'start'
      }, svg);
      t.textContent = c.short;
    });

    rows.forEach(function (r, i) {
      var ry = headH + i * (cell + gap);
      var t = el('text', {
        x: labelW - 10, y: ry + cell / 2, 'text-anchor': 'end',
        'dominant-baseline': 'central', class: 'viz-label'
      }, svg);
      t.textContent = r.short;

      cols.forEach(function (c, j) {
        var v = cells[i][j];
        var rect = el('rect', {
          x: labelW + j * (cell + gap), y: ry, width: cell, height: cell, rx: 3,
          fill: v ? rampColor(v / max) : 'var(--viz-track)',
          class: 'viz-cell' + (opts.onSelect ? ' is-clickable' : '')
        }, svg);
        if (v) {
          var lab = el('text', {
            x: labelW + j * (cell + gap) + cell / 2, y: ry + cell / 2,
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            class: 'viz-cell-value', fill: v / max > 0.55 ? '#fff' : 'var(--text-primary)'
          }, svg);
          lab.textContent = v;
        }
        rect.addEventListener('mousemove', function (e) {
          showTip('<strong>' + esc(r.label) + '</strong><br>' + esc(c.label) + '<br>' +
            v + ' ' + (v === 1 ? 'ticket' : 'tickets'), e);
        });
        rect.addEventListener('mouseleave', hideTip);
        if (opts.onSelect) rect.addEventListener('click', function () { hideTip(); opts.onSelect(r, c, v); });
      });
    });
    return svg;
  }

  /* Sequential blue ramp, 100 -> 700. */
  var RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec',
              '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];
  function rampColor(t) {
    var i = Math.round(Math.min(1, Math.max(0, t)) * (RAMP.length - 3)) + 2;
    return RAMP[Math.min(RAMP.length - 1, i)];
  }

  function fmtDay(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function fmtDayLong(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  return { barH: barH, line: line, heatmap: heatmap, hideTip: hideTip, rampColor: rampColor };
})();
