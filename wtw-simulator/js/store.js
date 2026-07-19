/* ============================================================================
   STORE - holds the data and saves it in the browser
   ============================================================================

   Everything is kept in this browser's local storage, so it survives closing
   the tab or the tablet going to sleep. There is no server, no login and no
   data leaves the device.

   If you later move to a shared database, this is the only file that needs
   changing - the rest of the app only talks to the functions at the bottom.
   ============================================================================ */

/* The version number is part of the key. Bump it whenever the shape of the
   saved data changes, so an old save is replaced by fresh sample data rather
   than half-loading and behaving oddly. */
const STORAGE_KEY = 'wtw-capacity-simulator-v2';

/* The whole application state:
     works            the asset registers, from data.js the first time
     outages          every outage ever logged, newest last
     current_works_id which works the operator is looking at             */
let state = null;


/* --- Loading and saving ---------------------------------------------------- */

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      state = JSON.parse(saved);
      // Guard against a half-written or out-of-date save.
      if (state && Array.isArray(state.works) && state.works.length > 0) {
        return state;
      }
    }
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
  }
  return resetState();
}

/* Throw away everything and load the sample works from data.js again. */
function resetState() {
  state = {
    works: JSON.parse(JSON.stringify(SEED_WORKS)),   // deep copy so the seed stays clean
    outages: [],
    current_works_id: SEED_WORKS[0].id
  };
  saveState();
  return state;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save. Is the browser in private mode?', err);
  }
}


/* --- Reading the data ------------------------------------------------------ */

function getWorks() {
  return state.works;
}

function getCurrentWorks() {
  return state.works.find(w => w.id === state.current_works_id) || state.works[0];
}

function setCurrentWorks(worksId) {
  state.current_works_id = worksId;
  saveState();
}

function getAsset(assetId) {
  return getCurrentWorks().assets.find(a => a.id === assetId);
}

/* All outages for the works being viewed, newest first. */
function getOutages(worksId) {
  return state.outages
    .filter(o => o.works_id === (worksId || state.current_works_id))
    .slice()
    .reverse();
}

/* Every outage across every works, newest first - used by regional reporting.
   Records are kept even if their works is later deleted, so the history of
   what actually happened stays intact. */
function getAllOutages() {
  return state.outages.slice().reverse();
}

/* The open (still ongoing) outage for an asset, if there is one. */
function getOpenOutage(assetId) {
  return state.outages.find(o => o.asset_id === assetId && o.end_time === null);
}


/* --- Changing the data ----------------------------------------------------- */

/* Take an asset OUT of service and write the outage record.
   Returns the capacity before and after so the UI can show the impact. */
function takeAssetOutOfService(assetId, details) {
  const works = getCurrentWorks();
  const asset = getAsset(assetId);
  if (!asset || asset.status === 'out_of_service') return null;

  const before = calculateCapacity(works).capacity;
  asset.status = 'out_of_service';
  const after = calculateCapacity(works).capacity;

  state.outages.push({
    id: 'out-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    works_id: works.id,
    works_name: works.name,
    asset_id: asset.id,
    asset_name: asset.name,
    asset_type: asset.type,
    reason: details.reason,
    planned: details.planned,
    start_time: details.start_time,
    expected_end_time: details.expected_end_time || null,
    end_time: null,                       // null means still ongoing
    notes: details.notes || '',
    capacity_before: before,
    capacity_after: after,
    capacity_impact: round1(before - after)
  });

  saveState();
  return { before, after };
}

/* Put an asset back INTO service and close off its outage record. */
function returnAssetToService(assetId) {
  const works = getCurrentWorks();
  const asset = getAsset(assetId);
  if (!asset || asset.status === 'in_service') return null;

  const before = calculateCapacity(works).capacity;
  asset.status = 'in_service';
  const after = calculateCapacity(works).capacity;

  const open = getOpenOutage(assetId);
  if (open) {
    open.end_time = new Date().toISOString();
    open.capacity_restored_to = after;
  }

  saveState();
  return { before, after };
}

