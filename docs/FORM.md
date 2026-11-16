# Space Apps form: paste-ready answers

Paste each block into its field. Save Progress often. Tick **Agree to Terms and Conditions** and **Confirm All Work is Original** before **Submit for Judging**.

---

## Project Summary

**Project Name**

```
REDCAIRN: Finding Curiosity
```

(The form currently says "Project Surveyor". Use REDCAIRN: Finding Curiosity so the name matches the site, the video and the code.)

**Summary** (167 words, 944 characters; the limit is 1,500)

```
How would the first person on Mars plan a walk, and get home alive? REDCAIRN is a layered, walking-scale survival map built from NASA mission data. You follow the last 2.7 km of Curiosity's real tracks on Mount Sharp, cairn by cairn, to the rover itself, at true scale inside the real crater in 3D.

The map answers three questions. Where is it safe to step: slope screened from the 1 m HiRISE elevation model, with three routes. What is worth stopping for: five cairns at Curiosity's real stops, each with its own Navcam photo and finding. Can I get home: air, dose and minutes home computed for 386,912 patches of ground. Then the real September 2017 solar storm, measured by Curiosity's RAD, is replayed, and the map's new line home carries 41% less modeled dose than the way you came.

Every number shows its source when tapped, and the plan downloads as GeoJSON. The same engine builds a second walk at Jezero from Perseverance's own maps.
```

---

## Project Links

**Project Demonstration** (your YouTube link, set to Unlisted)

```
https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

**Project**

```
https://ijai-code.github.io/redcairn/
```

---

## Project Information

**Project Details** (rich text: paste, then make the four headings bold)

```
What it does
REDCAIRN is a survival map for the first crewed walk on Mars, at the scale of a person on foot. You walk the last 2.7 km of Curiosity's real tracks on Mount Sharp, Gale crater, to the rover's real position, and come home. A second walk at Jezero follows Perseverance's first tracks, past where Ingenuity first flew, to the first rock kept for Earth.

- Plan: slope for a spacesuit from the 1 m HiRISE elevation model (below 15°, a 15–20° caution band, above 20°). Three routes: rover-proven, fastest, gentlest. Point anywhere for elevation, slope and minutes to walk home.
- Walk: five cairns at Curiosity's real stops, each with one true moment from the mission, the rover's own Navcam photo from that spot, and the place on Earth it was named after (NASA Worldview).
- Survive: a planning timeline of air, dose and time. A storm drill replays the real September 2017 solar particle event at Curiosity RAD's measured peak (about 3× normal). The map draws three ways home on the real terrain: its new line 0.05 mSv, the way you came 0.08 mSv, shelter behind a ridge 0.18 mSv.
- Check and take it with you: tap any number for what it is, how it is computed and its source. The whole EVA plan downloads as GeoJSON for QGIS or ArcGIS.

How it works
Python scripts (standard library only) fetch and clip the public data: rover traverses and waypoints, 1 m elevation models, HiRISE imagery, weather, space weather and geology. For Jezero they read only the walk's window out of the 1.8 GB and 3.4 GB Mars 2020 landing maps, using HTTP range requests. Blender, run headless from scripts, draws every illustration from the real elevation data. In the browser, with no server, a terrain engine computes slope classes and sky shelter, and a Dijkstra router plans routes and the walk-home time for all 386,912 patches of ground. The map is Leaflet on live Mars Trek tiles. The 3D ground is three.js: the real 1 m ground and HiRISE photo drawn in ink, set inside the real crater in 3D (MOLA + HRSC elevation, about 65 km across).

Validity
Each elevation model is checked against the heights the rover itself measured on that ground: 1.65 m RMS at Gale (573 points), 0.41 m RMS at Jezero (248 points). The slope colours are a terrain screen, not an EVA safety clearance. The suit values are simulated and labelled. Jezero borrows Gale's REMS weather and RAD radiation as context, and says so.

