/* ============================================================================
   USER INTERFACE
   ============================================================================
   Draws the screen and handles taps. The pattern is deliberately simple:

     something changes  ->  render()  ->  the whole screen is redrawn

   That is fast enough here and means there is only ever one place that decides
   what the screen should look like, so it cannot get out of step with the data.
   ============================================================================ */

/* Shorthand for finding elements. */
const $ = (id) => document.getElementById(id);

/* Which screen and tab are showing, and which asset the operator is taking out. */
let activeMode = 'works';       // 'region' | 'works' | 'admin'
let activeTab = 'assets';       // tabs within the works screen
let reportDays = 30;            // period shown on the regional screen
let pendingAsset = null;        // asset being taken out in the dialog
let pendingReason = null;       // reason chosen in the dialog


/* =========================================================================
   START UP
   ========================================================================= */
function init() {
  loadState();
  buildWorksSelect();
  buildReasonButtons();
  wireUpEvents();
  wireUpAdminEvents();          // Setup screen, from js/admin.js
  startClock();
  render();
}


/* =========================================================================
   THE MAIN RENDER
   ========================================================================= */
function render() {
  const works = getCurrentWorks();
  const result = calculateCapacity(works);   // <- all the maths, from rules.js

  renderModes();

  // Only redraw the screen that is showing. The others are rebuilt when the
  // operator switches to them, so nothing can be left stale.
  if (activeMode === 'works') {
    renderCapacityPanel(works, result);
    renderOutBanner(works);
    renderAssets(works, result);
    renderStages(result);
    renderHistory();
    renderTabs();
  } else if (activeMode === 'region') {
    renderRegion();
  } else if (activeMode === 'admin') {
    renderAdmin();             // from js/admin.js
  }
}

/* ---- switching between Region / This works / Setup ---------------------- */
function renderModes() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.mode === activeMode);
  });
  ['region', 'works', 'admin'].forEach(name => {
    $('mode-' + name).hidden = (name !== activeMode);
  });

  // The works picker is meaningless on the regional screen.
  $('works-select').hidden = (activeMode === 'region');
  $('region-title').hidden = (activeMode !== 'region');
  document.body.classList.toggle('in-admin', activeMode === 'admin');
}


/* =========================================================================
   THE REGIONAL SCREEN
   ========================================================================= */
function renderRegion() {
  const region = calculateRegion();          // from js/report.js

  /* ---- headline gauge ---- */
  const panel = $('region-panel');
  panel.classList.toggle('is-reduced', region.total > 0 && region.total < region.baseline);
  panel.classList.toggle('is-stopped', region.total === 0);

  $('region-now').textContent = fmt(region.total);
  $('region-baseline').textContent = fmt(region.baseline);
  $('region-lost').textContent = fmt(region.lost);
  $('region-percent').textContent = region.percent + '%';
  $('region-sites-affected').textContent = region.counts.reduced + region.counts.stopped;
  $('region-assets-out').textContent = region.assets_out;

  const ARC = 264;
  const fraction = region.baseline > 0 ? region.total / region.baseline : 0;
  $('region-gauge-fill').style.strokeDashoffset =
    ARC - (ARC * Math.min(1, Math.max(0, fraction)));

  $('region-pill').textContent =
      region.counts.stopped > 0 ? `${region.counts.stopped} works stopped`
    : region.counts.reduced > 0 ? `${region.counts.reduced} works reduced`
    :                             'All works at full capacity';

  $('region-reason').textContent =
    region.lost === 0
      ? `All ${region.counts.total} works are producing at full capacity.`
      : `${fmt(region.lost)} Ml/d unavailable across `
        + `${region.counts.reduced + region.counts.stopped} of ${region.counts.total} works.`;

  /* ---- one card per works ---- */
  $('region-sites').innerHTML = region.sites.map(site => {
    const width = site.baseline > 0 ? (site.capacity / site.baseline) * 100 : 0;
    // Bar widths are scaled against the biggest works so the sites are
    // visually comparable rather than each filling its own row.
    const share = region.baseline > 0 ? (site.baseline / region.baseline) * 100 : 0;

    return `
      <div class="region-site is-${site.status}" data-open-works="${site.id}">
        <div class="region-site-head">
          <span class="region-site-name">${escapeHtml(site.name)}</span>
          <span class="region-site-figure">
            <strong>${fmt(site.capacity)}</strong> / ${fmt(site.baseline)} Ml/d
          </span>
        </div>
        <div class="region-scale" style="width:${Math.max(share, 12)}%">
          <div class="stage-bar">
            <div class="stage-bar-fill" style="width:${width}%"></div>
          </div>
        </div>
        <div class="region-site-note">
          ${escapeHtml(site.reason)}
          ${site.assets_out > 0
            ? ` &middot; ${site.assets_out} out: ${escapeHtml(site.asset_names.join(', '))}`
            : ''}
        </div>
      </div>`;
  }).join('');

  renderRegionHistory();
}


