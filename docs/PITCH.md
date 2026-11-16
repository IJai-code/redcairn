# REDCAIRN: pitch and demo

Live: https://ijai-code.github.io/redcairn/ · Code: https://github.com/IJai-code/redcairn
Challenge: Interplanetary Survival Guide: Martian Map (NASA Space Apps 2026)

## The one sentence

Curiosity has been alone on Mount Sharp since 2012: REDCAIRN is the survival map for the first person on Mars to walk its tracks, find it, and come home.

## What judges need to get in 3 minutes

| Criterion | What proves it, on screen |
|---|---|
| Impact | The map exposes a modeled walk-home field across the terrain; the storm drill compares three return options by modeled time and dose |
| Creativity | A survival map with a destination and a character: the rover that went first. An opening film of illustrations drawn by Blender from the real elevation data, no AI images |
| Validity | The 1 m elevation models are compared with rover reference heights along each route (Gale 1.65 m RMS at 573 resampled track points; Jezero 0.41 m at 248 route locations paired with waypoint heights); slope thresholds are explicitly a screen, and suit/dose values are labeled as scenarios |
| Relevance | Mars Trek and USGS terrain, Curiosity and Perseverance tracks and images, orbital science layers, NASA DONKI space weather, and NASA Worldview; Jezero's Gale weather and radiation references are disclosed |
| Presentation | One true line per plate; one card, one map, one panel; a story anyone can follow |

## 30-second video (the demo we submit)

The full kit (shot list with links, voice-over, birthday audio, radio lines to record, how to record and edit) is in [`VIDEO.md`](VIDEO.md); stills are in `video/`.

## 7-slide version (if we choose slides)

1. **REDCAIRN: a survival map for the first walk on Mars.** Team, members, challenge. Screenshot: a cairn beat (map, photo, numbers).
2. **The problem.** Mars Trek and USGS maps are regional; a Marswalk is 1.5 km on foot. An astronaut needs slope, air, radiation and the way home at walking scale.
3. **The idea.** A rover drove this ground first. Its stops become the cairns you follow; the map tells the walk one beat at a time.
4. **The layers.** Optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth, from seven missions, on Mars Trek tiles.
5. **The cairns.** One true moment per stop, Curiosity's photo from that spot, the Earth namesake in Worldview, and air, walk home and dose. Inset: the 3D ground view.
6. **The storm.** The real September 2017 solar storm: 35 min on the new line vs 57 min the way you came vs 2 h behind a ridge: 0.05 vs 0.08 vs 0.18 mSv.
7. **The data.** List missions and data types (no logos): Viking (optical), MGS MOLA and Mars Express HRSC (topographic), Mars Odyssey THEMIS (thermal), MRO CRISM and Mars Express OMEGA (spectral), USGS (geologic), MRO HiRISE and CTX (optical, topographic), Curiosity (RAD radiation, REMS weather, rock chemistry, photos, track), NASA DONKI (space weather), Perseverance (live photo). Built with Blender and the browser. AI helped write code; data and figures are from the sources.

## The 3-minute live run

| Time | Click | Say |
|---|---|---|
| 0:00 | Open the site; let the opening play | "Every picture here is drawn by Blender from NASA's real elevation data. No AI images. Everything said is true." |
| 0:35 | **Begin** | "Curiosity has been alone on Mount Sharp for fourteen years. Your first walk on Mars: walk the last 2.7 km of its tracks, find it, come home." |
| 0:50 | Plan: point at the map | "Slope for a spacesuit from the 1 m elevation model. Point anywhere: elevation, slope, minutes home. Three routes; the rover's is longer, but every metre has been driven." |
| 1:20 | **Follow its tracks** through two cairns | "At each cairn, one true moment from the mission and Curiosity's own photo from that spot. The 3D window is the real ground, through your eyes." |
| 1:50 | Jump to `#stop-5`, then follow to the rover | "Its real latest position, sol 5,073. Its newest picture, fetched live. Kneel at its wheel: torn since 2013, still driving." |
| 2:20 | **Turn for home**: the storm | "A simulated solar storm as you leave. Three ways home on the real terrain. Shelter sounds right; the best ridge blocks 10%. The map already knew the way." |
| 2:45 | **Go home** | "It walked this ground alone, so that you would not have to." |

Shortcuts: the root URL plays the opening; `#intro`, `#plan`, `#stop-0` to `#stop-5` (cairns), `#stop-6` (Curiosity), `#storm`, `#home`, `#ground-2` (a cairn in first person), `#map` (free map). Press Space or Enter for the main button.

## Numbers to know cold

| Fact | Value |
|---|---|
| Curiosity, sol 5,073 (13 Nov 2026) | 38.6 km driven, 1,029 m climbed |
| The walk | hatch to the rover 2.7 km along its tracks; 5 cairns on the way |
| Routes (round trip) | Rover-proven 5.3 km, 4 h 39 · Fastest 3.6 km, 3 h 59 · Gentlest 3.7 km, 4 h 02 |
| Storm from the rover (real Sept 2017, ×3) | New line 35 min, 0.05 mSv · Way you came 57 min, 0.08 mSv · Shelter 2 h then home, 0.18 mSv |
| Best terrain shelter | blocks 10% of the dose |
| Gale elevation model vs rover reference heights | 1.65 m RMS at 573 resampled track points (datum offset removed) |
| Jezero elevation model vs rover reference heights | 0.41 m RMS at 248 route locations paired with nearby waypoint elevations |
| Normal radiation at Gale | 0.67 mSv per day (Curiosity RAD) |

## Questions judges may ask

**"Is the horizon real?"** Yes, in the 3D window and the ground view. Blender builds Gale crater at true scale from the Mars Trek MOLA + HRSC elevation under Viking colour, stands a camera 1.7 m above the dock and renders a 360° panorama. We checked it against the elevation data: the horizon is 10° high to the east, where Mount Sharp is.

**"Is the radiation real?"** Curiosity measured the Gale background rate and terrain shielding. Its RAD also measured the September 2017 solar particle event at Gale. The app stages a drill from that event; Jezero uses Gale RAD as an illustrative scenario proxy, not a local dose measurement.

**"What's simulated?"** Suit resources, pace, route time, dose and terrain shielding estimates, you, and the walk's time compression. The model does not resolve loose soil, small rocks, hidden edges, or crew and suit limits. Jezero MEDA weather data are not integrated in this build.

**"How did you use Blender?"** Headless scripts in `tools/`: the opening's illustrated plates (the real elevation model drawn as ink contours and flat tones, with the rover and a suited figure at real waypoints), Mount Sharp in 3D through one camera with Curiosity's track projected into it (the intro), the 360° horizon behind the 3D window, the site photo the rover drives on, and our rover model split into body and six wheels so they turn in the browser.

**"Is that Curiosity in the window?"** It is our team's rover model, standing in for Curiosity, and the window says so. The ground, the horizon and the track it follows are real.

**"Would this work elsewhere?"** The Jezero beta already uses its own 1 m elevation model, HiRISE imagery and Perseverance traverse. Local MEDA weather is not integrated yet; Jezero's weather display uses Gale REMS only as context.

**"What did AI do?"** AI assistants helped write code and data scripts. The data, the site choice and every figure come from the public sources in the app's System architecture & data attribution panel.
