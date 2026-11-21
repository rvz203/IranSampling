(() => {
  const maplibre = window.maplibregl;
  const tileLibrary = window.pmtiles;
  const basemaps = window.basemaps;
  const notice = document.getElementById("notice");
  const country = document.getElementById("country");
  const archiveURL = new URL("/api/maps/iran.pmtiles", location.origin).href;
  const assetURL = location.origin + "/api/maps/assets";
  const iranBounds = [[43.7, 23.8], [63.6, 40.3]];
  const markers = new Map();
  let map;
  let snapshot = { points: [], routes: [], language: "fa" };
  let fitKey = "";
  let previousSelection;

  function showError() {
    document.body.dataset.mapState = "error";
    notice.hidden = false;
    notice.textContent = snapshot.language === "en"
      ? "Could not load the local Iran map."
      : "بارگیری نقشهٔ ایران از سرور انجام نشد.";
  }

  function validPoint(point) {
    return point && typeof point.id === "string" && typeof point.label === "string"
      && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 85
      && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
  }

  function pointFromLink() {
    const location = new URLSearchParams(window.location.hash.slice(1));
    if (!location.has("lat") || !location.has("lon")) return null;
    const point = {
      id: "linked-location",
      label: "نقطه روی نقشه",
      latitude: Number(location.get("lat")),
      longitude: Number(location.get("lon")),
    };
    return validPoint(point) ? point : null;
  }

  function resetCountry() {
    map.fitBounds(iranBounds, { padding: 34, duration: 0 });
  }

  function updateMarkers() {
    if (!map) return;
    const points = snapshot.points;
    const ids = new Set(points.map((point) => point.id));
    for (const [id, entry] of markers) {
      if (!ids.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }
    for (const point of points) {
      let entry = markers.get(point.id);
      const coord = [point.longitude, point.latitude];
      if (!entry) {
        const button = document.createElement("button");
        button.type = "button";
        const popup = new maplibre.Popup({ offset: 18 });
        const marker = new maplibre.Marker({ element: button })
          .setLngLat(coord).setPopup(popup).addTo(map);
        button.addEventListener("click", () => {
          if (window.parent !== window) {
            window.parent.postMessage({ type: "sampling-map:marker", id: point.id }, location.origin);
          }
        });
        entry = { marker, button, popup };
        markers.set(point.id, entry);
      }
      entry.button.className = point.stale ? "pin stale" : "pin";
      entry.button.setAttribute("aria-label", point.label);
      entry.button.setAttribute("aria-pressed", String(snapshot.selected === point.id));
      entry.popup.setText(point.label);
      entry.marker.setLngLat(coord);
    }
    const focus = points.find((point) => point.id === snapshot.selected);
    const nextFit = [...ids].sort().join("\n");
    if (focus && previousSelection !== focus.id) {
      map.jumpTo({
        center: [focus.longitude, focus.latitude],
        zoom: Math.max(map.getZoom(), 15),
      });
    } else if (nextFit !== fitKey) {
      if (points.length || snapshot.routes.length) {
        const bounds = new maplibre.LngLatBounds();
        for (const point of points) bounds.extend([point.longitude, point.latitude]);
        for (const route of snapshot.routes) {
          for (const coordinate of route) bounds.extend(coordinate);
        }
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
      } else {
        resetCountry();
      }
    }
    fitKey = nextFit;
    previousSelection = snapshot.selected;
  }

  function updateRoutes() {
    const source = map?.getSource("tracks");
    if (!source) return;
    source.setData({
      type: "FeatureCollection",
      features: snapshot.routes.map((coordinates) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      })),
    });
    document.body.dataset.routeCount = String(snapshot.routes.length);
  }

  function accept(next) {
    if (!next || !Array.isArray(next.points)) return;
    snapshot = {
      points: next.points.filter(validPoint),
      routes: Array.isArray(next.routes) ? next.routes.filter((route) =>
        Array.isArray(route) && route.length >= 2 && route.every((coordinate) =>
          Array.isArray(coordinate) && coordinate.length === 2 &&
          Number.isFinite(coordinate[0]) && Math.abs(coordinate[0]) <= 180 &&
          Number.isFinite(coordinate[1]) && Math.abs(coordinate[1]) <= 85)) : [],
      selected: next.selected,
      language: next.language === "en" ? "en" : "fa",
    };
    country.textContent = snapshot.language === "en" ? "Iran overview" : "نمای ایران";
    country.setAttribute("aria-label", snapshot.language === "en" ? "Show all of Iran" : "نمای سراسر ایران");
    updateMarkers();
    updateRoutes();
  }

  function selectFromLink() {
    const point = pointFromLink();
    if (point) accept({ points: [point], selected: point.id, language: "fa" });
  }

  window.setSamplingMap = accept;
  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.source === window.parent
      && event.data?.type === "sampling-map:points") accept(event.data);
  });
  if (window.parent === window) {
    selectFromLink();
    window.addEventListener("hashchange", selectFromLink);
  }

  async function start() {
    if (!maplibre || !tileLibrary || !basemaps) {
      showError();
      return;
    }
    try {
      const protocol = new tileLibrary.Protocol();
      const archive = new tileLibrary.PMTiles(archiveURL);
      protocol.add(archive);
      maplibre.addProtocol("pmtiles", protocol.tile);
      await archive.getHeader();
      if (maplibre.getRTLTextPluginStatus() === "unavailable") {
        await maplibre.setRTLTextPlugin(assetURL + "/rtl.js", false);
      }
      map = new maplibre.Map({
        container: "map",
        bounds: iranBounds,
        fitBoundsOptions: { padding: 34 },
        maxZoom: 19,
        renderWorldCopies: false,
        style: {
          version: 8,
          glyphs: assetURL + "/fonts/{fontstack}/{range}.pbf",
          sprite: assetURL + "/sprites/v4/light",
          sources: {
            osm: {
              type: "vector",
              url: "pmtiles://" + archiveURL,
              attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://protomaps.com/" target="_blank" rel="noopener noreferrer">Protomaps</a>',
            },
            tracks: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          },
          layers: [
            ...basemaps.layers("osm", basemaps.namedFlavor("light"), { lang: "fa" }),
            {
              id: "track-outline",
              type: "line",
              source: "tracks",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#fff", "line-width": 7 },
            },
            {
              id: "track-line",
              type: "line",
              source: "tracks",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": "#285743", "line-width": 4 },
            },
          ],
        },
        locale: {
          "NavigationControl.ZoomIn": "بزرگ‌نمایی",
          "NavigationControl.ZoomOut": "کوچک‌نمایی",
          "NavigationControl.ResetBearing": "نمای شمال",
        },
      });
      map.addControl(new maplibre.NavigationControl({ visualizePitch: false }), "top-left");
      map.addControl(new maplibre.ScaleControl({ unit: "metric" }), "bottom-left");
      country.addEventListener("click", resetCountry);
      map.once("load", () => {
        document.body.dataset.mapState = "ready";
        country.hidden = false;
        notice.hidden = true;
        updateRoutes();
      });
      map.on("idle", () => {
        document.body.dataset.mapZoom = String(map.getZoom().toFixed(2));
      });
      map.on("error", () => {
        if (!map.isStyleLoaded() && document.body.dataset.mapState !== "ready") showError();
      });
      updateMarkers();
    } catch (error) {
      console.error("Local map initialization failed", error);
      showError();
    }
  }

  void start();
})();
