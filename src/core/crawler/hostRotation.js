'use strict';

// P6 slice 2 — cross-turn host rotation fairness for multi-host frontier
// work. Without this, a host with a large hub-priority backlog wins the
// fair-pick (top priority -> volume) EVERY time and other hosts starve
// between restarts. The fix is deliberately soft state: an in-memory
// lastTouchedAt map (host -> ms epoch). Losing it on restart only costs one
// round of repeated choice — fairness here is a scheduling preference, not a
// correctness invariant, so persisting it would be scope without payoff.
//
// pickRotatedHosts: order candidates least-recently-touched first
// (never-touched hosts, timestamp 0, naturally lead), preserving the
// caller's original order as the tie-break — so among equally-fresh hosts
// the upstream fairness (priority, volume) still decides. Returns at most
// maxHosts hosts.
function pickRotatedHosts(candidates, lastTouched, maxHosts) {
  const list = (Array.isArray(candidates) ? candidates : [])
    .map((c, index) => ({
      host: typeof c === 'string' ? c : c.domain || c.host,
      index,
      touched: (lastTouched && lastTouched.get(typeof c === 'string' ? c : c.domain || c.host)) || 0
    }))
    .filter((c) => c.host);
  list.sort((a, b) => (a.touched - b.touched) || (a.index - b.index));
  const limit = Math.max(1, Number(maxHosts) || 1);
  return list.slice(0, limit).map((c) => c.host);
}

module.exports = { pickRotatedHosts };
