/* ============================================================================
   SEED DATA - THE PLANT MODEL
   ============================================================================

   This is the asset register. Edit it to describe your own works.
   (After editing, use "Reset to sample data" in the app to load the changes.)

   A WORKS has:
     id                            short code, no spaces
     name                          shown on screen
     baseline_capacity_ML_per_day  full output when everything is in service
     stages                        the treatment steps, in flow order
     assets                        the kit, each one sitting in a stage

   An ASSET has:
     id                     short code, no spaces, unique
     name                   shown on screen, e.g. "RGF 3"
     type                   asset type, e.g. "Rapid gravity filter"
     stage_id               which stage it sits in (must match a stage id)
     capacity_ML_per_day    what it is rated at
     is_standby             true if it is a spare rather than a duty unit
                            (this is for the operator's information - the
                            capacity maths works it out from the stage totals)
     outage_rule            "share_of_stage" | "limit_works" | "stop_works"
                            see rules.js for what each one does
     limit_ML_per_day       only needed when outage_rule is "limit_works"
     status                 "in_service" | "out_of_service"
   ============================================================================ */

const SEED_WORKS = [

  /* ==========================================================================
     EXAMPLE WTW - the demo works from the brief.
     Baseline 100 Ml/d. Shows all three outage rules in action.
     ========================================================================== */
  {
    id: 'example-wtw',
    name: 'Example WTW',
    baseline_capacity_ML_per_day: 100,

    stages: [
      { id: 'raw',      name: 'Raw water pumping' },
      { id: 'coag',     name: 'Coagulant dosing' },
      { id: 'clarify',  name: 'Clarification' },
      { id: 'rgf',      name: 'Rapid gravity filtration' },
      { id: 'gac',      name: 'GAC filtration' },
      { id: 'uv',       name: 'UV disinfection' },
      { id: 'chlorine', name: 'Final disinfection' },
      { id: 'final',    name: 'Final water pumping' }
    ],

    assets: [

      /* --- Raw water pumping: 1 duty + 1 standby, each covers the works ---
         Taking either one out leaves 100 Ml/d in the stage, so there is no
         impact on capacity. This is how standby cover is modelled. */
      { id: 'rwp-1', name: 'Raw water pump 1', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 100, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'rwp-2', name: 'Raw water pump 2 (standby)', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 100, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' },

      /* --- Coagulant dosing: a single critical plant ---------------------
         No coagulation means no clarification and no filtration, so this is
         set to stop production. Change outage_rule to "limit_works" with a
         limit_ML_per_day if your works can run reduced without it. */
      { id: 'coag-1', name: 'Coagulant dosing plant', type: 'Chemical dosing',
        stage_id: 'coag', capacity_ML_per_day: 100, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' },

      /* --- Clarification: 2 identical streams, 50 Ml/d each ---------------
         Take one out and the works halves to 50 Ml/d. */
      { id: 'daf-1', name: 'Clarifier 1', type: 'Clarifier',
        stage_id: 'clarify', capacity_ML_per_day: 50, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'daf-2', name: 'Clarifier 2', type: 'Clarifier',
        stage_id: 'clarify', capacity_ML_per_day: 50, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      /* --- RGFs: 5 identical filters, 20 Ml/d each ------------------------
         THE MAIN TEST CASE FROM THE BRIEF.
         One filter out -> 80 Ml/d. Two out -> 60 Ml/d. */
      { id: 'rgf-1', name: 'RGF 1', type: 'Rapid gravity filter',
        stage_id: 'rgf', capacity_ML_per_day: 20, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'rgf-2', name: 'RGF 2', type: 'Rapid gravity filter',
        stage_id: 'rgf', capacity_ML_per_day: 20, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'rgf-3', name: 'RGF 3', type: 'Rapid gravity filter',
        stage_id: 'rgf', capacity_ML_per_day: 20, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'rgf-4', name: 'RGF 4', type: 'Rapid gravity filter',
        stage_id: 'rgf', capacity_ML_per_day: 20, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'rgf-5', name: 'RGF 5', type: 'Rapid gravity filter',
        stage_id: 'rgf', capacity_ML_per_day: 20, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      /* --- GAC: 3 vessels at 50 Ml/d = 150 Ml/d, so 1 spare vessel --------
         One vessel out still leaves 100 Ml/d -> no impact.
         Two vessels out leaves 50 Ml/d -> works halves. */
      { id: 'gac-1', name: 'GAC vessel 1', type: 'GAC filter',
        stage_id: 'gac', capacity_ML_per_day: 50, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'gac-2', name: 'GAC vessel 2', type: 'GAC filter',
        stage_id: 'gac', capacity_ML_per_day: 50, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'gac-3', name: 'GAC vessel 3 (standby)', type: 'GAC filter',
        stage_id: 'gac', capacity_ML_per_day: 50, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' },

      /* --- UV: single unit, partial loss ----------------------------------
         THE SECOND TEST CASE FROM THE BRIEF.
         Out of service the works must be held at 96 Ml/d. Change
         limit_ML_per_day to suit, or switch to "stop_works" if your UV is
         absolutely critical. */
      { id: 'uv-1', name: 'UV disinfection unit', type: 'UV disinfection',
        stage_id: 'uv', capacity_ML_per_day: 100, is_standby: false,
        outage_rule: 'limit_works', limit_ML_per_day: 96, status: 'in_service' },

      /* --- Final disinfection: single critical plant ---------------------- */
      { id: 'cl-1', name: 'Chlorine dosing plant', type: 'Chemical dosing',
        stage_id: 'chlorine', capacity_ML_per_day: 100, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' },

      /* --- Final pumping: 1 duty + 1 standby ------------------------------ */
      { id: 'fwp-1', name: 'Final water pump 1', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 100, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'fwp-2', name: 'Final water pump 2 (standby)', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 100, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' }
    ]
  },

  /* ==========================================================================
     RIVERSIDE WTW - a second, smaller works to show multi-site working.
     Baseline 40 Ml/d, membrane plant.
     ========================================================================== */
  {
    id: 'riverside-wtw',
    name: 'Riverside WTW',
    baseline_capacity_ML_per_day: 40,

    stages: [
      { id: 'raw',      name: 'Raw water pumping' },
      { id: 'membrane', name: 'Membrane filtration' },
      { id: 'chlorine', name: 'Final disinfection' },
      { id: 'final',    name: 'Final water pumping' }
    ],

    assets: [
      { id: 'r-rwp-1', name: 'Raw water pump 1', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 40, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-rwp-2', name: 'Raw water pump 2 (standby)', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 40, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-mem-1', name: 'Membrane rack A', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 10, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-mem-2', name: 'Membrane rack B', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 10, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-mem-3', name: 'Membrane rack C', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 10, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-mem-4', name: 'Membrane rack D', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 10, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-cl-1', name: 'Chlorine dosing plant', type: 'Chemical dosing',
        stage_id: 'chlorine', capacity_ML_per_day: 40, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' },

      { id: 'r-fwp-1', name: 'Final water pump 1', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 40, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'r-fwp-2', name: 'Final water pump 2 (standby)', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 40, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' }
    ]
  },

  /* ==========================================================================
     HILLTOP WTW - a small borehole works. Groundwater, so no clarification.
     ========================================================================== */
  {
    id: 'hilltop-wtw',
    name: 'Hilltop WTW',
    baseline_capacity_ML_per_day: 15,

    stages: [
      { id: 'boreholes', name: 'Boreholes' },
      { id: 'gac',       name: 'GAC filtration' },
      { id: 'chlorine',  name: 'Final disinfection' }
    ],

    assets: [
      { id: 'h-bh-1', name: 'Borehole 1', type: 'Borehole pump',
        stage_id: 'boreholes', capacity_ML_per_day: 5, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'h-bh-2', name: 'Borehole 2', type: 'Borehole pump',
        stage_id: 'boreholes', capacity_ML_per_day: 5, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'h-bh-3', name: 'Borehole 3', type: 'Borehole pump',
        stage_id: 'boreholes', capacity_ML_per_day: 5, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'h-gac-1', name: 'GAC vessel 1', type: 'GAC filter',
        stage_id: 'gac', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'h-cl-1', name: 'Chlorine dosing plant', type: 'Chemical dosing',
        stage_id: 'chlorine', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' }
    ]
  },

  /* ==========================================================================
     MOORLAND WTW - upland surface water, slow sand filters.
     ========================================================================== */
  {
    id: 'moorland-wtw',
    name: 'Moorland WTW',
    baseline_capacity_ML_per_day: 60,

    stages: [
      { id: 'raw',      name: 'Raw water pumping' },
      { id: 'coag',     name: 'Coagulant dosing' },
      { id: 'ssf',      name: 'Slow sand filtration' },
      { id: 'uv',       name: 'UV disinfection' },
      { id: 'chlorine', name: 'Final disinfection' }
    ],

    assets: [
      { id: 'm-rwp-1', name: 'Raw water pump 1', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 60, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-rwp-2', name: 'Raw water pump 2 (standby)', type: 'Raw water pump',
        stage_id: 'raw', capacity_ML_per_day: 60, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-coag-1', name: 'Coagulant dosing plant', type: 'Chemical dosing',
        stage_id: 'coag', capacity_ML_per_day: 60, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' },

      { id: 'm-ssf-1', name: 'Slow sand filter 1', type: 'Slow sand filter',
        stage_id: 'ssf', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-ssf-2', name: 'Slow sand filter 2', type: 'Slow sand filter',
        stage_id: 'ssf', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-ssf-3', name: 'Slow sand filter 3', type: 'Slow sand filter',
        stage_id: 'ssf', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-ssf-4', name: 'Slow sand filter 4', type: 'Slow sand filter',
        stage_id: 'ssf', capacity_ML_per_day: 15, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'm-uv-1', name: 'UV disinfection unit', type: 'UV disinfection',
        stage_id: 'uv', capacity_ML_per_day: 60, is_standby: false,
        outage_rule: 'limit_works', limit_ML_per_day: 45, status: 'in_service' },

      { id: 'm-cl-1', name: 'Chlorine dosing plant', type: 'Chemical dosing',
        stage_id: 'chlorine', capacity_ML_per_day: 60, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' }
    ]
  },

  /* ==========================================================================
     ESTUARY WTW - membrane plant on a tidal river.
     ========================================================================== */
  {
    id: 'estuary-wtw',
    name: 'Estuary WTW',
    baseline_capacity_ML_per_day: 25,

    stages: [
      { id: 'intake',   name: 'Raw water intake' },
      { id: 'membrane', name: 'Membrane filtration' },
      { id: 'chlorine', name: 'Final disinfection' },
      { id: 'final',    name: 'Final water pumping' }
    ],

    assets: [
      { id: 'e-in-1', name: 'Intake screen and pump 1', type: 'Raw water pump',
        stage_id: 'intake', capacity_ML_per_day: 25, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'e-in-2', name: 'Intake screen and pump 2 (standby)', type: 'Raw water pump',
        stage_id: 'intake', capacity_ML_per_day: 25, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'e-mem-1', name: 'Membrane rack A', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 12.5, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'e-mem-2', name: 'Membrane rack B', type: 'Membrane filtration',
        stage_id: 'membrane', capacity_ML_per_day: 12.5, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'e-cl-1', name: 'Chlorine dosing plant', type: 'Chemical dosing',
        stage_id: 'chlorine', capacity_ML_per_day: 25, is_standby: false,
        outage_rule: 'stop_works', status: 'in_service' },

      { id: 'e-fwp-1', name: 'Final water pump 1', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 25, is_standby: false,
        outage_rule: 'share_of_stage', status: 'in_service' },

      { id: 'e-fwp-2', name: 'Final water pump 2 (standby)', type: 'Final water pump',
        stage_id: 'final', capacity_ML_per_day: 25, is_standby: true,
        outage_rule: 'share_of_stage', status: 'in_service' }
    ]
  }
];


/* The asset types offered in the Setup screen when adding an asset.
   Anything can be typed in, this list is just to save keystrokes. */
const ASSET_TYPES = [
  'Rapid gravity filter',
  'Slow sand filter',
  'GAC filter',
  'Membrane filtration',
  'Clarifier',
  'Chemical dosing',
  'UV disinfection',
  'Raw water pump',
  'Borehole pump',
  'Final water pump',
  'Contact tank',
  'Other'
];


/* The quick-pick reasons offered when logging an outage.
   Add or change these to match your own maintenance categories. */
const OUTAGE_REASONS = [
  { label: 'Planned maintenance', planned: true },
  { label: 'Filter refurbishment', planned: true },
  { label: 'Statutory inspection', planned: true },
  { label: 'Cleaning / media change', planned: true },
  { label: 'Breakdown', planned: false },
  { label: 'Water quality issue', planned: false },
  { label: 'Power / control fault', planned: false },
  { label: 'Other', planned: false }
];
