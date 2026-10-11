// A visit is performed once its technician submits an FSR. Branch approval is a separate measure.
export function serviceSummary(visits) {
  const summarize = rows => {
    const performed = rows.filter(v => Boolean(v.fsr)).length;
    return {
      total: rows.length,
      performed,
      remaining: rows.length - performed,
      acknowledged: rows.filter(v => v.status === 'acknowledged').length,
      awaitingReview: rows.filter(v => v.status === 'submitted').length,
      needsCorrection: rows.filter(v => v.status === 'unacknowledged').length
    };
  };
  return {
    amc: summarize(visits.filter(v => v.warranty === 'OOW')),
    warranty: summarize(visits.filter(v => v.warranty === 'Warranty')),
    total: summarize(visits)
  };
}
export function branchLocations(visits, assets) {
  const byId = new Map(assets.map(a => [a.id, a]));
  const grouped = new Map();
  for (const visit of visits) {
    const asset = byId.get(visit.assetId);
    const latitude = asset?.latitude, longitude = asset?.longitude;
    const hasLocation = typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
      && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
    if (!grouped.has(visit.branchCode)) grouped.set(visit.branchCode, {
      branchCode: visit.branchCode, name: visit.branchName, region: visit.region,
      latitude: hasLocation ? latitude : null, longitude: hasLocation ? longitude : null,
      locationSource: asset?.locationSource ?? 'Not provided', visits: []
    });
    const branch = grouped.get(visit.branchCode);
    if (branch.latitude === null && hasLocation) Object.assign(branch, {latitude, longitude, locationSource: asset.locationSource ?? 'Provided coordinates'});
    branch.visits.push(visit);
  }
  return [...grouped.values()].map(({visits: rows, ...branch}) => ({
    ...branch, ...serviceSummary(rows).total,
    state: rows.every(v => v.fsr) ? 'performed' : 'remaining',
    visitIds: rows.map(v => v.id),
    assetIds: rows.map(v => v.assetId)
  }));
}
