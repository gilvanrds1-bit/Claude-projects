/* ============================================================================
   SETUP SCREEN - the administrator interface
   ============================================================================
   Lets an administrator build and edit the plant model on screen, instead of
   editing js/data.js by hand. Every change goes straight through the functions
   in store.js, so what is saved always matches what is shown.

   The works being edited here is the same one selected at the top of the
   screen, so switching sites in Setup also switches the operator view.
   ============================================================================ */

/* The asset currently open in the asset editor, or null when adding a new one. */
let editingAssetId = null;


/* =========================================================================
   DRAWING THE SETUP SCREEN
   ========================================================================= */
function renderAdmin() {
  const works = getCurrentWorks();

  $('admin-editing-name').textContent = works.name;
  $('admin-name').value = works.name;
  $('admin-baseline').value = works.baseline_capacity_ML_per_day;

  renderAdminWorksList();
  renderAdminChecks(works);
  renderAdminStages(works);
  renderAdminAssets(works);
}


/* ---- every works in the region, with its current output ------------------ */
function renderAdminWorksList() {
  const currentId = getCurrentWorks().id;
  const onlyOne = getWorks().length === 1;

  $('admin-works-list').innerHTML = getWorks().map(works => {
    const result = calculateCapacity(works);
    const isEditing = works.id === currentId;

    return `
      <div class="admin-works-row ${isEditing ? 'is-editing' : ''}">
        <div class="admin-works-info">
          <div class="admin-works-name">${escapeHtml(works.name)}</div>
          <div class="asset-meta">
            ${fmt(result.baseline)} Ml/d baseline &middot;
            ${works.assets.length} assets &middot;
            ${works.stages.length} stages
          </div>
        </div>
        <div class="admin-row-buttons">
          ${isEditing
            ? '<span class="tag tag-standby">Editing</span>'
            : `<button class="btn btn-small" data-edit-works="${works.id}">Edit</button>`}
          <button class="btn btn-small btn-danger-ghost"
                  data-delete-works="${works.id}" ${onlyOne ? 'disabled' : ''}>Delete</button>
        </div>
      </div>`;
  }).join('');
}


/* ---- setup problems ------------------------------------------------------ */
function renderAdminChecks(works) {
  const issues = checkWorks(works);

  if (issues.length === 0) {
    $('admin-checks').innerHTML =
      '<div class="check-item check-ok">No problems found. This works is set up correctly.</div>';
    return;
  }

  $('admin-checks').innerHTML = issues.map(issue => `
    <div class="check-item check-${issue.level}">
      <strong>${issue.level === 'error' ? 'Problem' : 'Worth checking'}:</strong>
      ${escapeHtml(issue.message)}
    </div>`).join('');
}


/* ---- stages -------------------------------------------------------------- */
function renderAdminStages(works) {
  if (works.stages.length === 0) {
    $('admin-stages').innerHTML =
      '<div class="empty">No stages yet. Add the first treatment stage below.</div>';
    return;
  }

  $('admin-stages').innerHTML = works.stages.map((stage, index) => {
    const count = works.assets.filter(a => a.stage_id === stage.id).length;
    const design = works.assets
      .filter(a => a.stage_id === stage.id)
      .reduce((sum, a) => sum + a.capacity_ML_per_day, 0);

    return `
      <div class="admin-stage-row">
        <div class="admin-stage-order">${index + 1}</div>
        <div class="admin-works-info">
          <div class="admin-works-name">${escapeHtml(stage.name)}</div>
          <div class="asset-meta">${count} asset${count === 1 ? '' : 's'}
            &middot; ${fmt(design)} Ml/d when all in service</div>
        </div>
        <div class="admin-row-buttons">
          <button class="btn btn-small" data-move-stage="${stage.id}" data-direction="-1"
                  ${index === 0 ? 'disabled' : ''} aria-label="Move up">&uarr;</button>
          <button class="btn btn-small" data-move-stage="${stage.id}" data-direction="1"
                  ${index === works.stages.length - 1 ? 'disabled' : ''} aria-label="Move down">&darr;</button>
          <button class="btn btn-small" data-rename-stage="${stage.id}">Rename</button>
          <button class="btn btn-small btn-danger-ghost" data-delete-stage="${stage.id}">Delete</button>
        </div>
      </div>`;
  }).join('');
}