/* ---- what outages have cost, over the chosen period --------------------- */
function renderRegionHistory() {
  const history = summariseHistory(reportDays || null);

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.toggle('is-active', Number(btn.dataset.days) === reportDays);
  });

  if (history.count === 0) {
    $('region-history').innerHTML =
      '<div class="empty">No outages recorded in this period.</div>';
    return;
  }

  // A small table builder, reused for the three breakdowns below.
  const table = (title, rows, label) => `
    <div class="report-card">
      <h3 class="admin-group-title">${title}</h3>
      <table class="report-table">
        <thead>
          <tr><th>${label}</th><th>Outages</th><th>Hours</th><th>Lost (Ml)</th></tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.key)}</td>
              <td>${r.count}</td>
              <td>${fmt(r.hours)}</td>
              <td><strong>${fmt(r.lost_volume_ML)}</strong></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  $('region-history').innerHTML = `
    <div class="report-figures">
      <div class="report-figure">
        <span class="report-value">${fmt(history.total_lost_volume_ML)}</span>
        <span class="figure-label">Ml of production lost</span>
      </div>
      <div class="report-figure">
        <span class="report-value">${history.count}</span>
        <span class="figure-label">outages recorded</span>
      </div>
      <div class="report-figure">
        <span class="report-value">${fmt(history.total_hours)}</span>
        <span class="figure-label">hours out of service</span>
      </div>
      <div class="report-figure">
        <span class="report-value">${history.unplanned_share}%</span>
        <span class="figure-label">of losses unplanned</span>
      </div>
    </div>

    <div class="split-bar" title="Planned versus unplanned share of lost production">
      <div class="split-planned" style="width:${100 - history.unplanned_share}%"></div>
      <div class="split-unplanned" style="width:${history.unplanned_share}%"></div>
    </div>
    <div class="split-key">
      <span><i class="key-planned"></i>
        Planned: ${plural(history.planned_count, 'outage')}, ${fmt(history.planned_lost_ML)} Ml</span>
      <span><i class="key-unplanned"></i>
        Unplanned: ${plural(history.unplanned_count, 'outage')}, ${fmt(history.unplanned_lost_ML)} Ml</span>
    </div>

    ${table('Lost production by works', history.by_works, 'Works')}
    ${table('Lost production by reason', history.by_reason, 'Reason')}
    ${table('Lost production by asset type', history.by_type, 'Asset type')}`;
}


/* ---- the big gauge and headline numbers --------------------------------- */
function renderCapacityPanel(works, result) {
  const panel = $('capacity-panel');

  // Colour the whole panel green / amber / red.
  panel.classList.toggle('is-reduced', result.capacity > 0 && result.capacity < result.baseline);
  panel.classList.toggle('is-stopped', result.capacity === 0);

  $('capacity-now').textContent = fmt(result.capacity);
  $('capacity-baseline').textContent = fmt(result.baseline);
  $('capacity-reason').textContent = result.reason;
  $('figure-lost').textContent = fmt(result.lost);
  $('figure-percent').textContent = result.percent + '%';
  $('figure-out').textContent = works.assets.filter(a => a.status === 'out_of_service').length;

  $('status-pill').textContent =
      result.capacity === 0            ? 'Production stopped'
    : result.capacity < result.baseline ? 'Reduced capacity'
    :                                     'Full capacity';

  // Fill the gauge arc. 264 is the arc's length (see styles.css).
  const ARC = 264;
  const fraction = result.baseline > 0 ? result.capacity / result.baseline : 0;
  $('gauge-fill').style.strokeDashoffset = ARC - (ARC * Math.min(1, Math.max(0, fraction)));
}


/* ---- the "currently out of service" strip ------------------------------- */
function renderOutBanner(works) {
  const out = works.assets.filter(a => a.status === 'out_of_service');
  const banner = $('out-banner');

  banner.hidden = out.length === 0;
  if (out.length === 0) return;

  $('out-list').innerHTML = out.map(asset => {
    const outage = getOpenOutage(asset.id);
    const detail = outage
      ? `${escapeHtml(outage.reason)} &middot; out for ${elapsedSince(outage.start_time)}`
      : 'No outage record';
    return `<div class="out-chip">
              <strong>${escapeHtml(asset.name)}</strong>
              <span>${detail}</span>
            </div>`;
  }).join('');
}


/* ---- the asset register, grouped by treatment stage --------------------- */
function renderAssets(works, result) {
  $('asset-groups').innerHTML = works.stages.map(stage => {
    const assets = works.assets.filter(a => a.stage_id === stage.id);
    if (assets.length === 0) return '';

    const stageResult = result.stages.find(s => s.id === stage.id);
    const tight = stageResult.capacity <= result.capacity && result.capacity < result.baseline;

    return `
      <div class="stage-group">
        <div class="stage-head">
          <h3 class="stage-name">${escapeHtml(stage.name)}</h3>
          <span class="stage-cap ${tight ? 'is-tight' : ''}">
            ${fmt(stageResult.capacity)} of ${fmt(stageResult.design)} Ml/d available
          </span>
        </div>
        <div class="asset-grid">
          ${assets.map(assetCard).join('')}
        </div>
      </div>`;
  }).join('');
}

/* One asset card, with its in/out toggle. */
function assetCard(asset) {
  const isOut = asset.status === 'out_of_service';

  // A short badge explaining what this asset's loss would do. The wording
  // comes from OUTAGE_RULES in rules.js, so adding a rule adds a badge.
  const rule = OUTAGE_RULES[asset.outage_rule] || OUTAGE_RULES.share_of_stage;
  const ruleTag = rule.badge
    ? `<span class="tag ${rule.badgeClass}" title="${escapeHtml(rule.label)}">${escapeHtml(rule.badge(asset))}</span>`
    : '';
  const standbyTag = asset.is_standby ? '<span class="tag tag-standby">Standby</span>' : '';

  return `
    <div class="asset-card ${isOut ? 'is-out' : ''}">
      <div class="asset-info">
        <div class="asset-name">${escapeHtml(asset.name)}</div>
        <div class="asset-meta">${escapeHtml(asset.type)} &middot; ${fmt(asset.capacity_ML_per_day)} Ml/d</div>
        <div class="asset-tags">${standbyTag}${ruleTag}</div>
      </div>
      <button class="toggle ${isOut ? 'is-out' : ''}" data-asset="${asset.id}">
        ${isOut ? 'Out of service' : 'In service'}
      </button>
    </div>`;
}


/* ---- the capacity breakdown, stage by stage ----------------------------- */
function renderStages(result) {
  $('stage-list').innerHTML = result.stages.map(stage => {
    // How full is this stage relative to what the works needs?
    const width = Math.min(100, (stage.capacity / result.baseline) * 100);
    const isBottleneck = result.bottleneck && result.bottleneck.id === stage.id;

    const note = stage.units_out === 0
      ? `All ${stage.total_units} in service.`
      : `${stage.units_out} of ${stage.total_units} out of service.`
        + (stage.capacity >= result.baseline
            ? ' Standby capacity is covering it - no impact.'
            : ` This stage is holding the works to ${fmt(stage.capacity)} Ml/d.`);

    return `
      <div class="stage-row ${isBottleneck ? 'is-bottleneck' : ''}">
        <div class="stage-row-head">
          <span class="stage-row-name">${escapeHtml(stage.name)}</span>
          <span class="stage-row-value">${fmt(stage.capacity)} Ml/d available
            (design ${fmt(stage.design)})</span>
        </div>
        <div class="stage-bar"><div class="stage-bar-fill" style="width:${width}%"></div></div>
        <div class="stage-row-note">${note}</div>
      </div>`;
  }).join('');
}


/* ---- the outage history log --------------------------------------------- */
function renderHistory() {
  const outages = getOutages();

  if (outages.length === 0) {
    $('history-list').innerHTML =
      '<div class="empty">No outages logged yet for this works.<br>'
      + 'Take an asset out of service on the Assets tab and it will appear here.</div>';
    return;
  }

  $('history-list').innerHTML = outages.map(o => {
    const ongoing = o.end_time === null;
    const impactClass = o.capacity_impact > 0 ? '' : 'is-none';
    const impactText = o.capacity_impact > 0
      ? `-${fmt(o.capacity_impact)} Ml/d`
      : 'No capacity impact';

    const timing = ongoing
      ? `Out since ${formatDateTime(o.start_time)} (${elapsedSince(o.start_time)})`
        + (o.expected_end_time ? ` &middot; expected back ${formatDateTime(o.expected_end_time)}` : '')
      : `${formatDateTime(o.start_time)} to ${formatDateTime(o.end_time)} `
        + `(${durationHours(o.start_time, o.end_time)} h)`;

    return `
      <div class="history-item ${ongoing ? 'is-ongoing' : ''}">
        <div class="history-head">
          <span class="history-asset">${escapeHtml(o.asset_name)}</span>
          <span class="history-impact ${impactClass}">${impactText}</span>
        </div>
        <div class="history-meta">
          ${escapeHtml(o.reason)} &middot; ${o.planned ? 'Planned' : 'Unplanned'}
          &middot; ${ongoing ? 'Ongoing' : 'Closed'}
        </div>
        <div class="history-meta">${timing}</div>
        <div class="history-meta">
          Works ran at ${fmt(o.capacity_after)} Ml/d during this outage
          (was ${fmt(o.capacity_before)} Ml/d).
        </div>
        ${o.notes ? `<div class="history-notes">${escapeHtml(o.notes)}</div>` : ''}
      </div>`;
  }).join('');
}


/* ---- tabs ---------------------------------------------------------------- */
function renderTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.tab === activeTab);
  });
  ['assets', 'stages', 'history'].forEach(name => {
    $('tab-' + name).hidden = (name !== activeTab);
  });
}


/* =========================================================================
   TAKING AN ASSET OUT OF SERVICE
   ========================================================================= */

/* Tapping a toggle. In service -> open the dialog. Out of service -> put back. */
function onToggleAsset(assetId) {
  const asset = getAsset(assetId);
  if (!asset) return;

  if (asset.status === 'out_of_service') {
    const change = returnAssetToService(assetId);
    render();
    showToast(change.after > change.before
      ? `${asset.name} back in service. Capacity now ${fmt(change.after)} Ml/d.`
      : `${asset.name} back in service.`);
    return;
  }

  openOutageDialog(asset);
}

function openOutageDialog(asset) {
  pendingAsset = asset;
  pendingReason = null;

  $('modal-asset-name').textContent = asset.name;
  $('field-start').value = nowForInput();
  $('field-expected').value = '';
  $('field-notes').value = '';

  document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('is-selected'));
  updateImpactPreview(asset);

  $('modal-backdrop').hidden = false;
}

function closeOutageDialog() {
  $('modal-backdrop').hidden = true;
  pendingAsset = null;
  pendingReason = null;
}

/* Show the operator what this outage will do BEFORE they commit to it.
   Works it out by pretending the asset is out, then putting it straight back. */
function updateImpactPreview(asset) {
  const works = getCurrentWorks();

  const before = calculateCapacity(works).capacity;
  asset.status = 'out_of_service';
  const after = calculateCapacity(works);
  asset.status = 'in_service';                  // undo the pretend change

  $('impact-from').textContent = fmt(before);
  $('impact-to').textContent = fmt(after.capacity);
  $('impact-to').classList.toggle('is-none', after.capacity >= before);
  $('impact-note').textContent = after.capacity >= before
    ? 'No capacity impact - standby cover is available.'
    : after.reason;
}

/* Save the outage. */
function confirmOutage() {
  if (!pendingAsset) return;

  if (!pendingReason) {
    showToast('Please choose a reason first.');
    return;
  }

  const startValue = $('field-start').value;
  const expectedValue = $('field-expected').value;

  const change = takeAssetOutOfService(pendingAsset.id, {
    reason: pendingReason.label,
    planned: pendingReason.planned,
    // datetime-local gives local time; store it as a full ISO timestamp.
    start_time: startValue ? new Date(startValue).toISOString() : new Date().toISOString(),
    expected_end_time: expectedValue ? new Date(expectedValue).toISOString() : null,
    notes: $('field-notes').value.trim()
  });

  const name = pendingAsset.name;
  closeOutageDialog();
  render();

  showToast(change.after < change.before
    ? `${name} logged out of service. Capacity now ${fmt(change.after)} Ml/d.`
    : `${name} logged out of service. No capacity impact.`);
}


/* =========================================================================
   BUILDING THE FIXED BITS AND WIRING UP TAPS
   ========================================================================= */

function buildWorksSelect() {
  const select = $('works-select');
  select.innerHTML = getWorks()
    .map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`)
    .join('');
  select.value = getCurrentWorks().id;
}