/* Put every asset back in service - the "start of shift, all clear" button. */
function returnAllToService() {
  getCurrentWorks().assets
    .filter(a => a.status === 'out_of_service')
    .forEach(a => returnAssetToService(a.id));
}


/* ===========================================================================
   ADMIN OPERATIONS - creating and editing works, stages and assets
   ===========================================================================
   These are used by the Setup screen (js/admin.js). They only change the data;
   the screen redraws itself afterwards.
   =========================================================================== */

/* Make a short unique id from a name, e.g. "Hilltop WTW" -> "hilltop-wtw".
   A number is added if that id is already taken. */
function makeId(text, existingIds) {
  let base = String(text).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')      // spaces and punctuation become hyphens
    .replace(/^-+|-+$/g, '')          // trim hyphens off the ends
    .slice(0, 40) || 'item';
  let id = base;
  let n = 2;
  while (existingIds.includes(id)) { id = base + '-' + n; n++; }
  return id;
}

/* --- Works ---------------------------------------------------------------- */

function createWorks(name, baseline) {
  const works = {
    id: makeId(name, state.works.map(w => w.id)),
    name: name,
    baseline_capacity_ML_per_day: Number(baseline) || 0,
    stages: [],
    assets: []
  };
  state.works.push(works);
  saveState();
  return works;
}

function updateWorks(worksId, changes) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return null;
  if (changes.name !== undefined) works.name = changes.name;
  if (changes.baseline !== undefined) {
    works.baseline_capacity_ML_per_day = Number(changes.baseline) || 0;
  }
  saveState();
  return works;
}

/* Removing a works keeps its outage records. They already store the works name,
   so past events still appear in regional reporting - deleting a site should
   not quietly rewrite history. */
function deleteWorks(worksId) {
  if (state.works.length <= 1) return false;      // never delete the last one
  state.works = state.works.filter(w => w.id !== worksId);
  if (state.current_works_id === worksId) {
    state.current_works_id = state.works[0].id;
  }
  saveState();
  return true;
}

/* --- Stages --------------------------------------------------------------- */

function addStage(worksId, name) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return null;
  const stage = { id: makeId(name, works.stages.map(s => s.id)), name: name };
  works.stages.push(stage);
  saveState();
  return stage;
}

function renameStage(worksId, stageId, name) {
  const works = state.works.find(w => w.id === worksId);
  const stage = works && works.stages.find(s => s.id === stageId);
  if (stage) { stage.name = name; saveState(); }
  return stage;
}

/* Stage order is the order water flows through the works. It does not change
   the capacity answer (the tightest stage wins wherever it sits), but it keeps
   the screens readable. */
function moveStage(worksId, stageId, direction) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return false;
  const i = works.stages.findIndex(s => s.id === stageId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= works.stages.length) return false;
  [works.stages[i], works.stages[j]] = [works.stages[j], works.stages[i]];
  saveState();
  return true;
}

/* Deleting a stage also deletes the assets in it - there is nowhere for them
   to go. The Setup screen warns before calling this. */
function deleteStage(worksId, stageId) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return false;
  works.stages = works.stages.filter(s => s.id !== stageId);
  works.assets = works.assets.filter(a => a.stage_id !== stageId);
  saveState();
  return true;
}

function assetsInStage(worksId, stageId) {
  const works = state.works.find(w => w.id === worksId);
  return works ? works.assets.filter(a => a.stage_id === stageId) : [];
}

/* --- Assets --------------------------------------------------------------- */

