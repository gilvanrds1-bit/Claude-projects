/* ------------------------------------------------------------------
   Store — persistence, ticket CRUD and every aggregation the
   dashboard reads. Data lives in the browser (localStorage) so the
   platform runs as a plain static site with no backend.
   ------------------------------------------------------------------ */

window.Store = (function () {
  var K_TICKETS = 'sdp.tickets.v1';
  var K_CONFIG  = 'sdp.config.v1';
  var K_PREFS   = 'sdp.prefs.v1';

  var tickets = [];
  var config  = null;
  var prefs   = { theme: 'system', autoAdd: true, lastAgent: '' };
  var listeners = [];

  /* ---------------- persistence ---------------- */

  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Could not read ' + key, e);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Could not save ' + key, e);
      notify('storage-error', e);
      return false;
    }
  }

  function load() {
    config  = readJSON(K_CONFIG, null) || deepCopy(window.SDP_DEFAULT_CONFIG);
    tickets = readJSON(K_TICKETS, []);
    prefs   = Object.assign(prefs, readJSON(K_PREFS, {}));
    return { config: config, tickets: tickets, prefs: prefs };
  }

  function saveTickets() { writeJSON(K_TICKETS, tickets); notify('tickets'); }
  function saveConfig()  { writeJSON(K_CONFIG, config);   notify('config'); }
  function savePrefs()   { writeJSON(K_PREFS, prefs); }

  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  function on(fn) { listeners.push(fn); }
  function notify(what, detail) { listeners.forEach(function (fn) { fn(what, detail); }); }

  /* ---------------- lookups ---------------- */

  function getConfig() { return config; }
  function getPrefs()  { return prefs; }

  function setPref(key, value) { prefs[key] = value; savePrefs(); }

  function systemByNo(no) {
    no = Number(no);
    for (var i = 0; i < config.systems.length; i++) {
      if (Number(config.systems[i].no) === no) return config.systems[i];
    }
    return null;
  }

  function unitByNo(no) {
    no = Number(no);
    for (var i = 0; i < config.businessUnits.length; i++) {
      if (Number(config.businessUnits[i].no) === no) return config.businessUnits[i];
    }
    return null;
  }

  function answerByCode(code) {
    code = String(code || '').trim();
    for (var i = 0; i < config.answerCodes.length; i++) {
      if (config.answerCodes[i].code === code) return config.answerCodes[i];
    }
    return null;
  }

  function systemLabel(no) {
    var s = systemByNo(no);
    return s ? s.no + '. ' + s.name : 'System ' + no;
  }

  function unitLabel(no) {
    var u = unitByNo(no);
    return u ? u.name : 'Business unit ' + no;
  }

  function unitShort(no) {
    var u = unitByNo(no);
    return u ? (u.short || u.name) : 'BU ' + no;
  }

  function answerLabel(code) {
    var a = answerByCode(code);
    return a ? a.code + ' — ' + a.label : String(code || '');
  }

  /* Codes are compared with punctuation and case ignored, so "ca 1",
     "CA-1" and "ca1" all count as the same configuration item. */
  function normCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function systemByCode(code) {
    var k = normCode(code);
    if (!k) return null;
    for (var i = 0; i < config.systems.length; i++) {
      if (config.systems[i].code && normCode(config.systems[i].code) === k) return config.systems[i];
    }
    return null;
  }

  /* Does this id match the code recorded against that system? */
  function validateSystemId(systemNo, systemId) {
    var s = systemByNo(systemNo);
    if (!s || !s.code || !systemId) return { ok: true, expected: s ? s.code : '' };
    return { ok: normCode(systemId) === normCode(s.code), expected: s.code };
  }

  /* ---------------- ticket CRUD ---------------- */

  function nextRef() {
    var max = 0;
    tickets.forEach(function (t) {
      var m = /^SD-(\d+)$/.exec(t.ref || '');
      if (m) max = Math.max(max, Number(m[1]));
    });
    return 'SD-' + String(max + 1).padStart(5, '0');
  }

  function normalise(t) {
    var units = (t.businessUnits || []).map(Number)
      .filter(function (n) { return !isNaN(n); });
    units = units.filter(function (n, i) { return units.indexOf(n) === i; }).sort(function (a, b) { return a - b; });

    var sys = systemByNo(t.systemNo);
    return {
      id:            t.id || ('t_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      ref:           t.ref || nextRef(),
      loggedAt:      t.loggedAt || new Date().toISOString(),
      systemNo:      Number(t.systemNo),
      systemName:    sys ? sys.name : (t.systemName || ''),
      systemId:      String(t.systemId || (sys && sys.code) || '').trim(),
      businessUnits: units,
      answerCode:    String(t.answerCode || '').trim(),
      priority:      t.priority || 'P3',
      status:        t.status || 'Open',
      channel:       t.channel || 'Phone',
      summary:       String(t.summary || '').trim(),
      reportedBy:    String(t.reportedBy || '').trim(),
      loggedBy:      String(t.loggedBy || prefs.lastAgent || '').trim(),
      source:        t.source || 'manual',
      ocr:           t.ocr || null,
      thumb:         t.thumb || null
    };
  }

  function addTicket(raw) {
    var t = normalise(raw);
    tickets.push(t);
    saveTickets();
    return t;
  }

  function addMany(list) {
    /* push as we go — normalise() reads the array to pick the next reference */
    var added = list.map(function (raw) {
      var t = normalise(raw);
      tickets.push(t);
      return t;
    });
    saveTickets();
    return added;
  }

  function updateTicket(id, patch) {
    for (var i = 0; i < tickets.length; i++) {
      if (tickets[i].id === id) {
        tickets[i] = normalise(Object.assign({}, tickets[i], patch));
        saveTickets();
        return tickets[i];
      }
    }
    return null;
  }

  function deleteTicket(id) {
    var before = tickets.length;
    tickets = tickets.filter(function (t) { return t.id !== id; });
    if (tickets.length !== before) saveTickets();
  }

  function clearTickets() { tickets = []; saveTickets(); }

  function all() { return tickets.slice(); }

  function byId(id) {
    return tickets.filter(function (t) { return t.id === id; })[0] || null;
  }

  /* ---------------- filtering ---------------- */

  var EMPTY_FILTER = {
    system: '', unit: '', answer: '', status: '', priority: '',
    from: '', to: '', text: ''
  };

  function applyFilter(list, f) {
    f = Object.assign({}, EMPTY_FILTER, f || {});
    var text = f.text.trim().toLowerCase();
    return list.filter(function (t) {
      if (f.system && Number(t.systemNo) !== Number(f.system)) return false;
      if (f.unit && t.businessUnits.indexOf(Number(f.unit)) === -1) return false;
      if (f.answer && t.answerCode !== f.answer) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.from && t.loggedAt.slice(0, 10) < f.from) return false;
      if (f.to && t.loggedAt.slice(0, 10) > f.to) return false;
      if (text) {
        var hay = [t.ref, t.systemName, t.systemId, t.summary, t.reportedBy,
                   t.loggedBy, t.answerCode, answerLabel(t.answerCode)]
          .join(' ').toLowerCase();
        if (hay.indexOf(text) === -1) return false;
      }
      return true;
    });
  }

  /* ---------------- aggregation ---------------- */

  function countBySystem(list) {
    return config.systems.map(function (s) {
      return {
        key: s.no,
        label: s.no + '. ' + s.name,
        short: s.name,
        value: list.filter(function (t) { return Number(t.systemNo) === Number(s.no); }).length
      };
    });
  }

  function countByUnit(list) {
    return config.businessUnits.map(function (u) {
      return {
        key: u.no,
        label: u.no + '. ' + u.name,
        short: u.short || u.name,
        value: list.filter(function (t) { return t.businessUnits.indexOf(Number(u.no)) !== -1; }).length
      };
    });
  }

  function countByAnswer(list) {
    var seen = {};
    list.forEach(function (t) {
      var c = t.answerCode || '(none)';
      seen[c] = (seen[c] || 0) + 1;
    });
    return Object.keys(seen).map(function (code) {
      var a = answerByCode(code);
      return {
        key: code,
        label: code + (a ? ' — ' + a.label : ''),
        short: code,
        category: a ? a.category : 'Uncoded',
        value: seen[code]
      };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function countByField(list, field) {
    var seen = {};
    list.forEach(function (t) { var k = t[field] || '(none)'; seen[k] = (seen[k] || 0) + 1; });
    return Object.keys(seen).map(function (k) {
      return { key: k, label: k, short: k, value: seen[k] };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  /* Daily counts across the range covered by the list (gap filled). */
  function countByDay(list, minDays) {
    minDays = minDays || 14;
    var days = {};
    list.forEach(function (t) {
      var d = t.loggedAt.slice(0, 10);
      days[d] = (days[d] || 0) + 1;
    });
    var keys = Object.keys(days).sort();
    var end = new Date();
    var start = keys.length ? new Date(keys[0] + 'T00:00:00') : new Date();
    var span = Math.round((end - start) / 86400000) + 1;
    if (span < minDays) start = new Date(end.getTime() - (minDays - 1) * 86400000);
    var out = [];
    for (var d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
      var key = d.toISOString().slice(0, 10);
      out.push({ key: key, label: key, value: days[key] || 0 });
    }
    return out;
  }

  /* System (rows) x business unit (cols) impact matrix. */
  function impactMatrix(list) {
    var rows = config.systems.map(function (s) { return { key: s.no, label: s.no + '. ' + s.name, short: s.name }; });
    var cols = config.businessUnits.map(function (u) { return { key: u.no, label: u.name, short: u.short || u.name }; });
    var cells = rows.map(function (r) {
      return cols.map(function (c) {
        return list.filter(function (t) {
          return Number(t.systemNo) === Number(r.key) && t.businessUnits.indexOf(Number(c.key)) !== -1;
        }).length;
      });
    });
    return { rows: rows, cols: cols, cells: cells };
  }

  function summary(list) {
    var open = list.filter(function (t) { return t.status !== 'Resolved' && t.status !== 'Closed'; }).length;
    var p1 = list.filter(function (t) { return t.priority === 'P1'; }).length;
    var systems = {}, units = {}, uncoded = 0;
    list.forEach(function (t) {
      systems[t.systemNo] = true;
      t.businessUnits.forEach(function (u) { units[u] = true; });
      if (!answerByCode(t.answerCode)) uncoded++;
    });
    var bySys = countBySystem(list).slice().sort(function (a, b) { return b.value - a.value; });
    var byUnit = countByUnit(list).slice().sort(function (a, b) { return b.value - a.value; });
    var byAns = countByAnswer(list);
    var today = new Date().toISOString().slice(0, 10);
    return {
      total: list.length,
      open: open,
      p1: p1,
      today: list.filter(function (t) { return t.loggedAt.slice(0, 10) === today; }).length,
      systemsImpacted: Object.keys(systems).length,
      unitsImpacted: Object.keys(units).length,
      uncoded: uncoded,
      fromPhoto: list.filter(function (t) { return t.source === 'photo'; }).length,
      topSystem: bySys[0] && bySys[0].value ? bySys[0] : null,
      topUnit: byUnit[0] && byUnit[0].value ? byUnit[0] : null,
      topAnswer: byAns[0] || null
    };
  }

  /* ---------------- import / export ---------------- */

  function toCSV(list) {
    var head = ['Ref', 'Logged at', 'System no', 'System name', 'System id',
                'Business units', 'Business unit names', 'Answer code', 'Answer',
                'Priority', 'Status', 'Channel', 'Summary', 'Reported by', 'Logged by', 'Source'];
    var rows = list.map(function (t) {
      return [
        t.ref, t.loggedAt, t.systemNo, t.systemName, t.systemId,
        t.businessUnits.join(' '),
        t.businessUnits.map(unitLabel).join('; '),
        t.answerCode,
        (answerByCode(t.answerCode) || {}).label || '',
        t.priority, t.status, t.channel, t.summary, t.reportedBy, t.loggedBy, t.source
      ];
    });
    return [head].concat(rows).map(function (r) {
      return r.map(function (cell) {
        var s = String(cell == null ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
  }

  function exportBundle() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      config: config,
      tickets: tickets
    };
  }

  function importBundle(bundle, mode) {
    if (!bundle || typeof bundle !== 'object') throw new Error('Not a valid export file.');
    var incoming = Array.isArray(bundle) ? bundle : (bundle.tickets || []);
    if (bundle.config && bundle.config.systems) { config = bundle.config; saveConfig(); }
    if (mode === 'replace') tickets = [];
    var existing = {};
    tickets.forEach(function (t) { existing[t.ref] = true; });
    var added = 0;
    incoming.forEach(function (raw) {
      if (raw.ref && existing[raw.ref]) return;
      tickets.push(normalise(raw));
      added++;
    });
    saveTickets();
    return added;
  }

  function resetConfig() {
    config = deepCopy(window.SDP_DEFAULT_CONFIG);
    saveConfig();
  }

  return {
    load: load, on: on,
    getConfig: getConfig, saveConfig: saveConfig, resetConfig: resetConfig,
    getPrefs: getPrefs, setPref: setPref,
    systemByNo: systemByNo, unitByNo: unitByNo, answerByCode: answerByCode,
    systemLabel: systemLabel, unitLabel: unitLabel, unitShort: unitShort,
    answerLabel: answerLabel, validateSystemId: validateSystemId,
    nextRef: nextRef, addTicket: addTicket, addMany: addMany,
    updateTicket: updateTicket, deleteTicket: deleteTicket, clearTickets: clearTickets,
    all: all, byId: byId,
    EMPTY_FILTER: EMPTY_FILTER, applyFilter: applyFilter,
    countBySystem: countBySystem, countByUnit: countByUnit, countByAnswer: countByAnswer,
    countByField: countByField, countByDay: countByDay, impactMatrix: impactMatrix,
    summary: summary,
    toCSV: toCSV, exportBundle: exportBundle, importBundle: importBundle
  };
})();
