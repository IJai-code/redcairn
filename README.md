# REDCAIRN: a survival map for the first walk on Mars

A layered survival map for the first walk on Mars. It walks you, cairn by cairn, along the line Curiosity drove up Mount Sharp, on Mars Trek's own tiles, and answers three questions: where is it safe to step, what is worth stopping for, and can I get home? Beside the map, a 3D window follows a rover across the real ground as it drives from cairn to cairn. About three minutes.

Live: <https://redcairn.netlify.app>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. On Mars, a rover already did that: every place Curiosity stopped is a cairn. REDCAIRN turns those stops, and the orbital data above them, into the map an astronaut carries.

## How it plays: map first, walk second

The map is the product. A story card on the left tells the walk one beat at a time and moves the map with it. At the top of the card, a 3D window shows the same moment on the ground: our rover, standing in for Curiosity, on the HiRISE photo draped over the 1 m elevation model at true scale, under Mount Sharp. When you press next, the rover drives the leg in the window while its marker moves along the map. The panel on the right holds every layer and today's conditions. Wherever the cursor is on the map, a readout gives the latitude and longitude and, on the walk site, the elevation, the slope for a suit, and the minutes to walk home from there. During the story the panel shows only the layers that are on, with what their colours mean; **All 11 layers** opens the full legend. Ten beats, about three minutes, then the map is yours. The bar across the top jumps to Plan, Walk, Storm or Home.

| Beat | On the map | Built from |
|---|---|---|
| **Intro** | Curiosity's whole 14-year line across Gale crater, and the three questions. The window: Mount Sharp rendered in 3D in Blender, with the line drawing itself up its flank and the water minerals seen from orbit | Mars Trek tiles (CTX, HiRISE); MOLA + HRSC elevation and Viking colour, rendered in Blender; CRISM + OMEGA; Curiosity traverse to sol 5,073 |
| **Plan** | Slope for a spacesuit (green safe, amber care, red over 20°) and three routes to the same five cairns: rover-proven, fastest, gentlest, each timed and costed | HiRISE 1 m elevation via Mars Trek; routes computed in the browser |
| **The dock + five cairns** | The map flies to each stop and switches on the layer that matters there. One true moment from the rover's mission, Curiosity's own photo from that spot, its Earth namesake in Worldview, and your air, walk home, dose and time out | Curiosity Navcam and mission blog; NASA Worldview; suit timeline (simulated). The window: the rover drives each leg and the cairn rises when it arrives |
| **Storm** | A simulated solar storm at the turnaround. The map draws three ways home on the real terrain (the new line, the way you came, shelter behind a ridge) over the terrain-shielding layer; you choose, see the dose, and follow the rover home on that line in the window | Curiosity RAD (Sept 2017 event ×20); 16-direction sky-shielding scan |
| **Home** | The three questions answered with your numbers. In the window, the rover turns away and drives on up its own track, alone | Curiosity's track beyond the walk |
| **See it from the ground** | A button on the window at any stop: first person at true scale, under the real horizon, beside the team's rover (wheels turning, body tilting to the ground), with the same data on a helmet visor. Follow the rover to the next cairn, or go back to the map | HiRISE photo on the 1 m elevation model; 360° horizon and rover prepared in Blender |

The right-hand panel groups every layer by kind of data (optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth, computed) with its mission, and shows today's REMS weather, the RAD radiation rate, NASA DONKI space weather, and Perseverance's newest raw image under "The other rover, today". On a phone the story card sits at the bottom and the panel opens from a Layers button.

## The people in it

- **Curiosity speaks first, in its own words.** Its first post from Mars ("I'm safely on the surface of Mars. GALE CRATER I AM IN YOU!!!", 6 August 2012) arrives on the suit radio, dated and marked *real*.
- **You walk with a partner.** EVA-2 and the habitat talk to you on the radio; every one of their lines is marked *imagined*. Type your name at the start and the habitat says it when you get home.
- **True moments carry the feeling.** At cairn 1, Curiosity's wheels have been torn since 2013 and it climbed anyway. At the turnaround, the real Mastcam picture of Earth as the evening star from Gale crater (sol 529). At home, its 2013 "Happy Birthday" played alone by its sample lab, and its mission clock ticking, years past its one-Mars-year plan.
- **One act of care.** At the turnaround you add a stone to the cairn for whoever walks next. It stays there on your next visit.

Recorded voices for the radio go in `assets/audio/` (names and lines in `docs/VIDEO.md`).

## Why it looks like this

One story card, one map, one panel. The 3D stays low and close, where the HiRISE ground looks real; from high up the site is only a narrow strip, so the map does the overview and the window does the ground. The card says one thing per beat: a moment from the rover's mission, in the team's own words where we have them. The rover is the emotional thread: it drove this ground alone a year before you, its stops are your cairns, and it is still out there, climbing.

## The five resources we were given, and where each one shows up

| Resource | In REDCAIRN |
|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | The map is Mars Trek's own tiles (HiRISE, CTX, THEMIS, MOLA/HRSC, USGS geology); every height in the app (the walk's 1 m elevation model, the crater, the horizon) comes from Mars Trek services |
| [USGS planetary geologic mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | The **Rock units** layer on the map: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | The intro beat and the "Curiosity's whole climb" layer: the 38.6 km route that plan became; our walk is its 2025–26 stretch |
| [Worldview](https://worldview.earthdata.nasa.gov/) | Each cairn named after a place on Earth links to that place in Worldview |
| [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | "The other rover, today": Perseverance's newest raw image from Jezero crater, fetched live; the engine needs only an elevation model and a rover's photos |

## What is real and what is simulated

**Real:** the ground, its height and slope, the route (the rover's own track), the photographs, the rock findings, the weather report, the normal radiation rate and the measured effect of terrain on it, the water-mineral detections, the geologic units, and every date and figure about the machines. The 1 m elevation model agrees with the rover's own elevations to 0.99 m RMS along the route.

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