function addAsset(worksId, details) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return null;
  // Ids must be unique across every works, because outage records refer to them.
  const allIds = state.works.flatMap(w => w.assets.map(a => a.id));
  const asset = {
    id: makeId(details.name, allIds),
    name: details.name,
    type: details.type,
    stage_id: details.stage_id,
    capacity_ML_per_day: Number(details.capacity_ML_per_day) || 0,
    is_standby: !!details.is_standby,
    outage_rule: details.outage_rule || 'share_of_stage',
    status: 'in_service'
  };
  if (asset.outage_rule === 'limit_works') {
    asset.limit_ML_per_day = Number(details.limit_ML_per_day) || 0;
  }
  works.assets.push(asset);
  saveState();
  return asset;
}

function updateAsset(worksId, assetId, details) {
  const works = state.works.find(w => w.id === worksId);
  const asset = works && works.assets.find(a => a.id === assetId);
  if (!asset) return null;

  asset.name = details.name;
  asset.type = details.type;
  asset.stage_id = details.stage_id;
  asset.capacity_ML_per_day = Number(details.capacity_ML_per_day) || 0;
  asset.is_standby = !!details.is_standby;
  asset.outage_rule = details.outage_rule;

  if (asset.outage_rule === 'limit_works') {
    asset.limit_ML_per_day = Number(details.limit_ML_per_day) || 0;
  } else {
    delete asset.limit_ML_per_day;      // not meaningful for the other rules
  }
  saveState();
  return asset;
}

function deleteAsset(worksId, assetId) {
  const works = state.works.find(w => w.id === worksId);
  if (!works) return false;
  works.assets = works.assets.filter(a => a.id !== assetId);
  saveState();
  return true;
}


/* ===========================================================================
   CONFIGURATION CHECKS
   ===========================================================================
   Run over a works to catch setup mistakes before an operator relies on it.
   Returns a list of { level, message }, where level is 'error' or 'warning'.
   =========================================================================== */
function checkWorks(works) {
  const issues = [];
  const err  = (message) => issues.push({ level: 'error', message });
  const warn = (message) => issues.push({ level: 'warning', message });

  if (!works.baseline_capacity_ML_per_day || works.baseline_capacity_ML_per_day <= 0) {
    err('Baseline capacity has not been set. Capacity cannot be worked out.');
  }
  if (works.stages.length === 0) {
    err('No treatment stages have been added yet.');
  }
  if (works.assets.length === 0) {
    warn('No assets have been added yet.');
  }

  // Assets pointing at a stage that no longer exists would be invisible on the
  // operator screen and silently ignored by the maths.
  const stageIds = works.stages.map(s => s.id);
  works.assets
    .filter(a => !stageIds.includes(a.stage_id))
    .forEach(a => err(`"${a.name}" is not in any stage, so it is being ignored.`));

  works.stages
    .filter(s => works.assets.filter(a => a.stage_id === s.id).length === 0)
    .forEach(s => warn(`Stage "${s.name}" has no assets in it.`));

  works.assets
    .filter(a => a.outage_rule === 'limit_works'
                 && (a.limit_ML_per_day === undefined || a.limit_ML_per_day === null))
    .forEach(a => err(`"${a.name}" limits the works but no limit has been set.`));

  works.assets
    .filter(a => a.capacity_ML_per_day <= 0 && a.outage_rule === 'share_of_stage')
    .forEach(a => warn(`"${a.name}" is rated 0 Ml/d, so taking it out will have no effect.`));

  // Can this works actually reach its baseline with everything in service?
  const allIn = JSON.parse(JSON.stringify(works));
  allIn.assets.forEach(a => { a.status = 'in_service'; });
  const best = calculateCapacity(allIn);
  if (works.stages.length > 0 && best.capacity < works.baseline_capacity_ML_per_day) {
    warn(`With everything in service this works reaches only `
       + `${fmt(best.capacity)} Ml/d, below its ${fmt(works.baseline_capacity_ML_per_day)} Ml/d `
       + `baseline. Check the ratings in ${best.bottleneck ? best.bottleneck.name : 'each stage'}.`);
  }

  // Duplicate names are legal but make the operator screen ambiguous.
  const seen = {};
  works.assets.forEach(a => {
    if (seen[a.name]) warn(`There is more than one asset called "${a.name}".`);
    seen[a.name] = true;
  });

  return issues;
}


