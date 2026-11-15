# REDCAIRN: your first walk on Mars

Land on Mars, suit up, and walk the first Marswalk through your own helmet, on the real ground of Gale crater, behind the rover that drove it first. About three minutes.

Live: <https://redcairn.netlify.app>

> Built for the 2026 NASA International Space Apps Challenge, *Interplanetary Survival Guide: Martian Map*. An independent student project, not affiliated with or endorsed by NASA or any space agency.

On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. On Mars, a rover already did that: every place Curiosity stopped is a cairn. REDCAIRN turns those stops, and the orbital data above them, into the map an astronaut carries: where it is safe to step, what is worth stopping for, and how to get home.

## How it plays

You are the astronaut. Everything after the cover is seen through your own eyes, and after the hatch, through your helmet.

| Moment | What happens | Built from |
|---|---|---|
| **Descent** | Through the lander window: Mars, then Gale crater in 3D; the lander computer overlays what orbit saw (water minerals, rock units) and Curiosity's 14-year track; touchdown on the real ground | Viking colour; MOLA + HRSC elevation; CRISM + OMEGA; USGS SIM 3292; Curiosity odometry to sol 5,073. Crater rendered in Blender, one camera per layer |
| **Suit up** | The visor boots. Each data source checks in (terrain, slope limits, radiation, weather, minerals, cairns) and you pick a route: rover-proven, fastest or gentlest | Routes computed in the browser on the HiRISE 1 m elevation model |
| **Outside** | First person, at true scale, on the real ground under the real horizon. The team's rover, wheels turning and body tilting with the terrain, leads you cairn to cairn; the visor draws the route, compass, air, walk-home time, dose and slope underfoot. At each cairn, Curiosity's own photo from that spot | HiRISE 33 cm photo on the 1 m elevation model; 360° horizon rendered in Blender from MOLA + HRSC; rover model converted in Blender; Curiosity Navcam |
| **Storm** | A simulated solar particle event. The visor draws a new line home and you choose: the new line, the way you came, or shelter behind a ridge, each costed on the real terrain | Curiosity RAD (Sept 2017 event ×20); 16-direction sky-shielding scan |
| **Home** | The helmet comes off. The rover drives on up the mountain, alone. Your time outside, air left, dose, and Perseverance's newest picture, live | Perseverance raw images |
| **Explore** | Every layer, free: slope, shelter, way home, rock, height, rover tracks; slide along the walk; tap a cairn | |

## Why it looks like this

Nothing on screen is a web page. The cover is one sentence. The descent is a lander window. After the hatch there is only the world and what a helmet visor would draw over it: a compass, four numbers, the route projected ahead, and one line of text at a time, like subtitles. The rover is the emotional thread: it drove this ground alone a year before you, its stops are your cairns, and at the end it drives on without you.

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
python3 tools/build_conditions.py     # REMS weather and hydrous minerals -> data/conditions.json
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
