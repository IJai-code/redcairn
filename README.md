# REDCAIRN: your first walk on Mars

A Marswalk guide for the first astronauts on Mars, layered from six missions' data on the real ground of Gale crater. You play it as the astronaut, in about three minutes.

Live: <https://redcairn.netlify.app>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. On Mars, a rover already did that: every place Curiosity stopped is a cairn. REDCAIRN turns those stops, and the orbital data above them, into the map an astronaut carries: where it is safe to step, what is worth stopping for, and how to get home.

## How it plays

| Phase | The device | What you do | Built from |
|---|---|---|---|
| **1 · Brief** | Habitat display | See Mars in true colour, then Gale crater in 3D. Switch layers like Mars Trek: true colour, height, USGS rock units, water minerals from orbit, Curiosity's track drawing itself over 14 years | Viking colour; MOLA + HRSC elevation and relief; USGS SIM 3292; CRISM + OMEGA; Curiosity odometry to sol 5,073. Crater rendered in Blender, one camera per layer |
| **2 · Plan** | Habitat display | Pick one of three routes through the same five stops: rover-proven, fastest or gentlest. Each shows its true time, distance and steepest slope | Routes computed in the browser on 146,034 cells of the HiRISE 1 m elevation model; suit pace simulated |
| **3 · Marswalk** | Helmet HUD | At each stop you see Curiosity's real photo from that spot, with air, walk-home time, dose, slope underfoot, bearing to the next cairn and a mini-map. Science tasks cost suit time | Curiosity Navcam images, HiRISE photo and elevation, Curiosity's science findings |
| **Storm** | Helmet HUD + map | A simulated solar particle event. Choose: a new line home, the way you came, or shelter behind a ridge. The cost of each is computed on the real terrain | Curiosity RAD (Sept 2017 event, ×20 for the drill), 16-direction sky-shielding scan |
| **4 · Debrief** | | Tasks done, time outside, dose against NASA's career limit, your storm call. Then explore every layer and scrub the walk freely | Perseverance's newest frame, fetched live |

## Why it looks like this

The challenge suggests looking at how NASA mapped other worlds. On the Moon, Apollo crews carried a **cuff checklist** on the wrist (spiral-bound, typewritten tasks and times) and planned with printed **traverse maps** of numbered stations. REDCAIRN is that kit rebuilt for Mars: every panel is a checklist page, the 3D map wears a printed map's collar (ticks, coordinates, a north arrow that turns with the camera), layers are ticked on a legend, and in the helmet the tasks sit on the checklist at your wrist while the visor glows with live numbers. International orange, typewriter and condensed type; no logos or agency branding.

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
js/app.js             the mission: brief, route planning, helmet HUD, storm, debrief
js/scene.js           three.js stage: the globe and the walk diorama
js/crater.js          the Blender-rendered crater, its layers and the drawn track
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
