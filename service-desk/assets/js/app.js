/* ------------------------------------------------------------------
   App — tabs, the ticket form, the photo capture queue, reference
   data editing and import/export.
   ------------------------------------------------------------------ */

(function () {
  var Store = window.Store, Dash = window.Dashboard, OCR = window.OCR;
  var editingId = null;
  var queue = [];          /* capture results awaiting confirmation */

  function $(s, root) { return (root || document).querySelector(s); }
  function $$(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function toast(message, tone) {
    var host = $('#toasts');
    var node = document.createElement('div');
    node.className = 'toast' + (tone ? ' tone-' + tone : '');
    node.textContent = message;
    host.appendChild(node);
    setTimeout(function () { node.classList.add('is-out'); }, 3600);
    setTimeout(function () { node.remove(); }, 4200);
  }

  /* ================= tabs ================= */

  function showTab(name) {
    $$('.tab-panel').forEach(function (p) { p.hidden = p.getAttribute('data-tab') !== name; });
    $$('.tab-btn').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (name === 'dashboard') Dash.render();
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ================= theme ================= */

  function applyTheme(mode) {
    if (mode === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', mode);
    Store.setPref('theme', mode);
    var btn = $('#theme-btn');
    if (btn) btn.textContent = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'Auto';
    if (!$('.tab-panel[data-tab="dashboard"]').hidden) Dash.render();
  }

  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    var next = order[(order.indexOf(Store.getPrefs().theme || 'system') + 1) % order.length];
    applyTheme(next);
  }

  /* ================= ticket form ================= */

  function buildFormOptions() {
    var cfg = Store.getConfig();

    $('#t-system').innerHTML = '<option value="">Choose a system…</option>' +
      cfg.systems.map(function (s) {
        return '<option value="' + s.no + '">' + esc(s.no + '. ' + s.name) + '</option>';
      }).join('');

    $('#t-units').innerHTML = cfg.businessUnits.map(function (u) {
      return '<label class="check"><input type="checkbox" name="bu" value="' + u.no + '"> ' +
        '<span>' + esc(Store.unitOption(u.no)) + '</span></label>';
    }).join('');

    var byCat = {};
    cfg.answerCodes.forEach(function (a) { (byCat[a.category] = byCat[a.category] || []).push(a); });
    $('#t-answer').innerHTML = '<option value="">Choose an answer code…</option>' +
      Object.keys(byCat).map(function (cat) {
        return '<optgroup label="' + esc(cat) + '">' + byCat[cat].map(function (a) {
          return '<option value="' + esc(a.code) + '">' + esc(a.code + ' — ' + a.label) + '</option>';
        }).join('') + '</optgroup>';
      }).join('');

    $('#t-priority').innerHTML = cfg.priorities.map(function (p) {
      return '<option value="' + esc(p) + '"' + (p === 'P3' ? ' selected' : '') + '>' + esc(p) + '</option>';
    }).join('');
    $('#t-status').innerHTML = cfg.statuses.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
    }).join('');
    $('#t-channel').innerHTML = cfg.channels.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
  }

  function systemHint() {
    var no = $('#t-system').value;
    var s = no ? Store.systemByNo(no) : null;
    var hint = $('#t-system-id-hint');
    var input = $('#t-system-id');

    if (!s) {
      hint.textContent = 'Choose a system and its code appears here.';
      input.placeholder = '';
      validateId();
      return;
    }

    /* The code belongs to the system, so fill it in — but leave anything
       the analyst typed themselves alone. */
    var previous = input.getAttribute('data-auto');
    if (!input.value || input.value === previous) {
      input.value = s.code || '';
      input.setAttribute('data-auto', s.code || '');
    }

    hint.textContent = s.code
      ? 'Filled in from ' + s.name + '. Change it only if this ticket is about a different item.'
      : 'No code is recorded for ' + s.name + ' yet — add one on the Reference data tab, or type it here.';
    input.placeholder = s.code || 'e.g. CA-1';
    validateId();
  }

  function validateId() {
    var input = $('#t-system-id');
    var no = $('#t-system').value;
    var out = $('#t-system-id-warn');
    if (!no || !input.value.trim()) { out.hidden = true; input.classList.remove('is-warn'); return; }
    var res = Store.validateSystemId(no, input.value);
    input.classList.toggle('is-warn', !res.ok);
    out.hidden = res.ok;
    out.textContent = res.ok ? '' : 'The code recorded for this system is ' + res.expected +
      '. What you have typed will still be saved.';
  }

  function readForm() {
    return {
      systemNo:      $('#t-system').value,
      systemId:      $('#t-system-id').value,
      businessUnits: $$('#t-units input[name="bu"]:checked').map(function (i) { return Number(i.value); }),
      answerCode:    $('#t-answer').value,
      priority:      $('#t-priority').value,
      status:        $('#t-status').value,
      channel:       $('#t-channel').value,
      summary:       $('#t-summary').value,
      reportedBy:    $('#t-reported').value,
      loggedBy:      $('#t-agent').value,
      loggedAt:      $('#t-when').value ? new Date($('#t-when').value).toISOString() : undefined
    };
  }

  function writeForm(t) {
    t = t || {};
    $('#t-system').value = t.systemNo || '';
    $('#t-system-id').value = t.systemId || '';
    $$('#t-units input[name="bu"]').forEach(function (i) {
      i.checked = (t.businessUnits || []).indexOf(Number(i.value)) !== -1;
    });
    $('#t-answer').value = t.answerCode || '';
    $('#t-priority').value = t.priority || 'P3';
    $('#t-status').value = t.status || 'Open';
    $('#t-channel').value = t.channel || 'Phone';
    $('#t-summary').value = t.summary || '';
    $('#t-reported').value = t.reportedBy || '';
    $('#t-agent').value = t.loggedBy || Store.getPrefs().lastAgent || '';
    $('#t-when').value = localInput(t.loggedAt || new Date().toISOString());
    systemHint();
  }

  function localInput(iso) {
    var d = new Date(iso);
    if (isNaN(d)) d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function formErrors(data) {
    var errs = [];
    if (!data.systemNo) errs.push('Choose the system.');
    var sys = data.systemNo ? Store.systemByNo(data.systemNo) : null;
    if (sys && sys.code && !String(data.systemId).trim()) errs.push('Enter the configuration item code.');
    if (!data.businessUnits.length) errs.push('Tick at least one impacted business unit.');
    if (!/^\d{4}$/.test(String(data.answerCode).trim())) errs.push('Enter the four digit answer code.');
    return errs;
  }

  function startEdit(id) {
    var t = Store.byId(id);
    if (!t) return;
    editingId = id;
    writeForm(t);
    $('#form-mode').textContent = 'Editing ' + t.ref;
    $('#t-submit').textContent = 'Save changes';
    $('#t-delete').hidden = false;
    $('#t-thumb-wrap').hidden = !t.thumb;
    if (t.thumb) $('#t-thumb').src = t.thumb;
    ticketKnowledge();
    showTab('log');
  }

  function resetForm() {
    editingId = null;
    writeForm(null);
    $('#form-mode').textContent = 'New ticket — next reference ' + Store.nextRef();
    $('#t-submit').textContent = 'Log ticket';
    $('#t-delete').hidden = true;
    $('#t-thumb-wrap').hidden = true;
    $('#t-errors').hidden = true;
    ticketKnowledge();
  }

  function submitForm(e) {
    e.preventDefault();
    var data = readForm();
    var errs = formErrors(data);
    var box = $('#t-errors');
    if (errs.length) {
      box.hidden = false;
      box.innerHTML = '<ul>' + errs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    box.hidden = true;
    if (data.loggedBy) Store.setPref('lastAgent', data.loggedBy);

    if (editingId) {
      var t = Store.updateTicket(editingId, data);
      toast('Saved ' + t.ref);
    } else {
      var added = Store.addTicket(data);
      toast('Logged ' + added.ref + ' against ' + added.systemName);
    }
    resetForm();
    Dash.render();
    showTab('dashboard');
  }

  /* ================= photo capture ================= */

  function setCaptureStatus(html, busy) {
    var node = $('#cap-status');
    node.innerHTML = html;
    node.classList.toggle('is-busy', !!busy);
  }

  function handleFiles(files) {
    var images = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); });
    if (!images.length) { toast('Those files are not images.', 'warning'); return; }
    if (!OCR.available()) {
      setCaptureStatus('Text recognition did not load — check that the <code>vendor/tesseract</code> folder ' +
        'was copied alongside this page. You can still log the ticket by hand on the <b>Log a ticket</b> tab.', false);
      return;
    }
    processQueue(images, 0);
  }

  function processQueue(images, i) {
    if (i >= images.length) {
      setCaptureStatus('Read ' + images.length + ' photo' + (images.length === 1 ? '' : 's') + '.', false);
      return;
    }
    setCaptureStatus('Reading photo ' + (i + 1) + ' of ' + images.length + '… <span class="bar"><i style="width:2%"></i></span>', true);
    OCR.read(images[i], function (status, progress) {
      var pct = Math.round(progress * 100);
      setCaptureStatus('Reading photo ' + (i + 1) + ' of ' + images.length + ' — ' + esc(status) +
        ' <span class="bar"><i style="width:' + Math.max(2, pct) + '%"></i></span>', true);
    }).then(function (res) {
      var parsed = OCR.parse(res.text, Store.getConfig());
      var item = {
        id: 'c_' + Date.now() + '_' + i,
        parsed: parsed, raw: res.text, thumb: res.thumb,
        fileName: res.fileName, ocrConfidence: Math.round(res.confidence)
      };
      queue.push(item);
      renderQueue();
      if (Store.getPrefs().autoAdd && !parsed.missing.length && !parsed.notes.length) {
        commit(item.id, true);
      }
      processQueue(images, i + 1);
    }).catch(function (err) {
      console.error(err);
      setCaptureStatus('Could not read photo ' + (i + 1) + ': ' + esc(err.message), false);
      processQueue(images, i + 1);
    });
  }

  function renderQueue() {
    var host = $('#cap-queue');
    $('#cap-queue-count').textContent = queue.length
      ? queue.length + ' photo' + (queue.length === 1 ? '' : 's') + ' waiting to be confirmed'
      : '';
    if (!queue.length) {
      host.innerHTML = '<p class="viz-empty">Nothing waiting. Photos that read cleanly are added to the dashboard ' +
        'straight away; anything doubtful stops here for a quick check.</p>';
      return;
    }
    host.innerHTML = queue.map(function (item) { return card(item); }).join('');

    $$('#cap-queue .cap-card').forEach(function (node) {
      var id = node.getAttribute('data-id');
      $('.js-commit', node).addEventListener('click', function () { commit(id, false); });
      $('.js-edit', node).addEventListener('click', function () { editFromCapture(id); });
      $('.js-drop', node).addEventListener('click', function () { drop(id); });
      var raw = $('.js-raw', node);
      if (raw) raw.addEventListener('click', function () {
        var pre = $('.cap-raw', node);
        pre.hidden = !pre.hidden;
        raw.textContent = pre.hidden ? 'Show what was read' : 'Hide what was read';
      });
    });
  }

  function card(item) {
    var f = item.parsed.fields, ev = item.parsed.evidence;
    var cfg = Store.getConfig();
    var ok = !item.parsed.missing.length;

    function row(label, value, field) {
      var found = value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);
      return '<div class="cap-row' + (found ? '' : ' is-missing') + '">' +
        '<span class="cap-key">' + esc(label) + '</span>' +
        '<span class="cap-val">' + (found ? esc(value) : 'not found') + '</span>' +
        '<span class="cap-how">' + esc(found ? (ev[field] || '') : 'type it in') + '</span></div>';
    }

    var sys = f.systemNo ? Store.systemByNo(f.systemNo) : null;
    var ans = f.answerCode ? Store.answerByCode(f.answerCode) : null;

    return '<article class="cap-card" data-id="' + esc(item.id) + '">' +
      '<header class="cap-head">' +
        '<span class="pill ' + (ok ? 'tone-good' : 'tone-warning') + '">' + item.parsed.confidence + '% of the key fields</span>' +
        '<span class="cap-file">' + esc(item.fileName) + '</span>' +
        '<span class="cap-conf">OCR confidence ' + item.ocrConfidence + '%</span>' +
      '</header>' +
      '<div class="cap-body">' +
        (item.thumb ? '<img class="cap-thumb" src="' + item.thumb + '" alt="Photograph of the ticket">' : '') +
        '<div class="cap-fields">' +
          row('System', sys ? sys.no + '. ' + sys.name : f.systemNo, 'systemNo') +
          row('System id', f.systemId, 'systemId') +
          row('Business units', (f.businessUnits || []).map(Store.unitTag).join(', '), 'businessUnits') +
          row('Answer code', f.answerCode ? f.answerCode + (ans ? ' — ' + ans.label : ' (not in the code list)') : '', 'answerCode') +
          (f.priority ? row('Priority', f.priority, 'priority') : '') +
          (f.summary ? row('Summary', f.summary, 'summary') : '') +
        '</div>' +
      '</div>' +
      (item.parsed.notes.length
        ? '<ul class="cap-notes">' + item.parsed.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
        : '') +
      '<footer class="cap-foot">' +
        '<button type="button" class="btn primary js-commit"' + (ok ? '' : ' disabled title="Fill the missing fields first"') + '>Add to dashboard</button>' +
        '<button type="button" class="btn js-edit">' + (ok ? 'Check and edit' : 'Complete it by hand') + '</button>' +
        '<button type="button" class="btn ghost js-drop">Discard</button>' +
        '<button type="button" class="link js-raw">Show what was read</button>' +
      '</footer>' +
      '<pre class="cap-raw" hidden>' + esc(item.raw || '(nothing legible)') + '</pre>' +
      '</article>';
  }

  function itemById(id) { return queue.filter(function (q) { return q.id === id; })[0]; }

  function toTicket(item) {
    var f = item.parsed.fields;
    return {
      systemNo: f.systemNo, systemId: f.systemId || '',
      businessUnits: f.businessUnits || [], answerCode: f.answerCode || '',
      priority: f.priority || 'P3', status: f.status || 'Open',
      channel: 'Photo capture', summary: f.summary || '',
      reportedBy: f.reportedBy || '', loggedBy: f.loggedBy || Store.getPrefs().lastAgent || '',
      loggedAt: f.loggedAt || new Date().toISOString(),
      source: 'photo', thumb: item.thumb,
      ocr: { confidence: item.ocrConfidence, parsed: item.parsed.confidence, file: item.fileName }
    };
  }

  function commit(id, silentAuto) {
    var item = itemById(id);
    if (!item) return;
    if (item.parsed.missing.length) { editFromCapture(id); return; }
    var t = Store.addTicket(toTicket(item));
    drop(id);
    Dash.render();
    toast((silentAuto ? 'Auto-added ' : 'Added ') + t.ref + ' from the photo');
  }

  function editFromCapture(id) {
    var item = itemById(id);
    if (!item) return;
    editingId = null;
    writeForm(toTicket(item));
    $('#form-mode').textContent = 'From a photo — check the fields, then log it';
    $('#t-submit').textContent = 'Log ticket';
    $('#t-delete').hidden = true;
    $('#t-thumb-wrap').hidden = !item.thumb;
    if (item.thumb) $('#t-thumb').src = item.thumb;
    drop(id);
    showTab('log');
  }

  function drop(id) {
    queue = queue.filter(function (q) { return q.id !== id; });
    renderQueue();
  }

  function wireCapture() {
    ['#cap-input', '#cap-file'].forEach(function (sel) {
      var input = $(sel);
      if (!input) return;
      input.addEventListener('change', function () { handleFiles(input.files); input.value = ''; });
    });

    var zone = $('#cap-zone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (e) { handleFiles(e.dataTransfer.files); });

    document.addEventListener('paste', function (e) {
      if ($('.tab-panel[data-tab="capture"]').hidden) return;
      var items = (e.clipboardData || {}).items || [];
      var files = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) files.push(f); }
      }
      if (files.length) handleFiles(files);
    });

    var auto = $('#cap-auto');
    auto.checked = Store.getPrefs().autoAdd !== false;
    auto.addEventListener('change', function () { Store.setPref('autoAdd', auto.checked); });

    $('#cap-clear').addEventListener('click', function () { queue = []; renderQueue(); });
  }


  /* ================= knowledge base ================= */

  var editingKnowledgeId = null;

  function buildKnowledgeOptions() {
    var cfg = Store.getConfig();
    var systemOpts = cfg.systems.map(function (s) {
      return '<option value="' + s.no + '">' + esc(s.no + '. ' + s.name) + '</option>';
    }).join('');

    $('#k-q-system').innerHTML = '<option value="">Every application</option>' + systemOpts;
    $('#k-system').innerHTML = '<option value="">Choose an application…</option>' + systemOpts;

    [['#k-q-units', 'kqu'], ['#k-units', 'ku']].forEach(function (pair) {
      $(pair[0]).innerHTML = cfg.businessUnits.map(function (u) {
        return '<label class="check"><input type="checkbox" name="' + pair[1] + '" value="' + u.no + '"> ' +
          '<span>' + esc(Store.unitOption(u.no)) + '</span></label>';
      }).join('');
    });
  }

  function checkedUnits(name) {
    return $$('input[name="' + name + '"]:checked').map(function (i) { return Number(i.value); });
  }

  function setCheckedUnits(name, list) {
    $$('input[name="' + name + '"]').forEach(function (i) {
      i.checked = (list || []).indexOf(Number(i.value)) !== -1;
    });
  }

  var WHY = {
    exact:   'exactly these units',
    covers:  'applies whenever its units are hit',
    wider:   'recorded against a wider set',
    partial: 'shares some units',
    listed:  'recorded for this application'
  };

  function hit(r, opts) {
    var e = r.entry, kind = r.match.kind;
    var units = e.businessUnits.length ? e.businessUnits.map(Store.unitTag).join(', ') : 'no units';
    return '<div class="kb-hit' + (kind === 'exact' ? ' is-exact' : '') + '"' +
        (opts && opts.clickable ? ' data-id="' + esc(e.id) + '" style="cursor:pointer"' : '') + '>' +
      '<span class="kb-q">Q' + esc(e.question) + '</span>' +
      '<span class="kb-a">' + esc(e.answer) + '</span>' +
      '<span class="kb-meta">' + (opts && opts.showSystem ? esc(e.systemName) + '<br>' : '') +
        'units ' + esc(units) + '<br>' +
        '<span class="kb-why is-' + kind + '">' + esc(WHY[kind] || kind) + '</span></span>' +
      (e.notes ? '<span class="kb-notes">' + esc(e.notes) + '</span>' : '') +
      '</div>';
  }

  function runLookup() {
    var system = $('#k-q-system').value;
    var units = checkedUnits('kqu');
    var host = $('#k-results');

    if (!Store.allKnowledge().length) {
      host.innerHTML = '<p class="viz-empty">Nothing recorded yet. Add the first entry below and it will show up here.</p>';
      return;
    }

    var results = Store.queryKnowledge(system, units);
    if (!results.length) {
      host.innerHTML = '<p class="viz-empty">No entry covers that combination. ' +
        'Record one below and it will be here next time.</p>';
      return;
    }

    var exact = results.filter(function (r) { return r.match.kind === 'exact'; }).length;
    var lead = units.length
      ? (exact ? exact + (exact === 1 ? ' answer matches' : ' answers match') + ' that combination exactly'
               : 'Nothing matches exactly — the closest entries are below')
      : results.length + (results.length === 1 ? ' entry' : ' entries') + ' recorded';

    host.innerHTML = '<p class="field-hint" style="margin-bottom:8px">' + esc(lead) + '</p>' +
      results.map(function (r) { return hit(r, { showSystem: !system, clickable: true }); }).join('');

    $$('#k-results .kb-hit').forEach(function (node) {
      node.addEventListener('click', function () { editKnowledge(node.getAttribute('data-id')); });
    });
  }

  /* The same lookup, offered while a ticket is being logged. */
  function ticketKnowledge() {
    var host = $('#t-knowledge');
    var system = $('#t-system').value;
    var units = $$('#t-units input[name="bu"]:checked').map(function (i) { return Number(i.value); });
    if (!system || !units.length || !Store.allKnowledge().length) { host.hidden = true; return; }

    var results = Store.queryKnowledge(system, units)
      .filter(function (r) { return r.match.rank >= 3; })
      .slice(0, 4);
    if (!results.length) { host.hidden = true; return; }

    host.hidden = false;
    host.innerHTML = '<h4>From the knowledge base</h4>' +
      results.map(function (r) { return hit(r, {}); }).join('');
  }

  function knowledgeForm() {
    return {
      systemNo: $('#k-system').value,
      businessUnits: checkedUnits('ku'),
      question: $('#k-question').value,
      answer: $('#k-answer').value,
      notes: $('#k-notes').value
    };
  }

  function resetKnowledgeForm() {
    editingKnowledgeId = null;
    $('#k-system').value = '';
    setCheckedUnits('ku', []);
    $('#k-question').value = '';
    $('#k-answer').value = '';
    $('#k-notes').value = '';
    $('#k-errors').hidden = true;
    $('#k-form-mode').textContent = 'New entry';
    $('#k-save').textContent = 'Save entry';
    $('#k-delete').hidden = true;
  }

  function editKnowledge(id) {
    var e = Store.knowledgeById(id);
    if (!e) return;
    editingKnowledgeId = id;
    $('#k-system').value = e.systemNo;
    setCheckedUnits('ku', e.businessUnits);
    $('#k-question').value = e.question;
    $('#k-answer').value = e.answer;
    $('#k-notes').value = e.notes;
    $('#k-errors').hidden = true;
    $('#k-form-mode').textContent = 'Editing ' + e.systemName + ' — question ' + e.question;
    $('#k-save').textContent = 'Save changes';
    $('#k-delete').hidden = false;
    showTab('knowledge');
    $('#k-question').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function saveKnowledgeEntry() {
    var data = knowledgeForm();
    var errs = [];
    if (!data.systemNo) errs.push('Choose the application.');
    if (!data.businessUnits.length) errs.push('Tick at least one impacted business unit.');
    if (!data.question.trim()) errs.push('Enter the question number.');
    if (!data.answer.trim()) errs.push('Enter the answer.');

    var box = $('#k-errors');
    if (errs.length) {
      box.hidden = false;
      box.innerHTML = '<ul>' + errs.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      return;
    }

    var clash = Store.findDuplicate({
      id: editingKnowledgeId, systemNo: data.systemNo,
      businessUnits: data.businessUnits, question: data.question.trim()
    });
    if (clash) {
      if (!confirm('That application, those business units and question ' + data.question.trim() +
          ' already answer "' + clash.answer + '". Replace that answer?')) return;
      Store.updateKnowledge(clash.id, data);
      Store.deleteKnowledge(editingKnowledgeId);
      afterKnowledgeChange('Replaced the answer for question ' + data.question.trim());
      return;
    }

    if (editingKnowledgeId) {
      Store.updateKnowledge(editingKnowledgeId, data);
      afterKnowledgeChange('Entry updated');
    } else {
      var e = Store.addKnowledge(data);
      afterKnowledgeChange('Recorded question ' + e.question + ' for ' + e.systemName);
    }
  }

  function afterKnowledgeChange(message) {
    resetKnowledgeForm();
    renderKnowledgeTable();
    runLookup();
    ticketKnowledge();
    toast(message);
  }

  function renderKnowledgeTable() {
    var host = $('#k-table');
    var term = ($('#k-search').value || '').trim().toLowerCase();
    var list = Store.allKnowledge().filter(function (e) {
      if (!term) return true;
      return [e.systemName, e.question, e.answer, e.notes, e.businessUnits.join(' ')]
        .join(' ').toLowerCase().indexOf(term) !== -1;
    });

    $('#k-count').textContent = Store.allKnowledge().length
      ? list.length + ' of ' + Store.allKnowledge().length + ' entries'
      : '';

    if (!list.length) {
      host.innerHTML = '<p class="viz-empty">' +
        (Store.allKnowledge().length ? 'Nothing matches that search.' : 'No entries recorded yet.') + '</p>';
      return;
    }

    list = list.slice().sort(function (a, b) {
      if (Number(a.systemNo) !== Number(b.systemNo)) return Number(a.systemNo) - Number(b.systemNo);
      var u = Store.unitKey(a.businessUnits).localeCompare(Store.unitKey(b.businessUnits));
      return u || Store.compareQuestion(a.question, b.question);
    });

    host.innerHTML = '<table class="grid"><thead><tr>' +
      '<th>Application</th><th>Business units</th><th>Question</th><th>Answer</th><th>Notes</th>' +
      '</tr></thead><tbody>' +
      list.map(function (e) {
        return '<tr data-id="' + esc(e.id) + '">' +
          '<td>' + esc(e.systemNo + '. ' + e.systemName) + '</td>' +
          '<td>' + e.businessUnits.map(function (u) {
              return '<span class="chip">' + esc(Store.unitTag(u)) + '</span>';
            }).join('') + '</td>' +
          '<td class="num mono">' + esc(e.question) + '</td>' +
          '<td class="mono">' + esc(e.answer) + '</td>' +
          '<td class="summary">' + esc(e.notes || '—') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';

    $$('#k-table tbody tr').forEach(function (tr) {
      tr.addEventListener('click', function () { editKnowledge(tr.getAttribute('data-id')); });
    });
  }

  function wireKnowledge() {
    $('#k-q-system').addEventListener('change', runLookup);
    $('#k-q-units').addEventListener('change', runLookup);
    $('#k-q-clear').addEventListener('click', function () {
      $('#k-q-system').value = '';
      setCheckedUnits('kqu', []);
      runLookup();
    });

    $('#k-save').addEventListener('click', saveKnowledgeEntry);
    $('#k-reset').addEventListener('click', function () { resetKnowledgeForm(); toast('Form cleared'); });
    $('#k-delete').addEventListener('click', function () {
      if (!editingKnowledgeId || !confirm('Delete this entry?')) return;
      Store.deleteKnowledge(editingKnowledgeId);
      afterKnowledgeChange('Entry deleted');
    });

    var timer = null;
    $('#k-search').addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(renderKnowledgeTable, 160);
    });

    $('#k-csv').addEventListener('click', function () {
      var list = Store.allKnowledge();
      if (!list.length) { toast('Nothing to export yet.', 'warning'); return; }
      download('knowledge-base-' + new Date().toISOString().slice(0, 10) + '.csv',
        Store.knowledgeToCSV(list), 'text/csv;charset=utf-8',
        'Exported ' + list.length + ' entries');
    });

    $('#t-system').addEventListener('change', ticketKnowledge);
    $('#t-units').addEventListener('change', ticketKnowledge);
  }

  /* ================= reference data ================= */

  function renderReference() {
    var cfg = Store.getConfig();

    $('#ref-systems').innerHTML =
      '<table class="grid editable"><thead><tr><th>No</th><th>System name</th>' +
      '<th>Configuration item code</th></tr></thead><tbody>' +
      cfg.systems.map(function (s, i) {
        return '<tr data-i="' + i + '">' +
          '<td class="num">' + s.no + '</td>' +
          '<td><input data-k="name" value="' + esc(s.name) + '"></td>' +
          '<td><input data-k="code" class="mono short" placeholder="none recorded" value="' +
            esc(s.code || '') + '"></td>' +
          '</tr>';
      }).join('') + '</tbody></table>';

    $('#ref-units').innerHTML =
      '<table class="grid editable"><thead><tr><th>No</th><th>Business unit</th><th>Short name</th></tr></thead><tbody>' +
      cfg.businessUnits.map(function (u, i) {
        return '<tr data-i="' + i + '">' +
          '<td class="num">' + u.no + '</td>' +
          '<td><input data-k="name" value="' + esc(u.name) + '"></td>' +
          '<td><input data-k="short" value="' + esc(u.short || '') + '"></td>' +
          '</tr>';
      }).join('') + '</tbody></table>';

    $('#ref-answers').innerHTML =
      '<table class="grid editable"><thead><tr><th>Code</th><th>Meaning</th><th>Category</th><th></th></tr></thead><tbody>' +
      cfg.answerCodes.map(function (a, i) {
        return '<tr data-i="' + i + '">' +
          '<td><input data-k="code" class="mono short" maxlength="4" inputmode="numeric" value="' + esc(a.code) + '"></td>' +
          '<td><input data-k="label" value="' + esc(a.label) + '"></td>' +
          '<td><input data-k="category" value="' + esc(a.category || '') + '"></td>' +
          '<td><button type="button" class="btn ghost tiny js-del-answer">Remove</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table>';

    $$('#ref-answers .js-del-answer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = Number(btn.closest('tr').getAttribute('data-i'));
        readReference();
        Store.getConfig().answerCodes.splice(i, 1);
        Store.saveConfig();
        renderReference();
        refreshEverything();
      });
    });
  }

  function readReference() {
    var cfg = Store.getConfig();
    $$('#ref-systems tbody tr').forEach(function (tr) {
      var s = cfg.systems[Number(tr.getAttribute('data-i'))];
      $$('input', tr).forEach(function (inp) { s[inp.getAttribute('data-k')] = inp.value.trim(); });
    });
    $$('#ref-units tbody tr').forEach(function (tr) {
      var u = cfg.businessUnits[Number(tr.getAttribute('data-i'))];
      $$('input', tr).forEach(function (inp) { u[inp.getAttribute('data-k')] = inp.value.trim(); });
    });
    $$('#ref-answers tbody tr').forEach(function (tr) {
      var a = cfg.answerCodes[Number(tr.getAttribute('data-i'))];
      $$('input', tr).forEach(function (inp) { a[inp.getAttribute('data-k')] = inp.value.trim(); });
    });
  }

  function saveReference() {
    readReference();
    var cfg = Store.getConfig();
    var bad = cfg.answerCodes.filter(function (a) { return !/^\d{4}$/.test(a.code); });
    if (bad.length) { toast('Answer codes must be four digits — check ' + bad[0].label, 'warning'); return; }

    var seen = {}, clash = null;
    cfg.systems.forEach(function (s) {
      var k = Store.normCode(s.code);
      if (!k) return;
      if (seen[k]) clash = seen[k] + ' and ' + s.name + ' both use ' + s.code;
      seen[k] = s.name;
    });
    if (clash) { toast('Two systems cannot share a code — ' + clash, 'warning'); return; }
    Store.saveConfig();
    refreshEverything();
    toast('Reference data saved');
  }

  function refreshEverything() {
    buildFormOptions();
    buildKnowledgeOptions();
    Dash.buildFilterControls();
    Dash.render();
    renderKnowledgeTable();
    runLookup();
  }

  /* ================= data in / out ================= */

  /* A plain download link works when the page is opened as a file or
     served normally. In a shared preview the host mediates saving
     instead, so ask it and fall back only when it is not there. */
  function download(name, text, type, done) {
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (downloads) {
        if (!downloads) return linkDownload(name, text, type, done);
        return downloads.save({ filename: name, data: text }).then(function () {
          if (done) toast(done);
        }).catch(function (err) {
          var code = err && err.code;
          if (code === 'declined') return;
          toast(code === 'rate_limited'
            ? 'A save is already waiting — finish that one first.'
            : 'That file could not be saved here. ' +
              'The copy in the repository saves it straight to your downloads.', 'warning');
        });
      }).catch(function () { linkDownload(name, text, type, done); });
      return;
    }
    linkDownload(name, text, type, done);
  }

  function linkDownload(name, text, type, done) {
    var blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (done) toast(done);
  }

  function wireData() {
    $('#d-csv').addEventListener('click', function () {
      var list = Dash.filtered();
      download('service-desk-tickets-' + new Date().toISOString().slice(0, 10) + '.csv',
        Store.toCSV(list), 'text/csv;charset=utf-8',
        'Exported ' + list.length + ' ticket' + (list.length === 1 ? '' : 's') + ' as CSV');
    });

    $('#d-json').addEventListener('click', function () {
      download('service-desk-backup-' + new Date().toISOString().slice(0, 10) + '.json',
        JSON.stringify(Store.exportBundle(), null, 2), 'application/json',
        'Exported tickets and reference data');
    });

    $('#d-import').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var added = Store.importBundle(JSON.parse(reader.result), $('#d-import-mode').value);
          refreshEverything();
          renderReference();
          toast('Imported ' + added + ' tickets');
        } catch (err) {
          toast('Import failed: ' + err.message, 'warning');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#d-demo').addEventListener('click', function () {
      if (Store.all().length && !confirm('Add ' + 140 + ' sample tickets on top of the ' +
        Store.all().length + ' already logged?')) return;
      Store.addMany(demoTickets(140));
      refreshEverything();
      toast('Added sample tickets — clear them from this tab when you are done');
    });

    $('#d-clear').addEventListener('click', function () {
      if (!confirm('Delete every ticket? Reference data is kept. This cannot be undone.')) return;
      Store.clearTickets();
      Dash.render();
      toast('All tickets deleted');
    });

    $('#d-clear-kb').addEventListener('click', function () {
      var n = Store.allKnowledge().length;
      if (!n) { toast('There are no entries to delete.'); return; }
      if (!confirm('Delete all ' + n + ' knowledge base entries? Tickets are kept. This cannot be undone.')) return;
      Store.clearKnowledge();
      renderKnowledgeTable();
      runLookup();
      ticketKnowledge();
      toast('Knowledge base emptied');
    });

    $('#d-reset-ref').addEventListener('click', function () {
      if (!confirm('Restore the reference data that ships with the app? Tickets are kept.')) return;
      Store.resetConfig();
      renderReference();
      refreshEverything();
      toast('Reference data restored');
    });
  }

  /* A handful of knowledge base entries so the lookup has something to
     find. Invented, like the sample tickets. */
  function demoKnowledge() {
    var cfg = Store.getConfig();
    var units = cfg.businessUnits.map(function (u) { return Number(u.no); });
    var pairs = [
      [1, [units[0], units[2]], '4',  'A#7/2'],
      [1, [units[0], units[2]], '11', 'ZZ-04*'],
      [1, [units[0]],           '2',  'Q1'],
      [4, [units[1], units[3]], '7',  'B/2'],
      [9, [units[0], units[2]], '4',  'N-9!'],
      [9, [units[3]],           '15', 'K22/A'],
      [12, [units[1]],          '3',  '#R-8']
    ];
    return pairs.filter(function (p) {
      return p[1].every(function (u) { return u !== undefined; });
    }).map(function (p) {
      return {
        systemNo: p[0], businessUnits: p[1], question: p[2], answer: p[3],
        notes: 'Sample entry — delete these on the Data tab.'
      };
    });
  }

  /* Weighted sample data so the charts show a realistic shape. */
  function demoTickets(n) {
    var cfg = Store.getConfig();
    var out = [];
    var sysWeights = cfg.systems.map(function (s, i) { return i < 5 ? 6 : i < 11 ? 3 : 1; });
    var pick = function (arr, weights) {
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = Math.random() * total;
      for (var i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    var faults = [
      'User cannot log in after the overnight release',
      'Report times out when run for the whole region',
      'Interface file rejected — missing header record',
      'Mobile app will not sync completed jobs',
      'Duplicate invoices raised against one work order',
      'Telemetry values frozen since 02:00',
      'Search returns no results for valid asset numbers',
      'Printing to the depot queue fails silently',
      'Scheduled batch did not run overnight',
      'Screen locks up when attaching a photo'
    ];
    for (var i = 0; i < n; i++) {
      var sys = pick(cfg.systems, sysWeights);
      var nUnits = Math.random() < 0.55 ? 1 : Math.random() < 0.85 ? 2 : 3;
      var units = [];
      while (units.length < nUnits) {
        var u = cfg.businessUnits[Math.floor(Math.random() * cfg.businessUnits.length)].no;
        if (units.indexOf(u) === -1) units.push(u);
      }
      var ans = cfg.answerCodes[Math.floor(Math.random() * cfg.answerCodes.length)];
      var daysBack = Math.floor(Math.pow(Math.random(), 1.5) * 45);
      var when = new Date(Date.now() - daysBack * 86400000 -
        Math.floor(Math.random() * 9) * 3600000);
      var r = Math.random();
      out.push({
        systemNo: sys.no,
        systemId: sys.code || '',
        businessUnits: units.sort(function (a, b) { return a - b; }),
        answerCode: ans.code,
        priority: r < 0.05 ? 'P1' : r < 0.25 ? 'P2' : r < 0.8 ? 'P3' : 'P4',
        status: daysBack > 5 ? (Math.random() < 0.85 ? 'Closed' : 'Resolved')
                             : ['Open', 'In progress', 'Pending customer', 'Resolved'][Math.floor(Math.random() * 4)],
        channel: cfg.channels[Math.floor(Math.random() * (cfg.channels.length - 1))],
        summary: faults[Math.floor(Math.random() * faults.length)],
        loggedBy: ['A. Mensah', 'J. Okafor', 'S. Patel', 'R. Duarte'][Math.floor(Math.random() * 4)],
        loggedAt: when.toISOString(),
        source: Math.random() < 0.2 ? 'photo' : 'manual'
      });
    }
    return out.sort(function (a, b) { return a.loggedAt < b.loggedAt ? -1 : 1; });
  }

  /* ================= single file / shared preview ================= */

  /* The build script sets window.SDP_SINGLE_FILE on the one-file copy.
     There is no folder beside it, so seed something to look at and be
     straight about what photo capture can and cannot do. */
  function singleFileSetup() {
    if (!Store.allKnowledge().length) demoKnowledge().forEach(Store.addKnowledge);
    if (!Store.all().length) {
      Store.addMany(demoTickets(140));
      var banner = document.createElement('div');
      banner.className = 'banner';
      banner.innerHTML = '<span><b>Sample tickets.</b> These 140 are invented, so the dashboard has ' +
        'something to show. Delete them on the <b>Data</b> tab, then log your own.</span>' +
        '<button type="button" class="btn ghost tiny">Hide</button>';
      banner.querySelector('button').addEventListener('click', function () { banner.remove(); });
      document.querySelector('.topbar').insertAdjacentElement('afterend', banner);
    }

    var note = document.createElement('p');
    note.className = 'field-hint';
    note.style.marginTop = '12px';
    note.innerHTML = '<b>About this copy.</b> Reading a photograph needs the recognition engine, ' +
      'which is roughly 10&nbsp;MB of separate files and cannot travel inside a single page. ' +
      'This copy fetches it over the internet, so photo capture works when you are online and ' +
      'nothing is blocking it — and not at all in a shared preview, where fetching it is refused. ' +
      'The full version in the repository ships the engine alongside the page and reads photos ' +
      'with no network at all. Everything else here works either way.';
    var status = $('#cap-status');
    status.parentNode.insertBefore(note, status.nextSibling);
  }

  /* ================= boot ================= */

  function boot() {
    Store.load();
    if (window.SDP_SINGLE_FILE) singleFileSetup();
    applyTheme(Store.getPrefs().theme || 'system');

    buildFormOptions();
    buildKnowledgeOptions();
    Dash.init({ onEdit: startEdit });
    resetForm();
    resetKnowledgeForm();
    renderKnowledgeTable();
    runLookup();
    renderReference();
    renderQueue();

    $$('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });

    $('#ticket-form').addEventListener('submit', submitForm);
    $('#t-reset').addEventListener('click', function () { resetForm(); toast('Form cleared'); });
    $('#t-delete').addEventListener('click', function () {
      if (!editingId || !confirm('Delete this ticket?')) return;
      Store.deleteTicket(editingId);
      resetForm();
      Dash.render();
      toast('Ticket deleted');
      showTab('dashboard');
    });
    $('#t-system').addEventListener('change', systemHint);
    $('#t-system-id').addEventListener('input', validateId);
    $('#theme-btn').addEventListener('click', cycleTheme);
    $('#ref-save').addEventListener('click', saveReference);
    $('#ref-add-answer').addEventListener('click', function () {
      readReference();
      Store.getConfig().answerCodes.push({ code: '0000', label: 'New answer code', category: 'Other' });
      Store.saveConfig();
      renderReference();
      refreshEverything();
    });

    wireCapture();
    wireKnowledge();
    wireData();

    Store.on(function (what, detail) {
      if (what === 'storage-error') {
        toast('Browser storage is full — export a backup and clear old tickets.', 'warning');
      }
    });

    var initial = location.hash.slice(1);
    showTab(['dashboard', 'log', 'capture', 'knowledge', 'reference', 'data'].indexOf(initial) !== -1
      ? initial : 'dashboard');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