Why it matters, and what we considered
The first crews will plan every walk against slope, life support and radiation, with the habitat as the only real shelter. REDCAIRN shows what that map could look like, built entirely from public data that exists today. It is honest about what it cannot see: rocks under 1 m, loose soil, and the suit and crew themselves. We designed it as a story so anyone can follow it: an opening film, a radio voice from the habitat, and a real rover waiting at the end.

Tools: JavaScript (no framework, no build step), Leaflet, three.js, Web Audio, Python 3, Blender 5, ffmpeg, GitHub Pages. Team: Ishaan Jha, Aayansh Raj, Vihaan Gupta, Namish Shrivastava. Code: https://github.com/IJai-code/redcairn
```

**Use of Super Intelligence (SI)**: select only these:

- Coding, Debugging, or Troubleshooting
- Writing or editing text (or the option closest to it, e.g. "Other Project-Related Tasks")

Do **not** select "Building SI/ML Into the Project": the app contains no AI model. If there is a free-text box, paste:

```
SI coding assistants were used for scaffolding, data-retrieval scripts, code generation and review, and to draft text that the team edited and fact-checked against the cited sources. No SI-generated images, video, music or voices: every illustration is drawn by Blender from NASA elevation data, the score is synthesised in code, and the radio voices were recorded by our team. No NASA logos or branding are used.
```

---

## NASA Data (Link Text → Link URL)

| Link Text | Link URL |
|---|---|
| NASA Mars Trek | https://trek.nasa.gov/mars/ |
| MRO HiRISE Gale Crater DEM, 1 m (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Gale_DEM_SMG_1m/ImageServer |
| MOLA + HRSC blended elevation (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_MOLA_blend200ppx_HRSC_DEM_clon0dd_200mpp_lzw/ImageServer |
| Curiosity's Proposed Path up Mount Sharp | https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/ |
| Curiosity traverse | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json |
| Curiosity waypoints | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json |
| Curiosity raw images | https://mars.nasa.gov/msl/multimedia/raw-images/ |
| Curiosity REMS weather | https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json |
| Curiosity RAD surface radiation (Hassler et al. 2014) | https://doi.org/10.1126/science.1244797 |
| RAD and the September 2017 solar particle event (Zeitlin et al. 2018) | https://doi.org/10.1029/2018GL077760 |
| Perseverance raw images | https://mars.nasa.gov/mars2020/multimedia/raw-images/ |
| Perseverance traverse | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json |
| Perseverance waypoints | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json |
| Mars 2020 HiRISE DTM and orthomosaic of Jezero (USGS) | https://doi.org/10.5066/P9QJDP48 |
| Ingenuity Mars Helicopter | https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/ |
| Mars rock samples (Perseverance) | https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ |
| NASA Worldview | https://worldview.earthdata.nasa.gov/ |
| NASA DONKI space weather | https://kauai.ccmc.gsfc.nasa.gov/DONKI/ |
| Hydrous minerals, CRISM and OMEGA (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Hydrous_Mineral_Detections_OMEGA_CRISM_clon0/MapServer |
| Earth seen from Mars, PIA17936 | https://science.nasa.gov/resource/bright-evening-star-seen-from-mars-is-earth/ |
| Curiosity's first-anniversary SAM demonstration (NASA Goddard SVS 11331) | https://svs.gsfc.nasa.gov/11331/ |

## Space Agency Partner & Other Data

| Link Text | Link URL |
|---|---|
| USGS Geologic Map of Mars, SIM 3292 | https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars |
| Mars 2020 CTX orthomosaic of Jezero (Mangold et al. 2021) | https://doi.org/10.1126/science.abl4051 |
| Leaflet (map library) | https://leafletjs.com/ |
| three.js (3D library) | https://threejs.org/ |
| Blender (illustrations and plates) | https://www.blender.org/ |
| Project source code | https://github.com/IJai-code/redcairn |
