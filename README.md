# REDCAIRN: Finding Curiosity

**Could you walk 2.7 km across Mars to a rover that has been alone since 2012, and get home before the Sun turns on you?**
REDCAIRN is an interactive Marswalk planning prototype: it combines rover traverses, orbital terrain and science layers, a modeled walk-home field, and a story you can explore at each stop. Slope colors are screening thresholds, not a safety certification; air, pace and radiation are planning scenarios.
Every number is computed in your browser from NASA data, and tapping any number shows its source. Planners can download the whole EVA plan as GeoJSON.
Jezero uses its own HiRISE image, elevation model and Perseverance traverse. This build does not yet integrate the local MEDA weather archive, so it displays Gale REMS as context and uses Curiosity RAD for an illustrative radiation scenario. Both are labeled as references, not Jezero measurements.
**Live:** <https://ijai-code.github.io/redcairn/> · **Second site, Jezero (beta):** <https://ijai-code.github.io/redcairn/?site=jezero>
2026 NASA Space Apps, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA.

## Same engine, two craters

The method is not hand-tuned to one place. The same scripts and the same browser engine build each walk from four public inputs: a 1 m orbital elevation model, a 25 cm orbital photo, a rover's own track and its photos. Each elevation model is checked against the heights the rover itself measured on that ground.

| Site | Rover track walked | Walk | Steepest | Elevation model vs rover reference heights | Cells routed |
|---|---|---|---|---|---|
| Gale crater, Mount Sharp | Curiosity, sols 4560–5073 | 2.71 km | 16.6° | **1.65 m RMS** (573 points) | 386,912 |
| Jezero crater floor (beta) | Perseverance, sols 13–180 | 1.86 km | 10.1° | **0.41 m RMS** (248 points) | 378,963 |

The Gale comparison uses 573 resampled rover-traverse elevations. Jezero pairs 248 route locations with nearby Perseverance waypoint elevations. Both RMS values remove the mean vertical datum offset first; these along-track comparisons do not validate every elevation-model cell.

Jezero is built by `tools/fetch_jezero_dtm.py`, `tools/fetch_jezero_ortho.py` and `tools/build_jezero.py`. They read only the needed window out of the 1.8 GB and 3.4 GB Mars 2020 landing maps with HTTP range requests.

## The numbers (Gale)

| | |
|---|---|
| Walk-home time computed for | 386,912 patches of ground, in about 0.2 s in your browser |
| Three routes to the rover, round trip | rover-proven 5.3 km, 4 h 39 · fastest 3.6 km, 3 h 59 · gentlest 3.7 km, 4 h 02 |
| Real solar storm of September 2017 (RAD peak ≈ 3× normal), from the rover | the map's new line **0.05 mSv**, 35 min · the way you came 0.08 mSv, 57 min · shelter behind the best ridge 0.18 mSv |
| Whole walk | 0.13 mSv, 0.02% of the NASA career limit, 3 h 00 of air to spare |

## How it plays

1. **The opening.** Five plates, each one true line: it landed alone in 2012; it played itself "Happy Birthday" once; rock tore its wheels and it kept climbing; it photographed Earth; fourteen years later, you land. Blender drew every plate from the real elevation data (`tools/blender_plates.py`). No AI images. You can skip straight to the map.
2. **The plan.** Mars Trek tiles, Curiosity's 14-year line, and three routes to the rover with slope thresholds shown on the terrain model.
3. **Five cairns along its tracks**, on the real 1 m ground drawn live in ink, inside the real crater in 3D (MOLA + HRSC, about 65 km across), with Mount Sharp rising behind you. Each leg is walked at a real suited pace, with long legs as a labelled time-lapse. The ground shows: contours every 2 m of real height, hachures where the ground needs care, stipple where hills shelter you from radiation. At each cairn you get one true moment from the mission, Curiosity's photo from that spot, and four live numbers: air, walk home, dose and time out.
4. **Curiosity.** You reach it at its real position. Its newest raw image is fetched live. You can kneel at its torn wheel.
5. **The storm.** The real September 2017 solar storm arrives. You choose between three ways home on the real terrain.
6. **Home.** The three questions are answered with your numbers, and its mission clock is still ticking. Save a **result card** of your walk.

Point anywhere on the map for coordinates, elevation, slope and minutes to walk home. Eleven layers are available: optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth and computed. On the suit radio, Curiosity's real first post is marked *real*; the habitat and your partner EVA-2 are marked *imagined*.

## Sound

Sound comes on with your first click (unless you choose silence): an original ambient score generated in the browser (slow chords, a soft reverb, sparse high notes; darker in the storm, resolved at home), the thin wind, and the suit radio. The team recorded the radio voices; Curiosity's real first post from Mars is read in a ring-modulated, robotic voice, and every line carries a hiss of open-channel static. The opening plays NASA Goddard's own 2013 recording of SAM vibrating "Happy Birthday".

## Why it looks like this

Most entries open as a dark dashboard. REDCAIRN opens as a story with a look of its own, and every picture in it is the real ground: the plates are Blender renders of the 1 m elevation model, the map is Mars Trek's own tiles, the 3D window is the HiRISE photo on the same elevation model. One story card, one map, one panel, one accent colour.

## The five resources we were given, and where each one shows up

| Resource | In REDCAIRN |
|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | The map is Mars Trek's own tiles (HiRISE, CTX, THEMIS, MOLA/HRSC, USGS geology); every height in the app (the walk's 1 m elevation model, the crater, the horizon) comes from Mars Trek services |
| [USGS planetary geologic mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | The **Rock units** layer on the map: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | The intro beat and the "Curiosity's whole climb" layer: the 38.6 km route that plan became; our walk is its 2025–26 stretch |
| [Worldview](https://worldview.earthdata.nasa.gov/) | Each cairn named after a place on Earth links to that place in Worldview |
| [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | Perseverance's newest raw image, fetched live, and its Navcam photo at every stop of the **Jezero walk (beta)**, built by the same engine |

## What is real and what is simulated

**Real:** the ground imagery and elevation, rover traverses and photographs, rock findings, weather and radiation observations at Gale, water-mineral detections, geologic units, and mission facts. The 1 m elevation model differs from rover reference elevations by 1.65 m RMS at 573 resampled Gale traverse points and 0.41 m RMS at 248 Jezero route locations paired with nearby waypoint elevations, after removing the mean datum offset. These comparisons do not validate every map cell.

**Simulated, and labelled in the app:** the suit (air, battery, pace), dose timeline, terrain-shielding estimate, you, and the time compression of the walk. The storm drill replays Curiosity's September 2017 Gale event; at Jezero, Gale weather and radiation are contextual proxies. The slope screen does not model loose soil, small rocks, hidden edges, crew condition or suit limits. The walk is at true scale; the Blender crater render in the intro stretches heights ×3.

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
$B -b --python tools/blender_plates.py                  # the opening's illustrated plates -> assets/img/plates/p1..p6.jpg
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
