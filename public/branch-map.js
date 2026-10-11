const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let outlines, googlePromise;
function loadGoogle(key) {
  if (globalThis.google?.maps?.Map) return Promise.resolve(globalThis.google.maps);
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); reject(new Error('Google Maps took too long to load')); }, 12000);
    function cleanup() { clearTimeout(timer); delete globalThis.amcGoogleReady; }
    globalThis.amcGoogleReady = () => { cleanup(); resolve(globalThis.google.maps); };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({key, callback:'amcGoogleReady', loading:'async', v:'weekly', libraries:'marker'})}`;
    script.async = true;
    script.onerror = () => { cleanup(); script.remove(); reject(new Error('Google Maps could not load')); };
    document.head.append(script);
  }).catch(error => { googlePromise = undefined; throw error; });
  return googlePromise;
}
function branchLabel(branch) {
  return `${branch.name} · ${branch.branchCode} · ${branch.performed}/${branch.total} performed · ${branch.remaining} remaining`;
}
async function localMap(element, branches, onSelect) {
  const response = outlines ? null : await fetch('/branch-map.geojson');
  if (response && !response.ok) throw new Error('Unable to load the branch map');
  if (!outlines) outlines = await response.json();
  if (!element.isConnected) return;
  const plotted = branches.filter(b => b.latitude !== null && b.longitude !== null);
  const longitudes = plotted.map(b => b.longitude), latitudes = plotted.map(b => b.latitude);
  const west = Math.min(60, ...longitudes) - 1, east = Math.max(78, ...longitudes) + 1;
  const south = Math.min(23, ...latitudes) - 1, north = Math.max(38, ...latitudes) + 1;
  const project = ([lng, lat]) => [30 + (lng - west) / (east - west) * 580, 30 + (north - lat) / (north - south) * 440];
  function polygonPath(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(p => p.map(ring => ring.map((point, i) => `${i ? 'L' : 'M'}${project(point).map(n => n.toFixed(2)).join(',')}`).join(' ') + ' Z').join(' ')).join(' ');
  }
  const pinPositions=[];
  function pinPosition(point) {
    const original=project(point);let position=original;
    for(let attempt=0;attempt<80&&pinPositions.some(p=>Math.hypot(p[0]-position[0],p[1]-position[1])<27);attempt++) {
      const angle=attempt*2.399963,radius=25+Math.floor(attempt/6)*15;
      position=[Math.max(20,Math.min(620,original[0]+Math.cos(angle)*radius)),Math.max(50,Math.min(450,original[1]+Math.sin(angle)*radius))];
    }
    pinPositions.push(position);return {original,position};
  }
  element.innerHTML = `<svg class="local-branch-map" viewBox="0 0 640 500" role="group" aria-label="Assigned branch locations on a geographic map">
    <defs><pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dce8e9" stroke-width="0.7"/></pattern></defs>
    <rect width="640" height="500" fill="#eaf2f2"/><rect width="640" height="500" fill="url(#map-grid)"/>
    ${outlines.features.map(f => `<path d="${polygonPath(f.geometry)}" class="country ${f.properties.code === 'PAK' ? 'pakistan' : ''}"/>`).join('')}
    <text x="268" y="262" class="map-country-label">PAKISTAN</text><text x="87" y="184" class="map-neighbor-label">AFGHANISTAN</text><text x="69" y="360" class="map-neighbor-label">IRAN</text><text x="462" y="373" class="map-neighbor-label">INDIA</text><text x="100" y="468" class="map-sea-label">ARABIAN SEA</text>
    ${plotted.map((b, i) => {
      const {original:[ox,oy],position:[x,y]}=pinPosition([b.longitude,b.latitude]);
      return `<path d="M${ox.toFixed(2)},${oy.toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)}" stroke="#95afa4" stroke-width="1"/><g class="branch-pin ${b.state}" data-map-branch="${escape(b.branchCode)}" transform="translate(${x.toFixed(2)},${y.toFixed(2)})" role="button" tabindex="0" aria-label="${escape(branchLabel(b))}"><title>${escape(branchLabel(b))}</title><circle r="17" class="pin-halo"/><path d="M0 0 C-2 -6 -11 -11 -11 -20 A11 11 0 1 1 11 -20 C11 -11 2 -6 0 0Z" class="pin-body"/><circle cy="-20" r="7" fill="white"/><text y="-17" text-anchor="middle" class="pin-number">${i+1}</text></g>`;
    }).join('')}
    </svg>`;
  for (const pin of element.querySelectorAll('[data-map-branch]')) {
    const select = () => onSelect(branches.find(b => b.branchCode === pin.dataset.mapBranch));
    pin.addEventListener('click', select);
    pin.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); select(); } });
  }
}
export async function renderBranchMap(element, branches, configuration, onSelect, onMode) {
  if (!branches.some(b => b.latitude !== null && b.longitude !== null)) {
    element.innerHTML = '<div class="map-empty">No branch coordinates are available for this selection. Branches without coordinates remain in the overview totals.</div>';
    onMode('No locations available'); return;
  }
  if (configuration.googleMapsKey) {
    try {
      const maps = await loadGoogle(configuration.googleMapsKey);
      if (!element.isConnected) return;
      const {AdvancedMarkerElement, PinElement} = await maps.importLibrary('marker');
      globalThis.gm_authFailure=()=>{if(element.isConnected)localMap(element,branches,onSelect).then(()=>onMode('Google Maps authorization failed · local map shown')).catch(()=>onMode('Map unavailable'));};
      const map = new maps.Map(element, {center:{lat:30.3,lng:69.3}, zoom:5, mapId:configuration.mapId || 'DEMO_MAP_ID', streetViewControl:false, mapTypeControl:false});
      const bounds = new maps.LatLngBounds();
      const plotted = branches.filter(b => b.latitude !== null && b.longitude !== null);
      for (const [i,b] of plotted.entries()) {
        const position = {lat:b.latitude,lng:b.longitude};bounds.extend(position);
        const pin = new PinElement({background:b.state === 'performed'?'#16886c':'#e9a12b',borderColor:'white',glyphText:String(i+1),glyphColor:'white'});
        const marker = new AdvancedMarkerElement({map,position,title:branchLabel(b)});
        marker.append(pin);
        marker.addListener('click', () => onSelect(b));
      }
      if (plotted.length > 1) map.fitBounds(bounds, 55); else map.setCenter(bounds.getCenter());
      onMode('Google Maps'); return;
    } catch {
      if (!element.isConnected) return;
      await localMap(element, branches, onSelect);
      onMode('Google Maps unavailable · local map shown'); return;
    }
  }
  await localMap(element, branches, onSelect);
  onMode('Local map · Google Maps not connected');
}