/* ---- assets, grouped by stage so the list matches the operator screen ----- */
function renderAdminAssets(works) {
  if (works.assets.length === 0) {
    $('admin-assets').innerHTML =
      '<div class="empty">No assets yet. Add the first one below.</div>';
    return;
  }

  // Assets whose stage was deleted would otherwise vanish from this screen,
  // leaving a problem the administrator cannot see or fix.
  const stageIds = works.stages.map(s => s.id);
  const orphans = works.assets.filter(a => !stageIds.includes(a.stage_id));

  const groups = works.stages.map(stage => ({
    name: stage.name,
    assets: works.assets.filter(a => a.stage_id === stage.id)
  })).filter(g => g.assets.length > 0);

  if (orphans.length > 0) {
    groups.push({ name: 'Not in any stage - these are being ignored', assets: orphans });
  }

  $('admin-assets').innerHTML = groups.map(group => `
    <div class="admin-asset-group">
      <h3 class="admin-group-title">${escapeHtml(group.name)}</h3>
      ${group.assets.map(asset => {
        const rule = OUTAGE_RULES[asset.outage_rule] || OUTAGE_RULES.share_of_stage;
        const badge = rule.badge
          ? `<span class="tag ${rule.badgeClass}">${escapeHtml(rule.badge(asset))}</span>` : '';
        const standby = asset.is_standby
          ? '<span class="tag tag-standby">Standby</span>' : '';

        return `
          <div class="admin-asset-row">
            <div class="admin-works-info">
              <div class="admin-works-name">${escapeHtml(asset.name)}</div>
              <div class="asset-meta">${escapeHtml(asset.type)}
                &middot; ${fmt(asset.capacity_ML_per_day)} Ml/d</div>
              <div class="asset-tags">${standby}${badge}</div>
            </div>
            <div class="admin-row-buttons">
              <button class="btn btn-small" data-edit-asset="${asset.id}">Edit</button>
              <button class="btn btn-small btn-danger-ghost" data-delete-asset="${asset.id}">Delete</button>
            </div>
          </div>`;
      }).join('')}
    </div>`).join('');
}


/* =========================================================================
   THE ASSET EDITOR
   ========================================================================= */

function openAssetEditor(assetId) {
  const works = getCurrentWorks();

  if (works.stages.length === 0) {
    showToast('Add a treatment stage first - an asset has to sit in one.');
    return;
  }

  editingAssetId = assetId || null;
  const asset = assetId ? works.assets.find(a => a.id === assetId) : null;

  $('asset-modal-sub').textContent = asset ? asset.name : 'New asset';

  // Stage dropdown, in flow order.
  $('asset-field-stage').innerHTML = works.stages
    .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  // Type suggestions.
  $('asset-type-list').innerHTML = ASSET_TYPES
    .map(t => `<option value="${escapeHtml(t)}"></option>`).join('');

  $('asset-field-name').value = asset ? asset.name : '';
  $('asset-field-type').value = asset ? asset.type : '';
  $('asset-field-stage').value = asset ? asset.stage_id : works.stages[0].id;
  $('asset-field-capacity').value = asset ? asset.capacity_ML_per_day : '';
  $('asset-field-standby').checked = asset ? !!asset.is_standby : false;
  $('asset-field-limit').value = asset && asset.limit_ML_per_day !== undefined
    ? asset.limit_ML_per_day : '';

  const rule = asset ? asset.outage_rule : 'share_of_stage';
  document.querySelectorAll('input[name="asset-rule"]').forEach(radio => {
    radio.checked = (radio.value === rule);
  });
  updateLimitRowVisibility();

  $('asset-modal').hidden = false;
}

function closeAssetEditor() {
  $('asset-modal').hidden = true;
  editingAssetId = null;
}

/* The "hold the works at" box is only meaningful for the limit rule. */
function updateLimitRowVisibility() {
  const selected = document.querySelector('input[name="asset-rule"]:checked');
  $('asset-limit-row').hidden = !selected || selected.value !== 'limit_works';
}

function saveAssetFromEditor() {
  const works = getCurrentWorks();
  const name = $('asset-field-name').value.trim();
  const selectedRule = document.querySelector('input[name="asset-rule"]:checked');
  const rule = selectedRule ? selectedRule.value : 'share_of_stage';
  const limit = $('asset-field-limit').value;

  // Validate before saving, so a half-filled asset never reaches the register.
  if (!name) { showToast('Give the asset a name.'); return; }
  if ($('asset-field-capacity').value === '') {
    showToast('Enter what the asset is rated at in Ml/d.'); return;
  }
  if (rule === 'limit_works' && limit === '') {
    showToast('Enter the figure the works should be held at.'); return;
  }

  const details = {
    name: name,
    type: $('asset-field-type').value.trim() || 'Other',
    stage_id: $('asset-field-stage').value,
    capacity_ML_per_day: $('asset-field-capacity').value,
    is_standby: $('asset-field-standby').checked,
    outage_rule: rule,
    limit_ML_per_day: limit
  };

  if (editingAssetId) {
    updateAsset(works.id, editingAssetId, details);
    showToast(`${name} updated.`);
  } else {
    addAsset(works.id, details);
    showToast(`${name} added.`);
  }

  closeAssetEditor();
  render();
}


/* =========================================================================
   TAPS ON THE SETUP SCREEN
   ========================================================================= */
