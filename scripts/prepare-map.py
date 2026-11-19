"""Provision the static Iran basemap files used by the Go API."""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import time
from urllib.error import URLError
from urllib.request import urlopen
from zipfile import ZipFile


CDN = "https://cdn.jsdelivr.net/npm/"
REGION = "https://download.geofabrik.de/asia/iran.poly"
ASSETS = "https://codeload.github.com/protomaps/basemaps-assets/zip/028c18f713baecad011301ff7a69acc39bcc2ae7"
ASSETS_SHA256 = "e942a417d94a12596842a20b53d6b785cbf6d47f2545e458538191ba6d74b305"
RENDERER_ASSETS = {
    "maplibre.js": (
        "maplibre-gl@5.24.0/dist/maplibre-gl.js",
        "45a9b07a9189ce56054c620a947ccf41e291e58c95e9b61533b740aaa65ee5cb",
    ),
    "maplibre.css": (
        "maplibre-gl@5.24.0/dist/maplibre-gl.css",
        "ab1e70d59ec40465bae7e7030da2f3ccf28133fd502e62bd598eefbadfd7a732",
    ),
    "pmtiles.js": (
        "pmtiles@4.5.0/dist/pmtiles.js",
        "caf981bc46f6327ee7e65d5dc964d89d38a69f60edca2bd4c5c890c21b554c6c",
    ),
    "basemaps.js": (
        "@protomaps/basemaps@5.7.2/dist/basemaps.js",
        "551864f01da1bfe3005e99987197f22f56d0c35f9a10fa1727a889e2434af16d",
    ),
    "rtl.js": (
        "@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js",
        "d1c69035295613baaf83fe23fd9266b0eaed7e5e472e9632b0b5438afc3f589e",
    ),
}


def checksum(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(url, target, digest=None):
    if target.is_file() and (digest is None or checksum(target) == digest):
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".downloading")
    for attempt in range(3):
        try:
            with urlopen(url, timeout=35) as response, temp.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            break
        except (URLError, TimeoutError, ConnectionError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    if digest and checksum(temp) != digest:
        raise ValueError(f"Unexpected SHA-256 for {target.name}")
    temp.replace(target)


def region_geojson(poly):
    polygons = []
    ring = None
    for line in poly.splitlines()[1:]:
        if not line.strip():
            continue
        if line.strip() == "END":
            if ring and ring[0] != ring[-1]:
                ring.append(ring[0])
            ring = None
        elif line[0].isspace():
            ring.append([float(value) for value in line.split()])
        else:
            ring = []
            if line.startswith("!"):
                polygons[-1].append(ring)
            else:
                polygons.append([ring])
    if not polygons:
        raise ValueError("Iran boundary is empty")
    return {"type": "MultiPolygon", "coordinates": polygons}


def install_assets(data):
    assets = data / "assets"
    for filename, (npm_path, digest) in RENDERER_ASSETS.items():
        download(CDN + npm_path, assets / filename, digest)
    archive = data / "basemaps-assets.zip"
    download(ASSETS, archive, ASSETS_SHA256)
    with ZipFile(archive) as source:
        for entry in source.infolist():
            parts = PurePosixPath(entry.filename).parts[1:]
            if entry.is_dir() or not parts:
                continue
            if parts[0] not in ("fonts", "sprites", "LICENSE"):
                continue
            destination = (assets / Path(*parts)).resolve()
            if not destination.is_relative_to(assets.resolve()):
                raise ValueError(f"Invalid asset path: {entry.filename}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as content, destination.open("wb") as output:
                shutil.copyfileobj(content, output)


def prepare_archive(data, pmtiles, source):
    archive = data / "iran.pmtiles"
    if not archive.exists():
        poly = data / "iran.poly"
        download(REGION, poly)
        region = data / "iran.geojson"
        region.write_text(json.dumps(region_geojson(poly.read_text())), encoding="utf-8")
        temporary = data / "iran.extracting.pmtiles"
        subprocess.run([
            pmtiles, "extract", source, str(temporary),
            f"--region={region}", "--maxzoom=15",
        ], check=True)
        subprocess.run([pmtiles, "verify", str(temporary)], check=True)
        temporary.replace(archive)
        (data / "source.json").write_text(json.dumps({
            "archive_source": source,
            "boundary_source": REGION,
            "sha256": checksum(archive),
        }, indent=2) + "\n", encoding="utf-8")
    else:
        subprocess.run([pmtiles, "verify", str(archive)], check=True)
    subprocess.run([pmtiles, "show", str(archive), "--header-json"], check=True)


def main():
    previous_day = datetime.now(timezone.utc).date() - timedelta(days=1)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path(".local/maps"))
    parser.add_argument("--pmtiles", default="pmtiles", help="Path to the PMTiles CLI")
    parser.add_argument("--source", default=f"https://build.protomaps.com/{previous_day:%Y%m%d}.pmtiles")
    args = parser.parse_args()
    data = args.data_dir.resolve()
    data.mkdir(parents=True, exist_ok=True)
    install_assets(data)
    prepare_archive(data, args.pmtiles, args.source)
    print(f"Iran map data ready in {data}")


if __name__ == "__main__":
    main()
