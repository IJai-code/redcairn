# REDCAIRN: Space Apps project page (copy into each field)

Field order matches the Space Apps project form. Replace `VIDEO_LINK` once the video is uploaded.

---

## Project name

REDCAIRN: Finding Curiosity

## Summary (≈ 200 words)

Could you walk 2.7 km across Mars to a rover that has been alone since 2012, and get home before the Sun turns on you? REDCAIRN is a layered, hyper-local Marswalk planning prototype. It helps explore three questions: what does the terrain model flag, what is worth stopping for, and can I get home? Its slope screen is not a safety certification.

You follow the last 2.7 km of Curiosity's real tracks on Mount Sharp, cairn by cairn, to the rover itself. Underneath is NASA data at walking scale. The 1 m HiRISE elevation model screens slope; Curiosity's RAD informs an illustrative radiation scenario. Eleven map layers cover optical, thermal, spectral, geologic and chemical data. The map computes a modeled walk-home field across 386,912 terrain patches in your browser.

Then a scenario replays Curiosity RAD's measurements from the real September 2017 solar particle event, and the map draws three modeled ways home. In this scenario, the new line is 0.05 mSv; the way you came is 0.08 mSv. These dose estimates are not operational guidance.

The same engine builds a second walk at Jezero from its own HiRISE terrain and imagery and Perseverance's traverse. Local MEDA weather readings are not integrated yet, so the Jezero display uses Gale REMS for context and Gale RAD for an illustrative radiation scenario. The app labels these sources and shows number provenance when tapped.

## Project demonstration

VIDEO_LINK (30 seconds)

## Project

https://ijai-code.github.io/redcairn/
Code: https://github.com/IJai-code/redcairn

## Project details

### What it does

A map for a Marswalk has to work at the scale of a person on foot, not an orbiter. REDCAIRN turns NASA's orbital and rover data into a plan you can walk:

- **What does the terrain model flag?** The 1 m elevation model classifies slope: below 15°, a 15–20° caution band, and above the 20° screen. This is not a human EVA safety clearance; the model cannot assess loose soil, small rocks, hidden edges, crew condition or suit limits. Three routes show rover-proven, fastest and gentlest terrain-model options. Point anywhere for elevation, modeled slope and route time home.
- **What is worth stopping for?** Five cairns at Curiosity's real stops. Each has one true moment from the mission, Curiosity's own Navcam photo from that spot, the rock it found there, and the place on Earth it is named after, shown in NASA Worldview.
- **Can I get home?** A simulated suit timeline (air, dose, time out) runs along each route, and the walk-home field covers 386,912 Gale terrain patches. A storm drill compares three modeled routes and their estimated time and dose.
- **Take the plan with you.** One click downloads the EVA plan as GeoJSON: the route, every stop with arrival time, air, dose and walk home, and the storm options, ready for QGIS or ArcGIS.

### Worked case: the real solar storm of September 2017

Curiosity's RAD measured the 10–11 September 2017 solar particle event at about 3× the normal dose rate (Zeitlin et al. 2018). REDCAIRN replays it as you stand beside the rover, 2.7 km from the hatch:

| Way home | Time to hatch | Storm dose |
|---|---|---|
| The map's new line, which leans on hill shelter | 35 min | **0.05 mSv** |
| The way you came | 57 min | 0.08 mSv |
| Shelter behind the best ridge for 2 h, then home | 2 h 51 min | 0.18 mSv |

In this model, the new line has 41% less estimated dose than the way you came. The terrain-shielding estimate is calibrated to Curiosity's Gale observations, including 4% measured shielding at Murray Buttes. This comparison is an illustrative scenario, not a recommendation for a real EVA. The whole Gale walk models 0.13 mSv and 3 h of air remaining; the career-limit percentage is context only, not a medical assessment.

### Same engine, two craters

| Site | Rover track walked | Walk | Elevation model vs rover reference heights |
|---|---|---|---|
| Gale crater, Mount Sharp | Curiosity, sols 4560–5073 | 2.71 km | 1.65 m RMS (573 points) |
| Jezero crater floor | Perseverance, sols 13–180 | 1.86 km | 0.41 m RMS (248 points) |

Gale uses 573 resampled rover-traverse elevations. Jezero pairs 248 route locations with nearby Perseverance waypoint elevations. Both RMS values remove the mean vertical datum offset first; the along-track comparisons do not validate every grid cell.

The second walk is built by the same scripts. It goes from where Perseverance landed, past where Ingenuity first flew, to Rochette, where it sealed its first rock cores for Earth. Its terrain comes from the Mars 2020 landing maps (1 m DTM, 25 cm HiRISE orthomosaic). Our scripts read just the walk's window out of these 1.8 GB and 3.4 GB files using HTTP range requests.

