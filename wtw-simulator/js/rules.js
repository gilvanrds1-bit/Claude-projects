/* ============================================================================
   CAPACITY RULES ENGINE
   ============================================================================

   THIS IS THE FILE TO EDIT IF YOU WANT TO CHANGE HOW CAPACITY IS CALCULATED.
   You do not need to touch any other file to change the rules.

   ---------------------------------------------------------------------------
   HOW THE WORKS IS MODELLED
   ---------------------------------------------------------------------------

   Water flows through the works in stages, one after another:

       Raw water pumping -> Coagulation -> Clarification -> RGF -> GAC
                                    -> UV -> Chlorination -> Final pumping

   Water can only get through the works as fast as the SLOWEST stage allows.
   That is the whole idea behind the calculation:

       Works capacity = the capacity of the tightest stage
                        (and never more than the works' baseline capacity)

   Each stage contains one or more assets. A stage's capacity is simply the
   total of the assets in that stage that are currently IN SERVICE.

   Worked example - the filter stage has 5 rapid gravity filters, each 20 Ml/d:

       All 5 in service  -> stage capacity 100 Ml/d  -> works runs at 100
       1 filter out      -> stage capacity  80 Ml/d  -> works drops to  80
       2 filters out     -> stage capacity  60 Ml/d  -> works drops to  60

   Redundancy / standby assets need NO special handling - they fall out of the
   maths for free. If a stage has 2 pumps rated 100 Ml/d each (1 duty, 1
   standby) the stage totals 200 Ml/d. Take one pump out and the stage is still
   100 Ml/d, which is above the works baseline, so capacity does not move.

   ---------------------------------------------------------------------------
   WHAT HAPPENS WHEN AN ASSET GOES OUT OF SERVICE
   ---------------------------------------------------------------------------

   Every asset carries an "outage rule" that says what its loss does. There are
   three rules, and each asset is set to one of them (see data.js). This is
   configurable per asset - nothing is hardcoded to a particular asset type.

     1. "share_of_stage"  - THE NORMAL CASE.
        The asset's capacity is simply removed from its stage. Use this for
        anything that runs in parallel with others: filters, clarifiers,
        pumps, GAC vessels, dosing streams.

     2. "limit_works"     - THE PARTIAL LOSS CASE.
        The asset going out does not change its stage, but it puts a ceiling
        on the whole works. Set "limit_ML_per_day" to the flow the works may
        run at while that asset is out.
        Example: UV out of service -> works must be held at 96 Ml/d.

     3. "stop_works"      - THE CRITICAL CASE.
        No safe production without it. Works capacity goes to zero.
        Example: no chlorine dosing means no potable water can be made.

   If several assets are out at once, all of their rules are applied together:
   the stage totals are worked out, then every "limit" is applied, and if any
   "stop" asset is out the works reads zero.

   ---------------------------------------------------------------------------
   TO CHANGE THE RULES
   ---------------------------------------------------------------------------
   - To change what one asset does when it fails: edit that asset in data.js
     (change its outage_rule, or its limit_ML_per_day).
   - To change the maths itself: edit calculateCapacity() below.
   - To add a brand new kind of rule: add it to OUTAGE_RULES below, then handle
     it inside calculateCapacity(). Both places are commented.
   ============================================================================ */


/* The three outage rules and how each one is labelled on screen.
   Add an entry here if you invent a new rule, then handle it in
   calculateCapacity() below. The badge is what the operator sees on the
   asset card; "share_of_stage" has no badge because it is the normal case
   and the card already shows the asset's Ml/d rating.                     */
const OUTAGE_RULES = {

  share_of_stage: {
    label: 'Shares the load with the rest of its stage',
    badge: null,
    badgeClass: null
  },

  limit_works: {
    label: 'Puts a ceiling on the whole works while it is out',
    badge: (asset) => `Limits to ${fmt(asset.limit_ML_per_day)} Ml/d`,
    badgeClass: 'tag-limit'
  },

  stop_works: {
    label: 'Stops production completely while it is out',
    badge: () => 'Critical',
    badgeClass: 'tag-critical'
  }
};