function buildReasonButtons() {
  $('reason-grid').innerHTML = OUTAGE_REASONS.map((r, i) => `
    <button type="button" class="reason-btn" data-reason="${i}">
      ${escapeHtml(r.label)}
      <small>${r.planned ? 'Planned' : 'Unplanned'}</small>
    </button>`).join('');
}

function wireUpEvents() {

  // Asset toggles are created fresh on every render, so listen on the page
  // and work out what was tapped. This is called event delegation.
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('.toggle');
    if (toggle) { onToggleAsset(toggle.dataset.asset); return; }

    const modeBtn = event.target.closest('.mode-btn');
    if (modeBtn) { activeMode = modeBtn.dataset.mode; render(); window.scrollTo(0, 0); return; }

    const tab = event.target.closest('.tab');
    if (tab) { activeTab = tab.dataset.tab; renderTabs(); return; }

    const period = event.target.closest('.period-btn');
    if (period) { reportDays = Number(period.dataset.days); renderRegionHistory(); return; }

    // Tapping a works on the regional screen opens it.
    const openWorks = event.target.closest('[data-open-works]');
    if (openWorks) {
      setCurrentWorks(openWorks.getAttribute('data-open-works'));
      buildWorksSelect();
      activeMode = 'works';
      activeTab = 'assets';
      render();
      window.scrollTo(0, 0);
      return;
    }

    const reason = event.target.closest('.reason-btn');
    if (reason) {
      pendingReason = OUTAGE_REASONS[Number(reason.dataset.reason)];
      document.querySelectorAll('.reason-btn').forEach(b => b.classList.remove('is-selected'));
      reason.classList.add('is-selected');
      return;
    }

    // "+4 h" / "+1 day" / "+1 week" shortcuts for the expected end time.
    const quick = event.target.closest('[data-quick-hours]');
    if (quick) {
      const from = $('field-start').value ? new Date($('field-start').value) : new Date();
      from.setHours(from.getHours() + Number(quick.dataset.quickHours));
      $('field-expected').value = nowForInput(from);
      return;
    }
  });

  $('works-select').addEventListener('change', (e) => {
    setCurrentWorks(e.target.value);
    render();
  });

  $('btn-now').addEventListener('click', () => { $('field-start').value = nowForInput(); });
  $('btn-cancel').addEventListener('click', closeOutageDialog);
  $('btn-confirm').addEventListener('click', confirmOutage);

  // Tapping the dark area outside the dialog closes it.
  $('modal-backdrop').addEventListener('click', (e) => {
    if (e.target === $('modal-backdrop')) closeOutageDialog();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('modal-backdrop').hidden) closeOutageDialog();
    else if (!$('asset-modal').hidden) closeAssetEditor();
  });

  $('btn-all-back').addEventListener('click', () => {
    const works = getCurrentWorks();
    const count = works.assets.filter(a => a.status === 'out_of_service').length;
    if (count === 0) { showToast('Everything is already in service.'); return; }
    if (!confirm(`Put all ${count} asset(s) back in service?`)) return;
    returnAllToService();
    render();
    showToast('All assets back in service.');
  });

  $('btn-export-region').addEventListener('click', () => {
    exportRegionalSummaryCSV(reportDays || null);
    showToast('Regional summary downloaded.');
  });

  $('btn-export').addEventListener('click', () => {
    if (getOutages().length === 0 && !confirm('There are no outages logged. Export anyway?')) return;
    exportOutagesToCSV();
    showToast('CSV downloaded.');
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('This clears all outage history and reloads the sample works. Continue?')) return;
    resetState();
    buildWorksSelect();
    render();
    showToast('Sample data reloaded.');
  });
}

function startClock() {
  const tick = () => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    $('clock').textContent = `${pad(now.getDate())}/${pad(now.getMonth() + 1)} `
                           + `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };
  tick();
  setInterval(tick, 30000);

  // Refresh the "out for 3 h 20 min" labels every minute. Skipped while a
  // dialog is open, and while in Setup, because redrawing would wipe whatever
  // the administrator is part way through typing.
  setInterval(() => {
    if ($('modal-backdrop').hidden && $('asset-modal').hidden && activeMode !== 'admin') {
      render();
    }
  }, 60000);
}


/* =========================================================================
   SMALL HELPERS
   ========================================================================= */

let toastTimer = null;
function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

/* 1 -> "1 outage", 3 -> "3 outages". Keeps the counts on screen readable. */
function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/* Stops any punctuation in an asset name or note from breaking the page. */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* Go. */
init();
