/* ------------------------------------------------------------------
   OCR — photograph a ticket, read it, and turn the text into the
   fields the dashboard needs.

   Pipeline:  image -> canvas pre-process -> Tesseract -> parse -> ticket
   Tesseract.js is loaded from a CDN; if it is unavailable the capture
   tab degrades to "attach the photo, type the fields".
   ------------------------------------------------------------------ */

window.OCR = (function () {
  var worker = null;
  var workerPromise = null;

  function available() { return typeof window.Tesseract !== 'undefined'; }

  function ensureWorker(onProgress) {
    if (worker) return Promise.resolve(worker);
    if (!available()) return Promise.reject(new Error('Text recognition library is not loaded.'));
    if (!workerPromise) {
      /* Everything is served from vendor/ so this works with no network. */
      workerPromise = window.Tesseract.createWorker('eng', 1, {
        workerPath: 'vendor/tesseract/worker.min.js',
        corePath:   'vendor/tesseract/core',
        langPath:   'vendor/tesseract/lang',
        gzip: true,
        logger: function (m) {
          if (onProgress && m.status) onProgress(m.status, m.progress || 0);
        }
      }).then(function (w) { worker = w; return w; });
    }
    return workerPromise;
  }

  /* ---------------- image handling ---------------- */

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
      img.src = url;
    });
  }

  /* Upscale small photos, drop to greyscale and stretch contrast —
     cheap steps that make a phone snap far more readable. */
  function preprocess(img) {
    var targetW = Math.min(2000, Math.max(1200, img.naturalWidth));
    var scale = targetW / img.naturalWidth;
    var w = Math.round(img.naturalWidth * scale);
    var h = Math.round(img.naturalHeight * scale);
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    try {
      var d = ctx.getImageData(0, 0, w, h);
      var px = d.data, i, g;
      var min = 255, max = 0;
      for (i = 0; i < px.length; i += 4) {
        g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
        px[i] = px[i + 1] = px[i + 2] = g;
        if (g < min) min = g;
        if (g > max) max = g;
      }
      var range = Math.max(1, max - min);
      for (i = 0; i < px.length; i += 4) {
        g = ((px[i] - min) / range) * 255;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        px[i] = px[i + 1] = px[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
    } catch (e) {
      /* tainted canvas or out of memory — carry on with the plain draw */
    }
    return c;
  }

  function thumbnail(img, maxSide) {
    maxSide = maxSide || 420;
    var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/jpeg', 0.6); } catch (e) { return null; }
  }

  function read(file, onProgress) {
    return loadImage(file).then(function (img) {
      var thumb = thumbnail(img);
      var canvas = preprocess(img);
      return ensureWorker(onProgress).then(function (w) {
        return w.recognize(canvas);
      }).then(function (res) {
        return {
          text: (res && res.data && res.data.text) || '',
          confidence: (res && res.data && res.data.confidence) || 0,
          thumb: thumb,
          fileName: file.name || 'photo'
        };
      });
    });
  }

  function terminate() {
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null; workerPromise = null;
  }

  /* ---------------- text parsing ---------------- */

  var LABELS = {
    systemNo:      ['system no', 'system number', 'system num', 'system #', 'sys no', 'sys #', 'system'],
    systemName:    ['system name', 'application', 'app name', 'service'],
    systemId:      ['system id', 'system i d', 'sys id', 'systemid', 'system ref', 'system reference',
                    'configuration item', 'configuration item code', 'config item', 'item code',
                    'ci code', 'ci', 'code', 'asset id'],
    businessUnits: ['business unit', 'business units', 'business area', 'impacted business unit',
                    'impacted business units', 'bu', 'bus unit', 'business unit impacted',
                    'business units impacted', 'impacted area', 'impacted areas'],
    answerCode:    ['answer code', 'answer', 'resolution code', 'closure code', 'res code', 'fix code'],
    summary:       ['issue', 'summary', 'description', 'fault', 'problem', 'detail', 'details'],
    ref:           ['ticket', 'ticket no', 'ticket number', 'ticket ref', 'incident', 'incident no',
                    'call ref', 'reference', 'ref'],
    priority:      ['priority', 'severity', 'sev'],
    status:        ['status', 'state'],
    reportedBy:    ['reported by', 'raised by', 'caller', 'customer', 'requested by', 'contact'],
    loggedBy:      ['logged by', 'agent', 'analyst', 'assigned to'],
    date:          ['date', 'logged', 'logged at', 'raised', 'date logged', 'received']
  };

  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  /* Every four digit window inside each run of digits, so a value with a
     stray leading digit still offers up the code it contains. */
  function fourDigitWindows(s) {
    var out = [];
    (String(s).match(/\d+/g) || []).forEach(function (run) {
      for (var i = 0; i + 4 <= run.length; i++) out.push(run.substr(i, 4));
    });
    return out;
  }

  function key(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* Digits are what matter most here, so repair the classic
     letter-for-digit OCR slips inside otherwise numeric runs. */
  function digitFix(s) {
    /* No lookbehind — older Safari throws on it at parse time. */
    var src = String(s || '');
    var map = { o: '0', O: '0', l: '1', I: '1', '|': '1', s: '5', S: '5', b: '6', B: '6' };
    var out = '';
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (map[ch]) {
        var prev = src[i - 1], next = src[i + 1];
        var touchesDigit = (prev && prev >= '0' && prev <= '9') || (next && next >= '0' && next <= '9');
        out += touchesDigit ? map[ch] : ch;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function labelOf(left) {
    var k = key(left);
    if (!k) return null;
    var best = null, bestLen = 0;
    Object.keys(LABELS).forEach(function (field) {
      LABELS[field].forEach(function (alias) {
        if ((k === alias || k.endsWith(' ' + alias) || k.startsWith(alias + ' ') || k === alias.replace(/ /g, ''))
            && alias.length > bestLen) {
          best = field; bestLen = alias.length;
        }
      });
    });
    return best;
  }

  /* A camera loses colons — it reads them as 1, l, . or nothing at all.
     So when a line has no separator, try each known label as a prefix
     and take whatever follows it as the value. */
  function labelPrefix(line) {
    var best = null, bestLen = 0;
    Object.keys(LABELS).forEach(function (field) {
      LABELS[field].forEach(function (alias) {
        if (alias.length <= bestLen) return;
        var pattern = '^\\s*' + alias.split(' ').map(function (w) {
          return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('\\W*') + '\\W*(.+)$';
        var m = new RegExp(pattern, 'i').exec(line);
        if (m && clean(m[1])) { best = { field: field, value: clean(m[1]) }; bestLen = alias.length; }
      });
    });
    return best;
  }

  /* label: value pairs, one per line, plus the raw lines. */
  function scanLines(text) {
    var lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    var pairs = {};
    lines.forEach(function (line) {
      var m = /^(.{2,40}?)\s*[:\-–]\s*(.+)$/.exec(line);
      var field = m ? labelOf(m[1]) : null;
      if (field) {
        if (!pairs[field]) pairs[field] = clean(m[2]);
        return;
      }
      if (m) return;                       /* a separator, but not a label we know */
      var hit = labelPrefix(line);
      if (hit && !pairs[hit.field]) pairs[hit.field] = hit.value;
    });
    return { lines: lines, pairs: pairs };
  }

  function tokenScore(needle, hay) {
    var nt = key(needle).split(' ').filter(function (t) { return t.length > 2; });
    if (!nt.length) return 0;
    var h = key(hay);
    var hit = nt.filter(function (t) { return h.indexOf(t) !== -1; }).length;
    return hit / nt.length;
  }

  /* Glyphs a camera mixes up, as equivalence classes. D is deliberately
     kept out of the 0/O class: PO-1 and PD-1 are both real codes and must
     stay distinct. Within a class the characters are interchangeable,
     which is why NN-1 and NN-2 still cannot be confused with each other. */
  var CONFUSABLE = ['0O', '1IL', '5S', '8B', '2Z', '6G'];

  function confusableWith(a, b) {
    for (var i = 0; i < CONFUSABLE.length; i++) {
      if (CONFUSABLE[i].indexOf(a) !== -1 && CONFUSABLE[i].indexOf(b) !== -1) return true;
    }
    return false;
  }

  function normCode(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function codeEquals(a, b) {
    a = normCode(a); b = normCode(b);
    if (!a || a.length !== b.length) return { match: false, exact: false };
    var exact = true;
    for (var i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (confusableWith(a[i], b[i])) { exact = false; continue; }
      return { match: false, exact: false };
    }
    return { match: true, exact: exact };
  }

  /* Look through the text for a token that is one of the known codes.
     An exact hit always wins; a look-alike hit is only used when it is
     the only one, so an ambiguous smudge is reported rather than guessed. */
  function findConfigCode(text, systems) {
    var withCodes = systems.filter(function (s) { return s.code; });
    if (!withCodes.length) return null;

    var tokens = String(text || '').toUpperCase().match(/[A-Z0-9]+(?:[-.][A-Z0-9]+)*/g) || [];
    var candidates = tokens.slice();
    /* also try neighbouring tokens joined, for a code written "CA 1" */
    for (var i = 0; i < tokens.length - 1; i++) candidates.push(tokens[i] + tokens[i + 1]);

    var loose = [];
    for (var c = 0; c < candidates.length; c++) {
      for (var s = 0; s < withCodes.length; s++) {
        var r = codeEquals(candidates[c], withCodes[s].code);
        if (!r.match) continue;
        if (r.exact) return { system: withCodes[s], exact: true, read: candidates[c] };
        if (loose.every(function (l) { return l.system.no !== withCodes[s].no; })) {
          loose.push({ system: withCodes[s], exact: false, read: candidates[c] });
        }
      }
    }
    return loose.length === 1 ? loose[0] : null;
  }

  function matchSystemByName(text, systems) {
    var best = null, bestScore = 0;
    systems.forEach(function (s) {
      var score = tokenScore(s.name, text);
      if (score > bestScore) { bestScore = score; best = s; }
    });
    return bestScore >= 0.5 ? { system: best, score: bestScore } : null;
  }

  function parseUnitList(value, units) {
    var found = {};
    /* "3,4and 9" comes back as one token, so part the digits from the
       letters before looking for numbers */
    var v = digitFix(value || '')
      .replace(/(\d)(?=[A-Za-z])/g, '$1 ')
      .replace(/([A-Za-z])(?=\d)/g, '$1 ');
    /* explicit numbers: "1, 4 and 7" / "BU3" */
    (v.match(/\b\d{1,2}\b/g) || []).forEach(function (n) {
      n = Number(n);
      if (n >= 1 && n <= units.length + 90 && units.some(function (u) { return Number(u.no) === n; })) found[n] = true;
    });
    /* named units — but only on words that actually distinguish one unit
       from another. A unit still called "Business unit 4" is identified by
       its number alone; matching on "business" or "unit" would tick every
       box on the form. */
    units.forEach(function (u) {
      if (unitNameMatches(u.name, v)) found[u.no] = true;
    });
    return Object.keys(found).map(Number).sort(function (a, b) { return a - b; });
  }

  var UNIT_STOPWORDS = ['business', 'unit', 'units', 'area', 'areas',
                        'department', 'dept', 'team', 'division', 'group'];

  function unitNameMatches(name, text) {
    var tokens = key(name).split(' ').filter(function (t) {
      return t.length > 2 && UNIT_STOPWORDS.indexOf(t) === -1;
    });
    if (!tokens.length) return false;
    var h = key(text);
    var hit = tokens.filter(function (t) { return h.indexOf(t) !== -1; }).length;
    return hit / tokens.length >= 0.75;
  }

  /**
   * Turn recognised text into a draft ticket.
   * Returns { fields, confidence, missing, notes, evidence }.
   */
  function parse(text, config) {
    var scan = scanLines(text);
    var pairs = scan.pairs;
    var whole = scan.lines.join('\n');
    var fields = {};
    var evidence = {};
    var notes = [];

    function set(name, value, how) {
      if (value === null || value === undefined || value === '' ||
          (Array.isArray(value) && !value.length)) return;
      fields[name] = value;
      evidence[name] = how;
    }

    /* --- system number --- */
    var sysNo = null;
    if (pairs.systemNo) {
      var mNo = /\b(\d{1,2})\b/.exec(digitFix(pairs.systemNo));
      if (mNo) sysNo = Number(mNo[1]);
    }
    if (sysNo === null) {
      var inline = /\bsystem\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{1,2})\b/i.exec(digitFix(whole));
      if (inline) sysNo = Number(inline[1]);
    }
    if (sysNo !== null && !config.systems.some(function (s) { return Number(s.no) === sysNo; })) {
      notes.push('System number ' + sysNo + ' is outside the configured range — check the photo.');
      sysNo = null;
    }

    /* --- system name (also backfills the number) --- */
    var named = null;
    if (pairs.systemName) named = matchSystemByName(pairs.systemName, config.systems);
    if (!named) named = matchSystemByName(whole, config.systems);

    if (sysNo === null && named) {
      sysNo = Number(named.system.no);
      set('systemNo', sysNo, 'derived from the system name');
    } else if (sysNo !== null) {
      set('systemNo', sysNo, pairs.systemNo ? 'read from a labelled field' : 'read from the text');
      if (named && Number(named.system.no) !== sysNo) {
        notes.push('The number says system ' + sysNo + ' but the text reads like "' +
          named.system.name + '" (system ' + named.system.no + '). Kept the number — please confirm.');
      }
    }

    /* --- configuration item code ---
       The code belongs to the system, so finding one identifies the
       system too, and knowing the system supplies the code. */
    var codeHit = null;
    if (pairs.systemId) codeHit = findConfigCode(pairs.systemId, config.systems);
    if (!codeHit) codeHit = findConfigCode(whole, config.systems);

    if (codeHit) {
      set('systemId', codeHit.system.code,
        codeHit.exact
          ? (pairs.systemId ? 'read from a labelled field' : 'matched against the code list')
          : 'matched against the code list, allowing for look-alike characters');

      if (fields.systemNo === undefined) {
        set('systemNo', Number(codeHit.system.no), 'identified by the item code');
      } else if (Number(fields.systemNo) !== Number(codeHit.system.no)) {
        notes.push('The code ' + codeHit.system.code + ' belongs to system ' + codeHit.system.no +
          ' (' + codeHit.system.name + '), not system ' + fields.systemNo + '. Please confirm which is right.');
      }
    } else if (pairs.systemId) {
      var typed = clean(pairs.systemId).split(/\s{2,}/)[0].toUpperCase();
      if (typed) {
        set('systemId', typed, 'read from a labelled field');
        notes.push('The code ' + typed + ' is not in the system list — check it, or add it on the Reference data tab.');
      }
    }

    /* Still nothing, but we know the system: use the code recorded for it. */
    if (fields.systemId === undefined && fields.systemNo !== undefined) {
      var owner = config.systems.filter(function (s) { return Number(s.no) === Number(fields.systemNo); })[0];
      if (owner && owner.code) set('systemId', owner.code, 'the code recorded for this system');
    }

    /* --- business units --- */
    var units = [];
    if (pairs.businessUnits) units = parseUnitList(pairs.businessUnits, config.businessUnits);
    if (!units.length) {
      var buLine = scan.lines.filter(function (l) { return /business\s*unit|impacted/i.test(l); }).join(' ');
      if (buLine) units = parseUnitList(buLine.replace(/business\s*units?/ig, ''), config.businessUnits);
    }
    if (!units.length) units = parseUnitList(whole, config.businessUnits).filter(function (n) {
      /* only accept name matches from free text, never bare numbers — a
         unit named just "3" is therefore never picked out of prose */
      var u = config.businessUnits.filter(function (x) { return Number(x.no) === n; })[0];
      return u && unitNameMatches(u.name, whole);
    });
    if (units.length) set('businessUnits', units, pairs.businessUnits ? 'read from a labelled field' : 'matched unit names in the text');

    /* --- answer code --- */
    function isKnownCode(c) {
      return config.answerCodes.some(function (a) { return a.code === c; });
    }

    var code = '';
    if (pairs.answerCode) {
      /* a colon misread as a digit glues itself to the value ("12010"),
         so prefer any four digit window that is actually in the list */
      var known4 = fourDigitWindows(digitFix(pairs.answerCode)).filter(isKnownCode);
      code = known4[0] || (/\b(\d{4})\b/.exec(digitFix(pairs.answerCode)) || [])[1] || '';
    }
    if (!code) {
      var inlineCode = /\b(?:answer|resolution|closure|fix)\s*code\s*[:\-]?\s*(\d{4})\b/i.exec(digitFix(whole));
      if (inlineCode) code = inlineCode[1];
    }
    if (!code) {
      /* any four digit run that is a known code wins over a random one */
      var candidates = (digitFix(whole).match(/\b\d{4}\b/g) || []);
      var known = candidates.filter(isKnownCode);
      if (known.length) {
        code = known[0];
        if (known.length > 1) notes.push('More than one known answer code appears in the photo (' +
          known.slice(0, 3).join(', ') + '). Took the first.');
      } else if (candidates.length === 1 && !/^(19|20)\d{2}$/.test(candidates[0])) {
        code = candidates[0];
      }
    }
    if (code) {
      set('answerCode', code, pairs.answerCode ? 'read from a labelled field' : 'four digit code found in the text');
      if (!config.answerCodes.some(function (a) { return a.code === code; })) {
        notes.push('Answer code ' + code + ' is not in the code list — check it.');
      }
    }

    /* --- the softer fields --- */
    if (pairs.ref) {
      var r = /\b([A-Z]{2,4}[- ]?\d{3,8}|\d{5,8})\b/i.exec(digitFix(pairs.ref));
      if (r) set('sourceRef', r[1].toUpperCase().replace(/\s+/g, '-'), 'read from a labelled field');
    }

    var pr = pairs.priority || whole;
    var mPr = /\bP\s?([1-4]|[lI])\b/.exec(pr) || /\bp\s?([1-4])\b/i.exec(pr);
    if (mPr) set('priority', 'P' + (/[lI]/.test(mPr[1]) ? '1' : mPr[1]), 'read from the text');
    else if (pairs.priority) {
      var word = key(pairs.priority);
      var map = { critical: 'P1', urgent: 'P1', high: 'P2', medium: 'P3', normal: 'P3', standard: 'P3', low: 'P4', minor: 'P4' };
      Object.keys(map).forEach(function (w) { if (word.indexOf(w) !== -1 && !fields.priority) set('priority', map[w], 'mapped from "' + w + '"'); });
    }

    if (pairs.status) {
      var st = config.statuses.filter(function (s) { return tokenScore(s, pairs.status) >= 0.75; })[0];
      if (st) set('status', st, 'read from a labelled field');
    }

    if (pairs.reportedBy) set('reportedBy', pairs.reportedBy.slice(0, 80), 'read from a labelled field');
    if (pairs.loggedBy) set('loggedBy', pairs.loggedBy.slice(0, 80), 'read from a labelled field');

    var summary = pairs.summary || '';
    if (!summary) {
      /* longest wordy line that is not itself a label line */
      var best = '';
      scan.lines.forEach(function (l) {
        if (/[:–]/.test(l) && labelOf(l.split(/[:–]/)[0])) return;
        var words = l.split(/\s+/).filter(function (w) { return /[a-z]{3,}/i.test(w); });
        if (words.length >= 4 && l.length > best.length) best = l;
      });
      summary = best;
    }
    if (summary) set('summary', summary.slice(0, 300), pairs.summary ? 'read from a labelled field' : 'longest descriptive line');

    var when = pairs.date ? parseDate(pairs.date) : null;
    if (when) set('loggedAt', when, 'read from a labelled field');

    /* --- how complete is this? --- */
    var required = ['systemNo', 'systemId', 'businessUnits', 'answerCode'];
    var identified = fields.systemNo !== undefined
      ? config.systems.filter(function (s) { return Number(s.no) === Number(fields.systemNo); })[0]
      : null;
    if (identified && !identified.code) {
      required = required.filter(function (f) { return f !== 'systemId'; });
    }
    var missing = required.filter(function (f) {
      return fields[f] === undefined || (Array.isArray(fields[f]) && !fields[f].length);
    });
    var confidence = Math.round(((required.length - missing.length) / required.length) * 100);

    return {
      fields: fields, evidence: evidence, missing: missing,
      notes: notes, confidence: confidence, lines: scan.lines
    };
  }

  function parseDate(s) {
    var v = clean(s);
    var m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/.exec(v);
    if (m) {
      var yr = Number(m[3]); if (yr < 100) yr += 2000;
      var d = new Date(Date.UTC(yr, Number(m[2]) - 1, Number(m[1])));
      if (!isNaN(d)) return d.toISOString();
    }
    var iso = /(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return new Date(iso[0] + 'T00:00:00Z').toISOString();
    var loose = new Date(v);
    return isNaN(loose) ? null : loose.toISOString();
  }

  return {
    available: available, read: read, parse: parse, terminate: terminate,
    _internals: {
      scanLines: scanLines, parseUnitList: parseUnitList, digitFix: digitFix,
      labelOf: labelOf, findConfigCode: findConfigCode, codeEquals: codeEquals
    }
  };
})();