/* ----------------------------------------------------------------------------
   THE CALCULATION
   ----------------------------------------------------------------------------
   Give it a works (with its assets) and it returns everything the dashboard
   needs to draw itself, including WHY the capacity is what it is.

   Returns:
   {
     capacity          the answer, in Ml/d
     baseline          the works' full capacity, in Ml/d
     lost              baseline - capacity
     percent           capacity as a percentage of baseline
     stopped_by        assets forcing production to zero (usually empty)
     limited_by        assets applying a works-wide ceiling
     stages            every stage with its capacity, for the breakdown panel
     bottleneck        the stage that is holding the works back (or null)
     reason            one plain sentence explaining the number
   }
---------------------------------------------------------------------------- */
function calculateCapacity(works) {
  const baseline = works.baseline_capacity_ML_per_day;
  const assets = works.assets;

  const stopped_by = [];   // assets out of service with rule "stop_works"
  const limited_by = [];   // assets out of service with rule "limit_works"

  /* --- Step 1: total up each stage from the assets that are in service ---- */
  const stageTotals = {};  // stage id -> capacity in Ml/d

  works.stages.forEach(stage => { stageTotals[stage.id] = 0; });

  assets.forEach(asset => {
    const inService = asset.status === 'in_service';

    if (inService) {
      // In service, so it contributes its full capacity to its stage.
      stageTotals[asset.stage_id] += asset.capacity_ML_per_day;
      return;
    }

    // From here down the asset is OUT of service. Apply its rule.
    switch (asset.outage_rule) {

      case 'share_of_stage':
        // Contributes nothing - its capacity is simply missing from the stage.
        break;

      case 'limit_works':
        // The stage is unaffected (still count the asset), but the works gets
        // a ceiling. Counting it keeps the stage maths honest: a UV unit being
        // derated should not also read as a total loss of the UV stage.
        stageTotals[asset.stage_id] += asset.capacity_ML_per_day;
        limited_by.push(asset);
        break;

      case 'stop_works':
        // Stage unaffected; the works is stopped further down.
        stageTotals[asset.stage_id] += asset.capacity_ML_per_day;
        stopped_by.push(asset);
        break;

      // ADD A NEW RULE HERE if you added one to OUTAGE_RULES above.
    }
  });

  /* --- Step 2: build the stage list, tightest first for the breakdown ----- */
  const stages = works.stages.map(stage => {
    const stageAssets = assets.filter(a => a.stage_id === stage.id);
    return {
      id: stage.id,
      name: stage.name,
      capacity: stageTotals[stage.id],
      // How much this stage could do with everything in service:
      design: stageAssets.reduce((sum, a) => sum + a.capacity_ML_per_day, 0),
      total_units: stageAssets.length,
      units_out: stageAssets.filter(a => a.status === 'out_of_service').length,
      // A stage only holds the works back once it drops below the baseline.
      is_constraining: stageTotals[stage.id] < baseline
    };
  });

  /* --- Step 3: the works can only run as fast as its tightest stage ------- */
  let capacity = baseline;
  let bottleneck = null;

  stages.forEach(stage => {
    if (stage.capacity < capacity) {
      capacity = stage.capacity;
      bottleneck = stage;
    }
  });

  /* --- Step 4: apply any works-wide ceilings from "limit_works" assets ---- */
  limited_by.forEach(asset => {
    if (asset.limit_ML_per_day < capacity) {
      capacity = asset.limit_ML_per_day;
      bottleneck = null;   // a limit rule beats the stage maths
    }
  });

  /* --- Step 5: any critical asset out means no production at all ---------- */
  if (stopped_by.length > 0) {
    capacity = 0;
    bottleneck = null;
  }

  capacity = Math.max(0, round1(capacity));

  /* --- Step 6: put the reason into one plain sentence --------------------- */
  let reason;
  if (stopped_by.length > 0) {
    reason = `Production stopped - ${listNames(stopped_by)} out of service.`;
  } else if (capacity >= baseline) {
    reason = 'All stages have enough capacity. Works at full output.';
  } else if (bottleneck) {
    // Stage names are left as written so acronyms like GAC and RGF read properly.
    reason = `Limited by ${bottleneck.name} `
           + `(${bottleneck.units_out} of ${bottleneck.total_units} out of service).`;
  } else {
    const binding = limited_by
      .filter(a => a.limit_ML_per_day <= capacity)
      .map(a => a.name);
    reason = `Held at ${fmt(capacity)} Ml/d with ${binding.join(', ')} out of service.`;
  }

  return {
    capacity,
    baseline,
    lost: round1(baseline - capacity),
    percent: baseline > 0 ? Math.round((capacity / baseline) * 100) : 0,
    stopped_by,
    limited_by,
    stages,
    bottleneck,
    reason
  };
}


/* --- Small helpers used above ---------------------------------------------- */

// 84 -> "84",  83.5 -> "83.5"   (keeps numbers readable on the dashboard)
function fmt(n) {
  if (n === null || n === undefined) return '-';
  return Number(round1(n)).toString();
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function listNames(assets) {
  return assets.map(a => a.name).join(', ');
}
