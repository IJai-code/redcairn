# REDCAIRN: pitch and demo

Live: https://redcairn.netlify.app · Code: https://github.com/IJai-code/redcairn
Challenge: Interplanetary Survival Guide: Martian Map (NASA Space Apps 2026)

## The one sentence

A survival map for the first walk on Mars: it walks you, cairn by cairn, along the line Curiosity drove up Mount Sharp, on Mars Trek's own tiles, and answers where it is safe to step, what is worth stopping for, and whether you can get home.

## What judges need to get in 3 minutes

The judging guide scores Impact, Creativity, Validity, Relevance and Presentation, 1 to 5 each. The demo must be **a video of 30 seconds or less, or at most 7 slides**; longer demos are not eligible for global judging.

| Criterion | What proves it, on screen |
|---|---|
| Impact | The map knows the walk home from every point; when the Sun flares it draws three ways home on the real terrain and costs each in minutes and dose |
| Creativity | The rover that went first is the guide: its old stops are your cairns, each with one true moment from its mission and its own photo from that spot. Any cairn opens in 3D at true scale |
| Validity | Slope from a 1 m elevation model that matches the rover's own heights to 0.99 m; routes, time, air and dose computed live; simulated values labelled |
| Relevance | A real layered map on Mars Trek tiles: optical, topographic, thermal, spectral, geologic, chemical, radiation and ground-truth layers from Viking, Mars Global Surveyor, Mars Odyssey, Mars Express, MRO, Curiosity and Perseverance, plus NASA DONKI space weather; all five listed resources visible |
| Presentation | One card, one map, one panel. One beat at a time, a story anyone can follow, a rover you come to care about |

## 30-second video (the demo we submit)

| Time | Picture | Words (voice or caption) |
|---|---|---|
| 0:00 | Intro beat: Curiosity's 14-year line across Gale crater | "We're [team], for the Martian Map challenge. This is REDCAIRN: a survival map for the first walk on Mars." |
| 0:05 | Plan beat: slope turns the ground green, amber, red; tap Fastest, then Rover-proven | "Mars Trek's own tiles, at walking scale. Where is it safe to step in a spacesuit?" |
| 0:11 | Cairn 2: the map flies in, Curiosity's photo, the numbers | "The rover that drove here first is your guide. Its stops are your cairns." |
| 0:17 | See it from the ground: first person, the rover's wheels turning | "Any cairn, from the ground, at true scale." |
| 0:22 | Storm beat: three ways home drawn on the map | "When the Sun flares, the map already knows the way home." |
| 0:27 | Home beat | "It walked this ground alone, so you wouldn't have to." |

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
| 0:00 | Open the site | "That orange line is Curiosity: 38.6 km up Mount Sharp in fourteen years. The last 1.5 km will be the first walk a person takes on Mars. This map answers three questions for that walk." |
| 0:15 | **Begin** | "Where is it safe to step? Slope for a spacesuit from the 1 m elevation model. Three routes; the rover's is longer, but every metre has been driven." In the panel, tap **Night-time ground temperature** and **Rock units**: "Thermal, geologic, spectral, radiation: eight kinds of data from seven missions." |
| 0:50 | **Start at the rover**, then **Next** through the cairns | "At each cairn the map flies in and switches on the layer that matters there. One true moment from the rover's mission, its own photo from this spot, the Earth place it's named after in Worldview, and my air, the walk home and dose." |
| 1:30 | **See it from the ground** at a cairn | "The same stop in 3D at true scale: real ground, real horizon rendered in Blender, our rover. **Follow the rover on**, then **Back to the map**." |
| 2:00 | **Next** to the storm | "Solar storm, simulated at twenty times the September 2017 event. Three ways home, drawn on the real terrain. Shelter sounds right; the best ridge blocks 9%. Six times the dose. Go home." |
| 2:35 | **Go home** | "It walked this ground alone, so that you would not have to." |

Shortcuts: `#intro`, `#plan`, `#stop-0` to `#stop-5`, `#storm`, `#home`, `#ground-2` (a cairn in 3D), `#landing`, `#map` (free map). Press Space or Enter for the main button.

## Numbers to know cold

| Fact | Value |
|---|---|
| Gale crater | 154 km across; Mount Sharp 5,502 m floor to summit (our MOLA + HRSC measurement) |
| Curiosity, sol 5,073 (Nov 2026) | 38.6 km, 1,029 m climbed |
| Routes (round trip) | Rover-proven 3.0 km, 3 h 20 · Fastest 1.9 km, 2 h 56 · Gentlest 2.0 km, 2 h 57 |
| Storm from the turnaround | New line 18 min, 0.16 mSv · Way you came 32 min, 0.29 mSv · Shelter 2 h then home, 1.08 mSv |
| Best terrain shelter near the turnaround | blocks 9% of the dose (Curiosity measured 4% at Murray Buttes) |
| Horizon from the dock | 10° high to the east, where Mount Sharp's bulk rises 17 km away |
| Elevation model vs rover | 0.99 m RMS |
| Normal radiation at Gale | 0.67 mSv per day (Curiosity RAD) |
| NASA career dose limit | 600 mSv (NASA-STD-3001, 2022) |

## Questions judges may ask

**"Is the horizon real?"** In the 3D ground view, yes. Blender builds Gale crater at true scale from the Mars Trek MOLA + HRSC elevation under Viking colour, stands a camera 1.7 m above the dock and renders a 360° panorama. We checked it against the elevation data: the horizon is 10° high to the east, where Mount Sharp is.

**"Is the radiation real?"** The everyday rate and terrain shielding were measured by Curiosity. The storm is shaped on the September 2017 event and made 20 times stronger so the drill is visible; the screen says so.

**"What's simulated?"** The suit, you, the walk's time compression, the storm's strength, and small rocks scattered for scale (HiRISE can't see anything under about a metre).

**"How did you use Blender?"** Headless scripts in `tools/`: the colour globe, the crater layers through one camera with Curiosity's track projected into them, the 360° horizon, the site photo, and our rover model split into body and six wheels for the browser.

**"Would this work elsewhere?"** The engine needs an elevation model and a photo. Jezero, with Perseverance's track and photos, is next.

**"What did AI do?"** AI assistants helped write code and data scripts. The data, the site choice and every figure come from the public sources in Data & sources.