function wireUpAdminEvents() {

  document.addEventListener('click', (event) => {
    const works = getCurrentWorks();
    const hit = (attr) => {
      const el = event.target.closest('[' + attr + ']');
      return el ? el.getAttribute(attr) : null;
    };

    /* --- works --- */
    const editWorks = hit('data-edit-works');
    if (editWorks) { setCurrentWorks(editWorks); buildWorksSelect(); render(); return; }

    const deleteWorksId = hit('data-delete-works');
    if (deleteWorksId) {
      const target = getWorks().find(w => w.id === deleteWorksId);
      if (!confirm(`Delete ${target.name} and all its assets?\n\n`
                 + 'Its past outage records are kept for reporting.')) return;
      deleteWorks(deleteWorksId);
      buildWorksSelect();
      render();
      showToast(`${target.name} deleted.`);
      return;
    }

    /* --- stages --- */
    const moveStageId = hit('data-move-stage');
    if (moveStageId) {
      const direction = Number(event.target.closest('[data-direction]').getAttribute('data-direction'));
      moveStage(works.id, moveStageId, direction);
      render();
      return;
    }

    const renameStageId = hit('data-rename-stage');
    if (renameStageId) {
      const stage = works.stages.find(s => s.id === renameStageId);
      const name = prompt('Stage name:', stage.name);
      if (name && name.trim()) { renameStage(works.id, renameStageId, name.trim()); render(); }
      return;
    }

    const deleteStageId = hit('data-delete-stage');
    if (deleteStageId) {
      const stage = works.stages.find(s => s.id === deleteStageId);
      const count = assetsInStage(works.id, deleteStageId).length;
      const warning = count > 0
        ? `\n\nThe ${count} asset(s) in this stage will be deleted too.` : '';
      if (!confirm(`Delete the stage "${stage.name}"?` + warning)) return;
      deleteStage(works.id, deleteStageId);
      render();
      showToast('Stage deleted.');
      return;
    }

    /* --- assets --- */
    const editAssetId = hit('data-edit-asset');
    if (editAssetId) { openAssetEditor(editAssetId); return; }

    const deleteAssetId = hit('data-delete-asset');
    if (deleteAssetId) {
      const asset = works.assets.find(a => a.id === deleteAssetId);
      if (!confirm(`Delete ${asset.name}?`)) return;
      deleteAsset(works.id, deleteAssetId);
      render();
      showToast(`${asset.name} deleted.`);
      return;
    }
  });

  /* --- buttons that are always on the page --- */

  $('btn-add-works').addEventListener('click', () => {
    const name = prompt('Name of the new works:');
    if (!name || !name.trim()) return;
    const baseline = prompt('Baseline capacity in Ml/d:', '50');
    if (baseline === null) return;
    const created = createWorks(name.trim(), baseline);
    setCurrentWorks(created.id);
    buildWorksSelect();
    render();
    showToast(`${created.name} created. Add its stages and assets next.`);
  });

  $('btn-save-works').addEventListener('click', () => {
    const name = $('admin-name').value.trim();
    if (!name) { showToast('The works needs a name.'); return; }
    updateWorks(getCurrentWorks().id, { name: name, baseline: $('admin-baseline').value });
    buildWorksSelect();
    render();
    showToast('Works details saved.');
  });

  $('btn-add-stage').addEventListener('click', () => {
    const name = prompt('Name of the stage, e.g. "Rapid gravity filtration":');
    if (!name || !name.trim()) return;
    addStage(getCurrentWorks().id, name.trim());
    render();
    showToast('Stage added.');
  });

  $('btn-add-asset').addEventListener('click', () => openAssetEditor(null));
  $('asset-cancel').addEventListener('click', closeAssetEditor);
  $('asset-save').addEventListener('click', saveAssetFromEditor);

  $('asset-modal').addEventListener('click', (e) => {
    if (e.target === $('asset-modal')) closeAssetEditor();
  });

  document.querySelectorAll('input[name="asset-rule"]').forEach(radio => {
    radio.addEventListener('change', updateLimitRowVisibility);
  });

  /* --- backup --- */

  $('btn-export-config').addEventListener('click', () => {
    exportConfigJSON();
    showToast('Setup saved to a file.');
  });

  $('btn-import-config').addEventListener('click', () => $('import-file').click());

  $('import-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (!confirm('This replaces every works currently set up on this device.\n\n'
                 + 'Outage history is kept. Continue?')) { $('import-file').value = ''; return; }
      const outcome = importConfigJSON(reader.result);
      if (outcome.ok) { buildWorksSelect(); render(); }
      showToast(outcome.message);
      $('import-file').value = '';       // let the same file be picked again
    };
    reader.onerror = () => showToast('That file could not be read.');
    reader.readAsText(file);
  });
}
