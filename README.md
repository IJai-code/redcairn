# REDCAIRN: a survival map for the first walk on Mars

A layered survival map for the first walk on Mars. It walks you, cairn by cairn, along the line Curiosity drove up Mount Sharp, on Mars Trek's own tiles, and answers three questions: where is it safe to step, what is worth stopping for, and can I get home? At any cairn you can stand on the ground in 3D, at true scale. About three minutes.

Live: <https://redcairn.netlify.app>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. On Mars, a rover already did that: every place Curiosity stopped is a cairn. REDCAIRN turns those stops, and the orbital data above them, into the map an astronaut carries.

## How it plays: map first, walk second

The map is the product. A story card on the left tells the walk one beat at a time and moves the map with it; the panel on the right holds every layer and today's conditions. Ten beats, about three minutes, then the map is yours. The bar across the top jumps to Plan, Walk, Storm or Home.

| Beat | On the map | Built from |
|---|---|---|
| **Intro** | Curiosity's whole 14-year line across Gale crater, and the three questions | Mars Trek tiles (CTX, HiRISE); Curiosity traverse to sol 5,073 |
| **Plan** | Slope for a spacesuit (green safe, amber care, red over 20°) and three routes to the same five cairns: rover-proven, fastest, gentlest, each timed and costed | HiRISE 1 m elevation via Mars Trek; routes computed in the browser |
| **The dock + five cairns** | The map flies to each stop and switches on the layer that matters there. One true moment from the rover's mission, Curiosity's own photo from that spot, its Earth namesake in Worldview, and your air, walk home, dose and time out | Curiosity Navcam and mission blog; NASA Worldview; suit timeline (simulated) |
| **Storm** | A simulated solar storm at the turnaround. The map draws three ways home on the real terrain (the new line, the way you came, shelter behind a ridge) over the terrain-shielding layer; you choose, and see the dose | Curiosity RAD (Sept 2017 event ×20); 16-direction sky-shielding scan |
| **Home** | The three questions answered with your numbers | |
| **See it from the ground** | At any stop: first person at true scale, under the real horizon, beside the team's rover (wheels turning, body tilting to the ground), with the same data on a helmet visor. Follow the rover to the next cairn, or go back to the map | HiRISE photo on the 1 m elevation model; 360° horizon and rover prepared in Blender |
| **Watch the landing** (optional) | Through the lander window: Mars in true colour, Gale crater in 3D with water minerals, rock units and Curiosity's track, touchdown, then the plan | Viking colour; MOLA + HRSC; CRISM + OMEGA; USGS SIM 3292. Rendered in Blender |

The right-hand panel groups every layer by kind of data (optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth, computed) with its mission, and shows today's REMS weather, the RAD radiation rate, NASA DONKI space weather, and Perseverance's newest raw image under "Next walk: Jezero crater". On a phone the story card sits at the bottom and the panel opens from a Layers button.

## Why it looks like this

One story card, one map, one panel. The card says one thing per beat: a moment from the rover's mission, in the team's own words where we have them. The rover is the emotional thread: it drove this ground alone a year before you, its stops are your cairns, and it is still out there, climbing.

## The five resources we were given, and where each one shows up

| Resource | In REDCAIRN |
|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | The map is Mars Trek's own tiles (HiRISE, CTX, THEMIS, MOLA/HRSC, USGS geology); every height in the app (the walk's 1 m elevation model, the crater, the horizon) comes from Mars Trek services |
| [USGS planetary geologic mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | The **Rock units** layer on the map and in the lander window: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | The intro beat and the "Curiosity's whole climb" layer: the 38.6 km route that plan became; our walk is its 2025–26 stretch |
| [Worldview](https://worldview.earthdata.nasa.gov/) | Each cairn named after a place on Earth links to that place in Worldview |
| [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | "Next walk: Jezero crater": Perseverance's newest raw image, fetched live; the engine needs only an elevation model and a rover's photos |

## What is real and what is simulated

**Real:** the ground, its height and slope, the route (the rover's own track), the photographs, the rock findings, the weather report, the normal radiation rate and the measured effect of terrain on it, the water-mineral detections, the geologic units, and every date and figure about the machines. The 1 m elevation model agrees with the rover's own elevations to 0.99 m RMS along the route.

**Simulated, and labelled in the app:** the suit (air, battery, pace), you, the time compression of the walk, the solar storm (made 20 times stronger than the September 2017 event so the drill is easy to follow, and 2 h long for the shelter option), and the rocks smaller than a metre scattered for scale, since HiRISE cannot resolve them. The walk is at true scale; the crater view in the lander window stretches heights ×3.

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 tools/serve.py
```

Then open <http://localhost:8123>.

## Rebuild everything from the live sources

Every number, picture and layer comes from public services through scripts in `tools/`. Python scripts use the standard library only; Blender scripts run headless (Blender 5.x).

```bash
python3 tools/build_terrain.py        # HiRISE 1 m elevation for the walk site -> data/terrain.*
python3 tools/build_route.py          # Curiosity's track, slopes and validation -> data/route.json
python3 tools/build_ortho.py          # HiRISE photo of the site at ~33 cm/px -> art/hirise/site.png
python3 tools/build_conditions.py     # REMS weather, hydrous minerals, NASA DONKI space weather -> data/conditions.json
python3 tools/build_gale.py           # Gale crater elevation, colour, relief, geology, minerals, full traverse -> art/gale/, data/gale.json
```

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python tools/blender_globe.py                    # Viking colour globe -> assets/img/mars-viking.jpg
$B -b --python tools/blender_gale.py                     # Gale crater layers + projected track -> assets/img/gale-wide-*.jpg, data/gale-view.json
$B -b --python tools/blender_scene.py -- --ortho-only    # tinted site photo -> assets/img/site-ortho.jpg
$B -b --python tools/blender_horizon.py                  # 360° true-scale horizon from the dock -> assets/img/horizon.jpg
$B -b --python tools/blender_rover.py -- path/to/rover.stl   # team rover -> assets/models/rover.bin, data/rover.json (six spinning wheels)
$B -b --python tools/blender_scene.py -- --rover path/to/rover.blend   # site and stop models, hero render
```

## Project layout

```
index.html            the page
css/styles.css        styles
js/app.js             the mission: descent, visor boot, the walk behind the rover, storm, home, explore
js/scene.js           three.js: the globe, and the true-scale world (ground, horizon, rocks, rover, cameras)
js/crater.js          the Blender-rendered crater, its layers and the drawn track
js/map.js             the planning map: Mars Trek tiles in Leaflet, computed layers, routes and cairns
js/terrain.js         slope, sky shielding and least-time routing on the 2 m grid
js/sim.js             suit timeline and dose
data/                 baked mission data (see tools/)
tools/                data and Blender build scripts
assets/img/           renders and textures made by the Blender scripts
art/                  Blender scenes and source rasters
docs/PITCH.md         pitch and 3-minute demo script
```

## Credits and AI use

Imagery and data: NASA/JPL-Caltech, NASA/JPL-Caltech/MSSS, NASA/JPL-Caltech/University of Arizona, USGS, ESA (Mars Express OMEGA and HRSC), via Mars Trek and the Curiosity and Perseverance raw image services. Full links are in the `sources` array of [`data/mission.json`](data/mission.json) and in the app's *Sources & honesty* panel.

AI assistants helped write code and the data-retrieval scripts. The data, the site choice and every figure trace to the public sources above. No agency logos or branding are used.
