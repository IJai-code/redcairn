# REDCAIRN: Space Apps project page (copy into each field)

Field order matches the Space Apps project form. Replace `VIDEO_LINK` once the video is uploaded.

---

## Project name

REDCAIRN: Finding Curiosity

## Summary (≈ 200 words)

Could you walk 2.7 km across Mars to a rover that has been alone since 2012, and get home before the Sun turns on you? REDCAIRN is a layered, hyper-local survival map for the first crewed Marswalk. It answers the three questions an astronaut has to settle before stepping out: where is it safe to step, what is worth stopping for, and can I get home?

You follow the last 2.7 km of Curiosity's real tracks on Mount Sharp, cairn by cairn, to the rover itself. Underneath is NASA data at walking scale. The 1 m HiRISE elevation model gives slope for a spacesuit. Curiosity's RAD gives the radiation rate, with the terrain's own shelter. Eleven Mars Trek layers cover optical, thermal, spectral, geologic and chemical data. The map also knows the walk home from each of 386,912 patches of ground, computed in your browser in about 0.2 seconds.

Then the real September 2017 solar storm arrives, and the map has already drawn three ways home. The new line takes 0.05 mSv; the way you came takes 0.08 mSv.

The same engine builds a second crater, Jezero, from Perseverance's own maps. Every number shows its source when you tap it.

## Project demonstration

VIDEO_LINK (30 seconds)

## Project

https://ijai-code.github.io/redcairn/
Judge Mode, a 90-second hands-free tour labelled by criterion: https://ijai-code.github.io/redcairn/#judge
Code: https://github.com/IJai-code/redcairn

## Project details

### What it does

A map for a Marswalk has to work at the scale of a person on foot, not an orbiter. REDCAIRN turns NASA's orbital and rover data into a plan you can walk:

- **Where is it safe to step?** Slope for a spacesuit comes from the 1 m HiRISE elevation model: green for safe, amber for 15–20° and needing care, red for over 20° and too steep. There are three routes to the rover: rover-proven (every metre already driven), fastest and gentlest. Point anywhere on the map for elevation, slope and minutes to walk home.
- **What is worth stopping for?** Five cairns at Curiosity's real stops. Each has one true moment from the mission, Curiosity's own Navcam photo from that spot, the rock it found there, and the place on Earth it is named after, shown in NASA Worldview.
- **Can I get home?** A suit timeline (air, dose, time out) runs at every step, and the walk-home field covers all 386,912 patches of ground. When the Sun flares, the map draws three ways home on the real terrain and costs each one.

### Worked case: the real solar storm of September 2017

Curiosity's RAD measured the 10–11 September 2017 solar particle event at about 3× the normal dose rate (Zeitlin et al. 2018). REDCAIRN replays it as you stand beside the rover, 2.7 km from the hatch:

| Way home | Time to hatch | Storm dose |
|---|---|---|
| The map's new line, which leans on hill shelter | 35 min | **0.05 mSv** |
| The way you came | 57 min | 0.08 mSv |
| Shelter behind the best ridge for 2 h, then home | 2 h 51 min | 0.18 mSv |

The new line takes 41% less dose than the way you came. Sheltering loses, because a ridge hides only 10% of the sky here; Curiosity measured just 4% shielding at Murray Buttes. On Mars, the best shelter is the habitat, so the fastest safe way home wins. The whole walk costs 0.13 mSv, 0.02% of NASA's career limit, with 3 h of air to spare.

### Same engine, two craters

| Site | Rover track walked | Walk | Elevation model vs the rover's own heights |
|---|---|---|---|
| Gale crater, Mount Sharp | Curiosity, sols 4560–5073 | 2.71 km | 1.65 m RMS (573 points) |
| Jezero crater floor (beta) | Perseverance, sols 13–180 | 1.86 km | 0.41 m RMS (248 points) |

The second walk is built by the same scripts. It goes from where Perseverance landed, past where Ingenuity first flew, to Rochette, where it sealed its first rock cores for Earth. Its terrain comes from the Mars 2020 landing maps (1 m DTM, 25 cm HiRISE orthomosaic). Our scripts read just the walk's window out of these 1.8 GB and 3.4 GB files using HTTP range requests.

### How it works

- **Build (offline, reproducible).**
  - Python scripts in `tools/` (standard library only) fetch the rover traverses and waypoints, the 1 m elevation models, imagery, weather, space weather and geology. They clip and grid the data, and check every elevation model against the rover's own heights.
  - Blender, run headless from scripts, draws the opening plates and the 360° ink horizon from the real elevation data.
- **In the browser (no server).**
  - A terrain engine computes slope classes and sky shelter (how much of the sky hills hide, which reduces radiation).
  - A Dijkstra router plans the three routes and computes the walk-home field.
  - A suit simulation tracks air, dose and time.
  - The map is Leaflet on live Mars Trek tiles; the ground view is three.js, an ink-drawn true-scale view of the real 1 m ground.
  - Sound is generated with Web Audio, with the team's recorded radio voices.
- **Live.**
  - Curiosity's and Perseverance's newest raw images.
  - The mission clocks (sols since landing).

### Why it matters

The first crew on Mars will plan every walk against slope, air and radiation, with the habitat as the only real shelter. REDCAIRN shows what that map looks like at walking scale. It is built entirely from public data a crew could have today, and its numbers can be checked: tap any of them for what it is, how it is computed and its source. Nothing is hand-tuned to one site: give it an elevation model, a photo and a rover's track, and it builds the walk.

### What is real and what is simulated

**Real:**
- the ground, its height and slope (true scale)
- the routes' terrain and the rover tracks
- every photo
- the rock findings and the water minerals
- the radiation rate and the measured effect of terrain on it
- the September 2017 storm's measured peak
- the weather report
- every date and figure about the rovers

**Simulated, and labelled in the app:**
- the suit (air, pace)
- you
- the walk's time compression
- the storm's timing (it reaches you at the rover)
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