/* ===========================================================================
   BACKUP - move a configuration between devices
   ===========================================================================
   There is no server, so this is how a configuration built on one tablet gets
   onto another.
   =========================================================================== */

function exportConfigJSON() {
  const config = { exported: new Date().toISOString(), works: state.works };
  downloadFile(JSON.stringify(config, null, 2),
               'works-configuration.json', 'application/json');
}

/* Replaces every works with the ones in the file. Outage history is untouched.
   Returns { ok, message } so the screen can report what happened. */
function importConfigJSON(text) {
  let config;
  try {
    config = JSON.parse(text);
  } catch (e) {
    return { ok: false, message: 'That file is not readable. Is it the right file?' };
  }
  if (!config || !Array.isArray(config.works) || config.works.length === 0) {
    return { ok: false, message: 'That file does not contain any works.' };
  }
  // Check the shape before overwriting anything.
  const bad = config.works.find(w => !w.id || !w.name
    || !Array.isArray(w.stages) || !Array.isArray(w.assets));
  if (bad) {
    return { ok: false, message: 'That file is missing information for at least one works.' };
  }

  state.works = config.works;
  state.current_works_id = config.works[0].id;
  saveState();
  return { ok: true, message: `Loaded ${config.works.length} works.` };
}


/* --- CSV export ------------------------------------------------------------ */

/* Build the outage history as CSV text and hand it to the browser as a
   download. Opens in Excel.

   This exports EVERY works, not just the one on screen - the first column
   says which works each row belongs to. That is what you want for reporting.
   To export only the works being viewed, change state.outages below to
   getOutages().                                                             */
function exportOutagesToCSV() {
  const columns = [
    'Works', 'Asset', 'Asset type', 'Reason', 'Planned or unplanned',
    'Start time', 'Expected end time', 'Actual end time', 'Duration (hours)',
    'Capacity before (Ml/d)', 'Capacity during (Ml/d)', 'Capacity lost (Ml/d)',
    'Status', 'Notes'
  ];

  const rows = state.outages.map(o => [
    o.works_name,
    o.asset_name,
    o.asset_type,
    o.reason,
    o.planned ? 'Planned' : 'Unplanned',
    formatDateTime(o.start_time),
    o.expected_end_time ? formatDateTime(o.expected_end_time) : '',
    o.end_time ? formatDateTime(o.end_time) : '',
    o.end_time ? durationHours(o.start_time, o.end_time) : '',
    o.capacity_before,
    o.capacity_after,
    o.capacity_impact,
    o.end_time ? 'Closed' : 'Ongoing',
    o.notes
  ]);

  // Wrap every field in quotes and double up any quotes inside it, so that
  // commas and line breaks in the notes cannot break the file.
  const csv = [columns, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // Local date, not toISOString(), so a file exported just after midnight is
  // not stamped with the previous day.
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const filename = `outage-history-${today.getFullYear()}-`
                 + `${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8;');
}

function downloadFile(contents, filename, mimeType) {
  // The BOM makes Excel open the file as UTF-8 rather than mangling it.
  const blob = new Blob(['﻿' + contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


/* --- Date helpers ---------------------------------------------------------- */

// "2026-07-19T14:30" -> "19/07/2026 14:30"  (UK format, for operators)
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The value an <input type="datetime-local"> expects, for "now".
function nowForInput(date) {
  const d = date ? new Date(date) : new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationHours(startIso, endIso) {
  const hours = (new Date(endIso) - new Date(startIso)) / 3600000;
  return Math.round(hours * 10) / 10;
}

// "3 h 20 m ago" style text for the outage cards.
function elapsedSince(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ${hours % 24} h`;
}