### How it works

- **Build (offline, reproducible).**
  - Python scripts in `tools/` (standard library only) fetch rover traverses and waypoints, elevation models, imagery, weather, space weather and geology. They clip and grid the data, and compare route elevations with rover reference heights.
  - Blender, run headless from scripts, draws the opening plates and the 360° ink horizon from the real elevation data.
- **In the browser (no server).**
  - A terrain engine computes slope classes and sky shelter (how much of the sky hills hide, which reduces radiation).
  - A Dijkstra router plans the three routes and computes the walk-home field.
  - A planning simulation estimates air, pace, dose and time; it does not certify routes or model all terrain hazards.
  - The map is Leaflet on live Mars Trek tiles; the ground view is three.js, an ink-drawn true-scale view of the real 1 m ground and HiRISE photo, set inside the real crater in 3D (MOLA + HRSC elevation, about 65 km across).
  - Sound is generated with Web Audio, with the team's recorded radio voices.
- **Live.**
  - Curiosity's and Perseverance's newest raw images.
  - The mission clocks (sols since landing).

### Why it matters

The first crew on Mars will plan walks against slope, life support and radiation, with the habitat as the only dependable shelter. REDCAIRN explores what a map like that could look like at walking scale. It is built from public planetary data; values and assumptions are exposed in the app. The terrain screen and simulated suit values are for research and education, not operational planning. The same engine builds two site-specific walks from elevation, imagery and rover tracks.

### What is real and what is simulated

**Real:**
- the ground, its height and slope (true scale)
- the routes' terrain and the rover tracks
- every photo
- the rock findings and the water minerals
- Gale's Curiosity RAD radiation observations and measured terrain-shielding observations
- the September 2017 storm's measured Gale peak, used in a staged scenario
- Gale's Curiosity REMS weather report
- every date and figure about the rovers

**Simulated, and labelled in the app:**
- the suit (air, pace)
- you
- the walk's time compression
- the storm's timing (it reaches you at the rover)
- route-time, suit-resource, dose and terrain-shielding estimates
- the use of Gale REMS weather and RAD radiation as context for the Jezero site; local MEDA data are not integrated
- rocks under 1 m scattered for scale

On the suit radio, Curiosity's first post from Mars is marked *real*; every other line is marked *imagined*.

### Tools

JavaScript (no framework, no build step), Leaflet, three.js, Web Audio, Python 3 (standard library), Blender 5 (headless, scripted), ffmpeg. Hosted on GitHub Pages.

## Use of artificial intelligence (AI)

AI coding assistants were used to speed up:
- scaffolding
- the data retrieval scripts
- code generation and review
- drafting text, which the team edited and fact-checked against the cited sources

No AI-generated images, video, music or voices are used:
- Blender drew every illustration from NASA elevation data.
- The score is synthesised in code.
- The team recorded the radio voices.
- The birthday tune is NASA Goddard's own 2013 recording.

No NASA logos or branding are used.

## NASA data

- Mars Trek: HiRISE, CTX, THEMIS night infrared, MOLA + HRSC colour height, and the Gale 1 m HiRISE DEM (ImageServer)
- MRO HiRISE 1 m DTM and 25 cm orthomosaic of Jezero (Mars 2020 Terrain Relative Navigation maps, USGS Astrogeology); MRO CTX orthomosaic of Jezero (Mars 2020 science team)
- Curiosity: traverse and waypoints (MMGIS), raw images (Navcam), REMS weather, RAD radiation (Hassler et al. 2014; Zeitlin et al. 2018), Mastcam image of Earth (PIA17936)
- Curiosity's proposed path up Mount Sharp
- Perseverance: traverse, waypoints and raw images; Ingenuity first-flight and rock-sample records
- NASA DONKI space weather (solar particle events)
- NASA Worldview (Earth namesakes of each cairn)
- NASA Goddard SVS 11331: SAM playing "Happy Birthday" (2013)
- MRO CRISM / Mars Express OMEGA hydrous mineral detections (via Mars Trek)

## Space agency partner and other data

- USGS SIM 3292, Geologic Map of Mars
- Mars Express HRSC (ESA/DLR/FU Berlin), within the MOLA + HRSC blend served by Mars Trek
- NASA-STD-3001 career radiation limit, used for the dose context

## Tags

#Mars #MarsTrek #Curiosity #Perseverance #HiRISE #EVA #SpaceWeather #Radiation #Navigation #Blender
