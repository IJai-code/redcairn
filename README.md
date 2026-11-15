# REDCAIRN: abandoned, but not forgotten

A walking guide for the first humans on Mars, made from what the machines that went quiet left behind.

Live: <https://redcairn.netlify.app>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. REDCAIRN turns the records of the Mars rovers and orbiters into cairns: a real 1.5 km walk on Mount Sharp in Gale crater, built from orbital imagery, elevation, geologic mapping, water minerals seen from orbit, Curiosity's track and photographs, and measured surface radiation. It answers the three questions an astronaut on foot has: where is it safe to step, what is worth stopping for, and can I still get home?

## The story, in three acts

| Act | What you see | Made from |
|---|---|---|
| **I · Remember** | A true-colour Mars globe and the eight machines that landed and went quiet (or, for Curiosity, kept driving) | Viking MDIM 2.1 colour mosaic, stitched in Blender; mission records |
| **II · Read the mountain** | Gale crater in 3D with layer switches (true colour, height, USGS rock units, water minerals from orbit, Curiosity's track); Curiosity's 38.6 km line drawing itself with its real odometry; Mount Sharp's six rock layers | MOLA + HRSC elevation and relief, Viking colour, USGS SIM 3292, CRISM + OMEGA detections, all rendered through one Blender camera; Curiosity traverse to sol 5,073 |
| **III · Walk it** | A 2.5D diorama of the real ground: five stops with the rover's own photos, six map layers, a suit readout, walk-home time everywhere, and a solar-storm drill that re-plans the way home | HiRISE photograph (~33 cm/px) on the HiRISE 1 m elevation model, Curiosity's track, raw images, REMS weather and RAD radiation |

## The five resources we were given, and where each one shows up

| Resource | In REDCAIRN |
|---|---|
| [Mars Trek](https://trek.nasa.gov/mars/) | Every map pixel and every height: the colour globe, the 3D crater, the water minerals, the walk's photo and 1 m elevation model |
| [USGS planetary geologic mapping](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars) | The **Rock units (USGS)** layer on the 3D crater: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| [Curiosity's proposed path up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/) | The 38.6 km route that plan became, drawn over the mountain; the walk follows it through the sulfate unit |
| [Worldview](https://worldview.earthdata.nasa.gov/) | Each stop named after a place on Earth links to that place in Worldview |
| [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/) | The last picture in the story: Perseverance's newest frame, fetched live |

## What is real and what is simulated

**Real:** the ground, its height and slope, the route (the rover's own track), the photographs, the rock findings, the weather report, the normal radiation rate and the measured effect of terrain on it, the water-mineral detections, the geologic units, and every date and figure about the machines. The 1 m elevation model agrees with the rover's own elevations to 0.99 m RMS along the route.

**Simulated, and labelled in the app:** the suit (air, battery, pace), the walker, the solar storm (made 20 times stronger than the September 2017 event so the drill is easy to follow), and the "how wet" line on the rock layers. Heights are stretched ×2 on the walk and ×3 on the crater, and the app says so.

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
python3 tools/build_conditions.py     # REMS weather and hydrous minerals -> data/conditions.json
python3 tools/build_gale.py           # Gale crater elevation, colour, relief, geology, minerals, full traverse -> art/gale/, data/gale.json
```

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python tools/blender_globe.py                    # Viking colour globe -> assets/img/mars-viking.jpg
$B -b --python tools/blender_gale.py                     # Gale crater layers + projected track -> assets/img/gale-wide-*.jpg, data/gale-view.json
$B -b --python tools/blender_scene.py -- --ortho-only    # tinted site photo -> assets/img/site-ortho.jpg
$B -b --python tools/blender_scene.py -- --rover path/to/rover.blend   # site and stop models, hero render
```

## Project layout

```
index.html            the page
css/styles.css        styles
js/app.js             the story: beats, suit, drill, sources panel
js/scene.js           three.js stage: the globe and the walk diorama
js/crater.js          the Blender-rendered crater, its layers and the drawn track
js/stack.js           Mount Sharp's six layers as an isometric stack
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
