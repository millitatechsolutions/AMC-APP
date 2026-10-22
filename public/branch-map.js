const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageryUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const labelsUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
let outlines, googlePromise, leafletPromise, activeState, lastView, selectedBranch;

function coordinates(branch) {
  return Number.isFinite(branch.latitude) && Number.isFinite(branch.longitude) && Math.abs(branch.latitude) <= 90 && Math.abs(branch.longitude) <= 180;
}
const branchId = branch => branch.id ?? branch.branchCode;
function branchLabel(branch) {
  return `${branch.client ? branch.client+' · ' : ''}${branch.name} · ${branch.branchCode} · ${branch.performed}/${branch.total} performed · ${branch.remaining} remaining`;
}
function groupsFor(branches) {
  const groups = new Map();
  branches.forEach((branch, index) => {
    const key = `${branch.latitude},${branch.longitude}`;
    if (!groups.has(key)) groups.set(key, {latitude:branch.latitude, longitude:branch.longitude, entries:[]});
    groups.get(key).entries.push({branch, index:index + 1});
  });
  return [...groups.values()];
}
function groupState(group) {
  return group.entries.every(({branch}) => branch.state === 'performed') ? 'performed' : 'remaining';
}
function groupLabel(group) {
  return group.entries.map(({branch}) => branchLabel(branch)).join('; ');
}
function popupContent(group, select) {
  const popup = document.createElement('div');
  popup.className = 'map-popup';
  if (group.entries.length > 1) {
    const heading = document.createElement('strong');
    heading.className = 'map-popup-title';
    heading.textContent = `${group.entries.length} branches share this location`;
    popup.append(heading);
  }
  for (const {branch} of group.entries) {
    const title = document.createElement('strong');
    title.className = 'map-popup-title';
    title.textContent = `${branch.client ? branch.client+' · ' : ''}${branch.name} · ${branch.branchCode}`;
    const summary = document.createElement('p');
    summary.className = 'map-popup-summary';
    summary.textContent = `${branch.total} total · ${branch.performed} performed · ${branch.remaining} remaining`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-popup-action';
    button.textContent = 'Select this branch';
    button.addEventListener('click', () => select(branch));
    popup.append(title, summary, button);
  }
  const source = document.createElement('small');
  source.className = 'map-popup-demo';
  const demo = group.entries.some(({branch}) => /demo/i.test(branch.locationSource || ''));
  source.textContent = demo ? 'Demo city coordinates · replace with verified branch GPS locations.' : 'Branch coordinates supplied in the asset record.';
  popup.append(source);
  return popup;
}
function loadGoogle(key) {
  if (globalThis.google?.maps?.Map) return Promise.resolve(globalThis.google.maps);
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { cleanup(); script.remove(); reject(new Error('Google Maps took too long to load')); }, 12000);
    function cleanup() { clearTimeout(timer); delete globalThis.amcGoogleReady; }
    globalThis.amcGoogleReady = () => { cleanup(); resolve(globalThis.google.maps); };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({key, callback:'amcGoogleReady', loading:'async', v:'weekly', libraries:'marker'})}`;
    script.async = true;
    script.onerror = () => { cleanup(); script.remove(); reject(new Error('Google Maps could not load')); };
    document.head.append(script);
  }).catch(error => { googlePromise = undefined; throw error; });
  return googlePromise;
}
function loadLeaflet() {
  if (globalThis.L?.map) return Promise.resolve(globalThis.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-style]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet'; style.href = '/vendor/leaflet/leaflet.css'; style.dataset.leafletStyle = 'true';
      document.head.append(style);
    }
    const script = document.createElement('script');
    script.src = '/vendor/leaflet/leaflet.js';
    const timer = setTimeout(() => { script.remove(); reject(new Error('The map library took too long to load')); }, 12000);
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.L?.map) resolve(globalThis.L);
      else reject(new Error('The map library could not load'));
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('The map library could not load')); };
    document.head.append(script);
  }).catch(error => { leafletPromise = undefined; throw error; });
  return leafletPromise;
}
function controls(fit, element, resize) {
  const box = document.createElement('div');
  box.className = 'satellite-control leaflet-bar';
  const fitButton = document.createElement('button');
  fitButton.type = 'button'; fitButton.className = 'satellite-map-button';
  fitButton.title = 'Show all assigned branches'; fitButton.setAttribute('aria-label', fitButton.title);
  fitButton.textContent = 'Fit branches'; fitButton.addEventListener('click', fit);
  box.append(fitButton);
  const stage = element.closest('.map-stage') || element;
  if (stage.requestFullscreen) {
    const fullButton = document.createElement('button');
    fullButton.type = 'button'; fullButton.className = 'satellite-map-button';
    fullButton.title = 'Expand satellite map'; fullButton.setAttribute('aria-label', fullButton.title);
    fullButton.textContent = 'Expand';
    fullButton.addEventListener('click', () => {
      const action = document.fullscreenElement === stage ? document.exitFullscreen() : stage.requestFullscreen();
      action?.catch(() => {});
    });
    const change = () => {
      fullButton.textContent = document.fullscreenElement === stage ? 'Close full screen' : 'Expand';
      resize();
    };
    document.addEventListener('fullscreenchange', change);
    box.dispose = () => document.removeEventListener('fullscreenchange', change);
    box.append(fullButton);
  }
  return box;
}
async function localMap(element, branches, onSelect, state) {
  const response = outlines ? null : await fetch('/branch-map.geojson');
  if (response && !response.ok) throw new Error('Unable to load the branch map');
  if (!outlines) outlines = await response.json();
  if (!state.current()) return;
  const plotted = branches.filter(coordinates);
  const longitudes = plotted.map(b => b.longitude), latitudes = plotted.map(b => b.latitude);
  const west = Math.min(60, ...longitudes) - 1, east = Math.max(78, ...longitudes) + 1;
  const south = Math.min(23, ...latitudes) - 1, north = Math.max(38, ...latitudes) + 1;
  const project = ([lng, lat]) => [30 + (lng - west) / (east - west) * 580, 30 + (north - lat) / (north - south) * 440];
  function polygonPath(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.map(p => p.map(ring => ring.map((point, i) => `${i ? 'L' : 'M'}${project(point).map(n => n.toFixed(2)).join(',')}`).join(' ') + ' Z').join(' ')).join(' ');
  }
  const pinPositions = [];
  function pinPosition(point) {
    const original = project(point); let position = original;
    for (let attempt = 0; attempt < 80 && pinPositions.some(p => Math.hypot(p[0] - position[0], p[1] - position[1]) < 27); attempt++) {
      const angle = attempt * 2.399963, radius = 25 + Math.floor(attempt / 6) * 15;
      position = [Math.max(20, Math.min(620, original[0] + Math.cos(angle) * radius)), Math.max(50, Math.min(450, original[1] + Math.sin(angle) * radius))];
    }
    pinPositions.push(position); return {original, position};
  }
  element.innerHTML = `<svg class="local-branch-map" viewBox="0 0 640 500" role="group" aria-label="Offline geographic map of assigned branches; satellite imagery unavailable">
    <defs><pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dce8e9" stroke-width="0.7"/></pattern></defs>
    <rect width="640" height="500" fill="#eaf2f2"/><rect width="640" height="500" fill="url(#map-grid)"/>
    ${outlines.features.map(f => `<path d="${polygonPath(f.geometry)}" class="country ${f.properties.code === 'PAK' ? 'pakistan' : ''}"/>`).join('')}
    <text x="268" y="262" class="map-country-label">PAKISTAN</text><text x="87" y="184" class="map-neighbor-label">AFGHANISTAN</text><text x="69" y="360" class="map-neighbor-label">IRAN</text><text x="462" y="373" class="map-neighbor-label">INDIA</text><text x="100" y="468" class="map-sea-label">ARABIAN SEA</text>
    ${plotted.map((b, i) => {
      const {original:[ox,oy], position:[x,y]} = pinPosition([b.longitude,b.latitude]);
      return `<path d="M${ox.toFixed(2)},${oy.toFixed(2)} L${x.toFixed(2)},${y.toFixed(2)}" stroke="#95afa4" stroke-width="1"/><g class="branch-pin ${b.state === 'performed' ? 'performed' : 'remaining'}" data-map-branch="${escape(branchId(b))}" transform="translate(${x.toFixed(2)},${y.toFixed(2)})" role="button" tabindex="0" aria-label="${escape(branchLabel(b))}"><title>${escape(branchLabel(b))}</title><circle r="17" class="pin-halo"/><path d="M0 0 C-2 -6 -11 -11 -11 -20 A11 11 0 1 1 11 -20 C11 -11 2 -6 0 0Z" class="pin-body"/><circle cy="-20" r="7" fill="white"/><text y="-17" text-anchor="middle" class="pin-number">${i+1}</text></g>`;
    }).join('')}
    </svg>`;
  for (const pin of element.querySelectorAll('[data-map-branch]')) {
    const select = () => {
      selectedBranch = pin.dataset.mapBranch;
      for (const item of element.querySelectorAll('[data-map-branch]')) item.classList.toggle('is-selected', item === pin);
      onSelect(plotted.find(b => branchId(b) === pin.dataset.mapBranch));
    };
    pin.classList.toggle('is-selected', pin.dataset.mapBranch === selectedBranch);
    pin.addEventListener('click', select);
    pin.addEventListener('keydown', e => { if (['Enter',' '].includes(e.key)) { e.preventDefault(); select(); } });
  }
}
async function satelliteMap(element, branches, onSelect, onMode, state, prefix = '') {
  const L = await loadLeaflet();
  if (!state.current()) return;
  element.replaceChildren();
  const plotted = branches.filter(coordinates);
  const key = plotted.map(b => `${branchId(b)}:${b.latitude},${b.longitude}`).join('|');
  const map = L.map(element, {zoomControl:false, scrollWheelZoom:false, minZoom:2, maxZoom:18, keyboard:true});
  L.control.zoom({position:'bottomleft'}).addTo(map);
  const bounds = L.latLngBounds(plotted.map(b => [b.latitude,b.longitude]));
  const fit = () => map.fitBounds(bounds, {padding:[55,55], maxZoom:13, animate:false});
  if (lastView?.provider === 'esri' && lastView.key === key) map.setView(lastView.center, lastView.zoom);
  else fit();
  const box = controls(fit, element, () => map.invalidateSize());
  const extra = L.control({position:'topright'});
  extra.onAdd = () => { L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box); return box; };
  extra.addTo(map);
  let loaded = 0, failed = 0, phase = 'satellite';
  const imagery = L.tileLayer(imageryUrl, {maxZoom:18, attribution:'Imagery © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> and its data providers'});
  const labels = L.tileLayer(labelsUrl, {maxZoom:18, pane:'overlayPane', opacity:.85});
  let timer, failureTimer;
  const dispose = () => {
    phase = 'disposed'; clearTimeout(timer); clearTimeout(failureTimer); box.dispose?.();
    lastView = {provider:'esri', key, center:map.getCenter(), zoom:map.getZoom()};
    imagery.off(); labels.off(); map.remove();
  };
  state.clearResource = dispose;
  const fallback = async () => {
    if (!state.current() || phase !== 'satellite') return;
    dispose(); state.clearResource = null;
    try {
      await localMap(element, branches, onSelect, state);
      if (state.current()) onMode('Satellite unavailable · offline geographic map');
    } catch {
      if (state.current()) {
        element.innerHTML = '<div class="map-empty">Satellite imagery could not load. Select a branch below to view its progress.</div>';
        onMode('Satellite imagery unavailable');
      }
    }
  };
  timer = setTimeout(() => { if (!loaded) fallback(); }, 12000);
  imagery.on('tileload', () => {
    if (!state.current() || phase !== 'satellite') return;
    loaded++; clearTimeout(timer); clearTimeout(failureTimer);
    onMode(`${prefix}Satellite imagery · Esri${failed ? ' · some tiles unavailable' : ''}`);
  });
  imagery.on('tileerror', () => {
    if (!state.current() || phase !== 'satellite') return;
    failed++;
    if (loaded) onMode(`${prefix}Satellite imagery · Esri · connection interrupted`);
    else if (failed >= 3 && !failureTimer) failureTimer = setTimeout(fallback, 500);
  });
  const markers = [];
  for (const group of groupsFor(plotted)) {
    const marker = L.marker([group.latitude,group.longitude], {
      title:groupLabel(group), alt:groupLabel(group), keyboard:true,
      icon:L.divIcon({className:`satellite-branch-marker ${groupState(group)}`, iconSize:[38,44], iconAnchor:[19,42], popupAnchor:[0,-40],
        html:`<span class="satellite-pin">${group.entries[0].index}${group.entries.length > 1 ? `<small class="satellite-pin-count">+${group.entries.length - 1}</small>` : ''}</span>`})
    }).addTo(map);
    const select = branch => {
      selectedBranch = branchId(branch);
      for (const item of markers) item.marker.getElement()?.classList.toggle('is-selected', item.group.entries.some(entry => branchId(entry.branch) === selectedBranch));
      onSelect(branch);
    };
    marker.bindPopup(popupContent(group, select), {maxWidth:280, minWidth:210});
    marker.on('click', () => select(group.entries[0].branch));
    marker.getElement()?.classList.toggle('is-selected', group.entries.some(entry => branchId(entry.branch) === selectedBranch));
    markers.push({marker, group});
  }
  onMode(`${prefix}Loading satellite imagery…`);
  imagery.addTo(map); labels.addTo(map);
}
async function googleMap(element, branches, configuration, onSelect, onMode, state) {
  const maps = await loadGoogle(configuration.googleMapsKey);
  if (!state.current()) return;
  const {AdvancedMarkerElement, PinElement} = await maps.importLibrary('marker');
  if (!state.current()) return;
  element.replaceChildren();
  const map = new maps.Map(element, {center:{lat:30.3,lng:69.3}, zoom:5, mapId:configuration.mapId || 'DEMO_MAP_ID', mapTypeId:'hybrid', streetViewControl:false, fullscreenControl:false, mapTypeControl:true, mapTypeControlOptions:{mapTypeIds:['hybrid','roadmap'], position:maps.ControlPosition.BOTTOM_LEFT}, zoomControlOptions:{position:maps.ControlPosition.RIGHT_BOTTOM}});
  const plotted = branches.filter(coordinates);
  const key = plotted.map(b => `${branchId(b)}:${b.latitude},${b.longitude}`).join('|');
  const bounds = new maps.LatLngBounds();
  plotted.forEach(b => bounds.extend({lat:b.latitude,lng:b.longitude}));
  const fit = () => { if (plotted.length > 1) map.fitBounds(bounds,55); else {map.setCenter(bounds.getCenter());map.setZoom(13);} };
  if (lastView?.provider === 'google' && lastView.key === key) {map.setCenter(lastView.center);map.setZoom(lastView.zoom);}
  else fit();
  const box = controls(fit, element, () => { maps.event.trigger(map,'resize'); });
  map.controls[maps.ControlPosition.TOP_RIGHT].push(box);
  const info = new maps.InfoWindow();
  const markers = [];
  for (const group of groupsFor(plotted)) {
    const pin = new PinElement({background:groupState(group) === 'performed' ? '#16886c' : '#e9a12b', borderColor:'white', glyphText:group.entries.length > 1 ? `${group.entries.length}` : String(group.entries[0].index), glyphColor:'white'});
    const marker = new AdvancedMarkerElement({map,position:{lat:group.latitude,lng:group.longitude},title:groupLabel(group),gmpClickable:true});
    marker.append(pin);
    marker.addListener('click', () => {
      selectedBranch = branchId(group.entries[0].branch); onSelect(group.entries[0].branch);
      info.setContent(popupContent(group, branch => { selectedBranch = branchId(branch); onSelect(branch); }));
      info.open({map, anchor:marker});
    });
    markers.push(marker);
  }
  let fallbackStarted = false;
  const previousFailure = globalThis.gm_authFailure;
  const authFailure = () => {
    if (!state.current() || fallbackStarted) return;
    fallbackStarted = true; state.clearResource?.(); state.clearResource = null;
    satelliteMap(element, branches, onSelect, onMode, state, 'Google unavailable · ').catch(async () => {
      await localMap(element, branches, onSelect, state);
      if (state.current()) onMode('Google unavailable · offline geographic map');
    });
  };
  globalThis.gm_authFailure = authFailure;
  state.clearResource = () => {
    lastView = {provider:'google', key, center:map.getCenter()?.toJSON(), zoom:map.getZoom()};
    info.close(); markers.forEach(marker => { maps.event.clearInstanceListeners(marker); marker.map = null; });
    maps.event.clearInstanceListeners(map); box.dispose?.();
    if (globalThis.gm_authFailure === authFailure) globalThis.gm_authFailure = previousFailure;
  };
  onMode('Google satellite imagery · hybrid view');
}
export async function renderBranchMap(element, branches, configuration = {}, onSelect = () => {}, onMode = () => {}) {
  activeState?.dispose();
  const state = {clearResource:null, active:true, current:() => state.active && activeState === state && element.isConnected};
  state.dispose = () => { if (!state.active) return; state.active = false; state.clearResource?.(); state.clearResource = null; observer.disconnect(); };
  activeState = state;
  const observer = new MutationObserver(() => { if (!element.isConnected) state.dispose(); });
  observer.observe(document.body, {childList:true,subtree:true});
  if (!branches.some(coordinates)) {
    element.innerHTML = '<div class="map-empty">No branch coordinates are available for this selection. Branches without coordinates remain in the overview totals.</div>';
    onMode('No locations available'); return;
  }
  if (configuration.googleMapsKey) {
    try { await googleMap(element, branches, configuration, onSelect, onMode, state); return; }
    catch { if (!state.current()) return; state.clearResource?.(); state.clearResource = null; }
  }
  try { await satelliteMap(element, branches, onSelect, onMode, state, configuration.googleMapsKey ? 'Google unavailable · ' : ''); }
  catch {
    if (!state.current()) return;
    state.clearResource?.(); state.clearResource = null;
    await localMap(element, branches, onSelect, state);
    if (state.current()) onMode('Satellite unavailable · offline geographic map');
  }
}
