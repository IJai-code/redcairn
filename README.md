# REDCAIRN: Finding Curiosity

**A survival map for the first walk on Mars, and the walk has a destination: the rover itself.**

Curiosity has been alone on Mount Sharp since 2012. Its real track ends at its latest stop, sol 5,073. REDCAIRN sends the first person on Mars to walk the last 2.7 km of its tracks, find it, and come home alive. The survival map (slope for a suit, air, radiation, the way home from every point, a solar storm) is how you get there.

Live: <https://ijai-code.github.io/redcairn/>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

## How it plays

1. **The opening.** Five illustrated plates, one true line each: it landed alone in 2012; it played itself "Happy Birthday" once; rock tore its wheels and it kept climbing; it photographed Earth as a point of light; fourteen years later, you land. *Go and find it.* Every plate is **drawn by Blender from the real elevation data** (`tools/blender_plates.py`): ink contour lines every 2 m of real height, flat tones, the team's rover and a suited figure standing at real waypoints. No AI images.
2. **The map.** Mars Trek tiles, Curiosity's whole 14-year line, and the three questions: where is it safe to step, what is worth stopping for, can I get home?
3. **The plan.** Slope for a spacesuit and three routes to the rover: rover-proven 5.3 km round trip (4 h 39), fastest 3.6 km, gentlest 3.7 km.
4. **Five cairns along its tracks, in a living illustration.** During the story the screen is the real 1 m ground drawn live in the plates' style: flat tones from the sun and the HiRISE photo, ink contour lines every 2 m of real height, the horizon drawn in ink by Blender from MOLA + HRSC (`tools/blender_horizon_ink.py`), and the data drawn the way a mapmaker draws it: hachures on ground that needs care, cross-hatching where it is too steep, stipple where hills shelter you from radiation, Curiosity's wheel tracks as a fine line. You, a suited figure, walk each leg behind the team's rover model at true scale. A paper caption card tells the moment; a key box says what is drawn. **Field map** opens the Mars Trek map with every layer and the cursor readout. At each cairn: one true moment from the mission, Curiosity's own photo from that spot, your air, the walk home and dose.
5. **Curiosity.** You reach it at its real position. Its newest raw image is fetched live from NASA. You can kneel at its torn wheel.
6. **The storm.** A simulated solar storm as you leave the rover. Three ways home drawn on the real terrain: the new line (35 min, 0.31 mSv), the way you came (57 min, 0.52 mSv), shelter behind a ridge (1.12 mSv; the best ridge blocks 10%).
7. **Home.** The three questions answered with your numbers, and its mission clock still ticking, years past its planned one Mars year.

Point anywhere on the map for coordinates and, on the site, elevation, slope for a suit and minutes to walk home. The panel shows only the layers that are on, with legends; **All 11 layers** opens the full set (optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth, computed). On the suit radio, Curiosity's real first post from Mars is marked *real*; the habitat and your partner EVA-2 are marked *imagined*.

## Why it looks like this

Most entries open as a dark dashboard. REDCAIRN opens as a story with a look of its own, and every picture in it is the real ground: the plates are Blender renders of the 1 m elevation model, the map is Mars Trek's own tiles, the 3D window is the HiRISE photo on the same elevation model. One story card, one map, one panel, one accent colour.

## The five resources we were given, and where each one shows up

| Resource | In REDCAIRN |
|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | The map is Mars Trek's own tiles (HiRISE, CTX, THEMIS, MOLA/HRSC, USGS geology); every height in the app (the walk's 1 m elevation model, the crater, the horizon) comes from Mars Trek services |
| [USGS planetary geologic mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | The **Rock units** layer on the map: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | The intro beat and the "Curiosity's whole climb" layer: the 38.6 km route that plan became; our walk is its 2025–26 stretch |
| [Worldview](https://worldview.earthdata.nasa.gov/) | Each cairn named after a place on Earth links to that place in Worldview |
| [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | "The other rover, today": Perseverance's newest raw image from Jezero crater, fetched live; the engine needs only an elevation model and a rover's photos |

## What is real and what is simulated

**Real:** the ground, its height and slope, the route (the rover's own track), the photographs, the rock findings, the weather report, the normal radiation rate and the measured effect of terrain on it, the water-mineral detections, the geologic units, and every date and figure about the machines. The 1 m elevation model agrees with the rover's own elevations to 1.65 m RMS along the 2.7 km route.

**Simulated, and labelled in the app:** the suit (air, battery, pace), you, the time compression of the walk, the solar storm (made 20 times stronger than the September 2017 event so the drill is easy to follow, and 2 h long for the shelter option), and the rocks smaller than a metre scattered for scale, since HiRISE cannot resolve them. The walk is at true scale; the Blender crater render in the intro stretches heights ×3.

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
