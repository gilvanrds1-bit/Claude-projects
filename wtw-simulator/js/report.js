/* ============================================================================
   REGIONAL REPORTING
   ============================================================================

   Rolls every works up into one regional picture. Two separate questions are
   answered here, and it is worth keeping them apart in your head:

     1. WHERE ARE WE NOW?    calculateRegion()
        Add up what every works can produce at this moment.

     2. WHAT HAS IT COST US? summariseHistory()
        Look back over the outage log and work out how much production has
        actually been lost, and to what.

   Like rules.js, this file is only maths - it draws nothing.
   ============================================================================ */


/* ---------------------------------------------------------------------------
   1. WHERE ARE WE NOW
   ---------------------------------------------------------------------------
   Regional capacity is simply the total of every works' current capacity.
   Unlike a single works, there is no bottleneck to find - the sites are
   independent of each other, so their outputs add up.

   Returns:
     total        Ml/d the region can produce right now
     baseline     Ml/d the region can produce with everything in service
     lost         the difference
     percent      total as a percentage of baseline
     sites        one row per works, worst affected first
     counts       how many works are at full / reduced / stopped
     assets_out   how many assets are out of service across the region
--------------------------------------------------------------------------- */
function calculateRegion() {
  const sites = getWorks().map(works => {
    const result = calculateCapacity(works);          // the same engine, per site
    const assetsOut = works.assets.filter(a => a.status === 'out_of_service');

    return {
      id: works.id,
      name: works.name,
      capacity: result.capacity,
      baseline: result.baseline,
      lost: result.lost,
      percent: result.percent,
      reason: result.reason,
      assets_out: assetsOut.length,
      asset_names: assetsOut.map(a => a.name),
      status: result.capacity === 0        ? 'stopped'
            : result.capacity < result.baseline ? 'reduced'
            :                                'full'
    };
  });

  const total    = round1(sites.reduce((sum, s) => sum + s.capacity, 0));
  const baseline = round1(sites.reduce((sum, s) => sum + s.baseline, 0));

  // Show the sites in trouble first - that is what a regional manager wants.
  sites.sort((a, b) => b.lost - a.lost || b.baseline - a.baseline);

  return {
    total,
    baseline,
    lost: round1(baseline - total),
    percent: baseline > 0 ? Math.round((total / baseline) * 100) : 0,
    sites,
    counts: {
      full:    sites.filter(s => s.status === 'full').length,
      reduced: sites.filter(s => s.status === 'reduced').length,
      stopped: sites.filter(s => s.status === 'stopped').length,
      total:   sites.length
    },
    assets_out: sites.reduce((sum, s) => sum + s.assets_out, 0)
  };
}


