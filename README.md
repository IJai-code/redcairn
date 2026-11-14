# REDCAIRN — Mars EVA Navigator

A hyper-local tactical navigation interface for the first human surface walks on Mars. It fuses orbital and surface data into go / no-go guidance an astronaut can read on a wrist tablet, rover console or helmet display.

> Built for a 48-hour planetary exploration hackathon. This is an independent student project and is not affiliated with or endorsed by any space agency.

## What it does

- **Slope safety** — colours every route segment by spacesuit mobility limits (safe under 15°, caution 15–20°, impassable above 20°).
- **Science targets** — highlights mineral units worth stopping to sample.
- **Hazard response** — simulated radiation and dust alerts that recalculate the safe return path.
- **Eye-level context** — real rover photography and 3D terrain models at each waypoint.
- **Suit telemetry** — simulated oxygen, battery, pace and radiation dose that update with the chosen route.

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Project layout

```
index.html           App shell
css/                 Styles
js/                  ES modules (no bundler)
data/mission.json    Site, basemaps, layers, waypoints, suit and hazard models, sources
data/route.json      EVA route with per-vertex distance, elevation and slope (generated)
tools/               Data build scripts
assets/models/       .glb terrain cross-sections and scale models
assets/img/          UI imagery
```

## The site

**Boxwork Terrain, lower Aeolis Mons (Mount Sharp), Gale crater.** A 1.5 km walk from a pressurised-rover staging point, through the boxwork ridge network, across a geologic contact and up onto layered sulfate bedrock: 77 m of climb and five stops.

The route is not hand-drawn. It follows ground the Curiosity rover drove between mission sols 4560 and 4868. Slope comes from the 1 m orbital elevation model, which agrees with the rover's own elevations to within 1 m RMS along the route.

## Data sources

| Data | Used for | Source |
|---|---|---|
| HiRISE 25 cm mosaic, CTX mosaic, MOLA shaded relief | Basemaps | Mars Trek tile services |
| HiRISE 1 m elevation model of Gale crater | Slope and mobility classes | Mars Trek image service |
| Rover traverse and waypoints | Route geometry, waypoint positions, slope validation | Curiosity mission location service |
| Rover raw images | Eye-level photography at each waypoint | Curiosity raw image service |
| Mission blog posts and news releases | Mineral and science annotations | Linked per waypoint in `data/mission.json` |
| Surface radiation measurements | Background dose and terrain-shielding model | Hassler et al. 2014 and agency reporting |
| Exploration Zones layer | Landing-site rationale | Mars Trek |

Full links are in the `sources` array of [`data/mission.json`](data/mission.json). Imagery credit: NASA/JPL-Caltech, NASA/JPL-Caltech/MSSS, NASA/JPL-Caltech/University of Arizona, USGS.

Suit telemetry and the solar-event and dust-storm scenarios are **simulated** and labelled as such in the app.

To rebuild the route from the live sources:

```bash
python3 tools/build_route.py
```

## AI use disclosure

AI coding assistants were used to accelerate scaffolding, data retrieval scripts, code generation and review. All scientific data comes from the public sources listed above; simulated values (suit telemetry, space-weather events) are labelled as simulated in the app.
