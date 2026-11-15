# REDCAIRN: pitch and demo

Live: https://ijai-code.github.io/redcairn/ · Code: https://github.com/IJai-code/redcairn
Challenge: Interplanetary Survival Guide: Martian Map (NASA Space Apps 2026)

## The one sentence

Curiosity has been alone on Mount Sharp since 2012: REDCAIRN is the survival map for the first person on Mars to walk its tracks, find it, and come home.

## What judges need to get in 3 minutes

| Criterion | What proves it, on screen |
|---|---|
| Impact | The map knows the walk home from every point (point anywhere: elevation, slope, minutes home); when the Sun flares it draws three ways home on the real terrain and costs each in minutes and dose |
| Creativity | A survival map with a destination and a character: the rover that went first. An opening film of illustrations drawn by Blender from the real elevation data, no AI images |
| Validity | 1 m elevation model checked against the rover's own heights (1.65 m RMS over 2.7 km); routes, air, dose computed live; simulated values and imagined radio lines labelled |
| Relevance | Mars Trek tiles and elevation, USGS geology, Curiosity's planned path and real track, Worldview, Perseverance raw images; eight kinds of data from seven missions; NASA DONKI space weather |
| Presentation | One true line per plate; one card, one map, one panel; a story anyone can follow |

## 30-second video (the demo we submit)

The full kit (shot list with links, voice-over, birthday audio, radio lines to record, how to record and edit) is in [`VIDEO.md`](VIDEO.md); stills are in `video/`.

## 7-slide version (if we choose slides)

1. **REDCAIRN: a survival map for the first walk on Mars.** Team, members, challenge. Screenshot: a cairn beat (map, photo, numbers).
2. **The problem.** Mars Trek and USGS maps are regional; a Marswalk is 1.5 km on foot. An astronaut needs slope, air, radiation and the way home at walking scale.
3. **The idea.** A rover drove this ground first. Its stops become the cairns you follow; the map tells the walk one beat at a time.
4. **The layers.** Optical, topographic, thermal, spectral, geologic, chemical, radiation, ground truth, from seven missions, on Mars Trek tiles.
5. **The cairns.** One true moment per stop, Curiosity's photo from that spot, the Earth namesake in Worldview, and air, walk home and dose. Inset: the 3D ground view.
6. **The storm.** 18 min on the new line vs 32 min the way you came vs 2 h behind a ridge: 0.16 vs 0.29 vs 1.08 mSv.
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
| Storm from the rover | New line 35 min, 0.31 mSv · Way you came 57 min, 0.52 mSv · Shelter 2 h then home, 1.12 mSv |
| Best terrain shelter | blocks 10% of the dose |
| Elevation model vs rover | 1.65 m RMS along the route |
| Normal radiation at Gale | 0.67 mSv per day (Curiosity RAD) |

## Questions judges may ask

**"Is the horizon real?"** Yes, in the 3D window and the ground view. Blender builds Gale crater at true scale from the Mars Trek MOLA + HRSC elevation under Viking colour, stands a camera 1.7 m above the dock and renders a 360° panorama. We checked it against the elevation data: the horizon is 10° high to the east, where Mount Sharp is.

**"Is the radiation real?"** The everyday rate and terrain shielding were measured by Curiosity. The storm is shaped on the September 2017 event and made 20 times stronger so the drill is visible; the screen says so.

**"What's simulated?"** The suit, you, the walk's time compression, the storm's strength, and small rocks scattered for scale (HiRISE can't see anything under about a metre).

**"How did you use Blender?"** Headless scripts in `tools/`: the opening's illustrated plates (the real elevation model drawn as ink contours and flat tones, with the rover and a suited figure at real waypoints), Mount Sharp in 3D through one camera with Curiosity's track projected into it (the intro), the 360° horizon behind the 3D window, the site photo the rover drives on, and our rover model split into body and six wheels so they turn in the browser.

**"Is that Curiosity in the window?"** It is our team's rover model, standing in for Curiosity, and the window says so. The ground, the horizon and the track it follows are real.

**"Would this work elsewhere?"** The engine needs an elevation model and a photo. Jezero, with Perseverance's track and photos, is next.

**"What did AI do?"** AI assistants helped write code and data scripts. The data, the site choice and every figure come from the public sources in the app's System architecture & data attribution panel.