/* ---------------------------------------------------------------------------
   2. WHAT HAS IT COST US
   ---------------------------------------------------------------------------
   The headline figure is LOST VOLUME, in megalitres:

       lost volume (Ml) = capacity lost (Ml/d)  x  how long it was out (days)

   An outage of 20 Ml/d lasting half a day cost 10 Ml of production capacity.
   This matters more than a count of outages, because it weights a long outage
   on a big works above a brief one on a small works.

   Outages that are still ongoing are counted up to right now.

   Pass a number of days to look back over, or nothing for all time.
--------------------------------------------------------------------------- */
function summariseHistory(days) {
  const cutoff = days ? Date.now() - (days * 86400000) : null;

  const events = getAllOutages().filter(o =>
    cutoff === null || new Date(o.start_time).getTime() >= cutoff);

  // Work out the cost of each outage first.
  const costed = events.map(o => {
    const start = new Date(o.start_time).getTime();
    const end = o.end_time ? new Date(o.end_time).getTime() : Date.now();
    // Guard against a start time typed in the future.
    const durationDays = Math.max(0, (end - start) / 86400000);
    return {
      ...o,
      duration_hours: round1(durationDays * 24),
      lost_volume_ML: round1(o.capacity_impact * durationDays),
      ongoing: o.end_time === null
    };
  });

  // Group by whichever field you ask for (works, reason, planned/unplanned).
  const groupBy = (keyFor) => {
    const groups = {};
    costed.forEach(o => {
      const key = keyFor(o);
      if (!groups[key]) groups[key] = { key, count: 0, hours: 0, lost_volume_ML: 0 };
      groups[key].count++;
      groups[key].hours = round1(groups[key].hours + o.duration_hours);
      groups[key].lost_volume_ML = round1(groups[key].lost_volume_ML + o.lost_volume_ML);
    });
    // Biggest loss first.
    return Object.values(groups).sort((a, b) => b.lost_volume_ML - a.lost_volume_ML);
  };

  const planned   = costed.filter(o => o.planned);
  const unplanned = costed.filter(o => !o.planned);
  const totalLost = round1(costed.reduce((sum, o) => sum + o.lost_volume_ML, 0));
  const plannedLost = round1(planned.reduce((sum, o) => sum + o.lost_volume_ML, 0));

  return {
    days: days || null,
    count: costed.length,
    ongoing: costed.filter(o => o.ongoing).length,
    total_lost_volume_ML: totalLost,
    total_hours: round1(costed.reduce((sum, o) => sum + o.duration_hours, 0)),

    planned_count: planned.length,
    unplanned_count: unplanned.length,
    planned_lost_ML: plannedLost,
    unplanned_lost_ML: round1(totalLost - plannedLost),
    // What share of lost production was unavoidable? Useful for maintenance
    // planning: a high unplanned share points at reliability problems.
    unplanned_share: totalLost > 0
      ? Math.round(((totalLost - plannedLost) / totalLost) * 100)
      : 0,

    by_works:  groupBy(o => o.works_name),
    by_reason: groupBy(o => o.reason),
    by_type:   groupBy(o => o.asset_type),

    // The individual events that cost the most, for the "worst offenders" list.
    worst: costed.slice().sort((a, b) => b.lost_volume_ML - a.lost_volume_ML).slice(0, 5)
  };
}


/* ---------------------------------------------------------------------------
   Regional summary as CSV, for pasting into a report.
   Two blocks in one file: current position, then the historical roll-up.
--------------------------------------------------------------------------- */
function exportRegionalSummaryCSV(days) {
  const region = calculateRegion();
  const history = summariseHistory(days);
  const rows = [];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const line = (...cells) => rows.push(cells.map(q).join(','));

  line('Regional capacity summary');
  line('Generated', formatDateTime(new Date().toISOString()));
  line('Period', days ? `Last ${days} days` : 'All time');
  line('');

  line('CURRENT POSITION');
  line('Regional capacity now (Ml/d)', region.total);
  line('Regional baseline (Ml/d)', region.baseline);
  line('Capacity lost (Ml/d)', region.lost);
  line('Percent of baseline', region.percent + '%');
  line('Works at full capacity', region.counts.full);
  line('Works reduced', region.counts.reduced);
  line('Works stopped', region.counts.stopped);
  line('Assets out of service', region.assets_out);
  line('');

  line('BY WORKS');
  line('Works', 'Baseline (Ml/d)', 'Current (Ml/d)', 'Lost (Ml/d)',
       'Percent of baseline', 'Assets out', 'Status', 'Reason');
  region.sites.forEach(s => line(s.name, s.baseline, s.capacity, s.lost,
       s.percent + '%', s.assets_out, s.status, s.reason));
  line('');

  line('PRODUCTION LOST' + (days ? ` (LAST ${days} DAYS)` : ' (ALL TIME)'));
  line('Total lost volume (Ml)', history.total_lost_volume_ML);
  line('Outages recorded', history.count);
  line('Still ongoing', history.ongoing);
  line('Total outage hours', history.total_hours);
  line('Planned outages', history.planned_count, 'lost (Ml)', history.planned_lost_ML);
  line('Unplanned outages', history.unplanned_count, 'lost (Ml)', history.unplanned_lost_ML);
  line('Unplanned share of lost production', history.unplanned_share + '%');
  line('');

  line('LOST PRODUCTION BY WORKS');
  line('Works', 'Outages', 'Hours out', 'Lost volume (Ml)');
  history.by_works.forEach(g => line(g.key, g.count, g.hours, g.lost_volume_ML));
  line('');

  line('LOST PRODUCTION BY REASON');
  line('Reason', 'Outages', 'Hours out', 'Lost volume (Ml)');
  history.by_reason.forEach(g => line(g.key, g.count, g.hours, g.lost_volume_ML));

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  downloadFile(rows.join('\r\n'),
    `regional-summary-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`,
    'text/csv;charset=utf-8;');
}
