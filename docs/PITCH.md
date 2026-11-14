# REDCAIRN — pitch and demo script

Live: https://redcairn.netlify.app · Code: https://github.com/IJai-code/redcairn

## The one sentence

REDCAIRN turns fourteen years of a rover's footsteps into the first trail on Mars a person can follow out and follow home.

## The 30-second version

> For fourteen years one rover climbed a Martian mountain alone, a few metres a day. Every place it stopped, it recorded where it stood, how far it tilted and what the rock was made of.
>
> On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. REDCAIRN turns the rover's stops into cairns. It fuses orbital imagery, a one-metre elevation model, rover ground truth and surface radiation data into one wrist-sized map that answers the only three questions an astronaut on foot has: where is it safe to step, what is worth stopping for, and can I still get home.

## The 3-minute demo

Rehearse this until it runs without looking at the script. Use playback speed ×240. Plan numbers are exactly what the app shows; the storm numbers depend on the moment you trigger it, so read them off the screen.

| Time | Do this | Say this |
|---|---|---|
| 0:00 | Open the site. Leave the briefing screen up. | "This is a real place: the boxwork ridges on lower Mount Sharp. The background is that ground, rendered in Blender from orbital data. The orange line is a walk nobody has taken yet." |
| 0:20 | Read the headline aloud, then click **Open the trail**. | "A rover walked this ground alone so that you would not have to." |
| 0:30 | Point at the map. Toggle **Slope** off and on. | "Every pixel is real orbital imagery at 64 cm. The colours are our slope analysis of 146,000 terrain cells: green is walkable in a suit, amber is caution, red is no-go. The route is not drawn by hand. It is the track the rover actually drove, and our slopes agree with the rover's own measurements to within one metre." |
| 0:55 | Click waypoint **2** (Monte Grande). Scroll the card. | "Each cairn is a real rover stop. This is what you will see at eye level, photographed from that exact spot. This is the terrain in 3D at true scale, with a 1.8 metre figure. Two drill holes ten metres apart; the team named the high one after Bolivia's tallest peak. 'Go big or go home,' they wrote." |
| 1:25 | Click the Worldview link, show Earth, come back. | "Every stop named for a place on Earth links back to that place from orbit. The crew is never far from home." |
| 1:40 | Switch route to **Fastest**, then back to **Proven**. | "Three routes: the rover-proven one, the fastest, the gentlest. The plan updates instantly: 3 kilometres round trip, 3 hours 21 minutes, 4 and a half hours of oxygen left at the dock." |
| 1:55 | Click **Start EVA**. Let it run to about MET 00:25. | "Now we walk it. Oxygen, battery, pace and radiation dose update with the slope under the crew's boots. This number is the one that matters: walk-back margin. How much oxygen is left after the walk home from exactly here." |
| 2:15 | Click **Solar particle event**. Pause on the alert. | "A solar storm hits. This is a simulated drill, and we label it that way. REDCAIRN recalculates the way home and puts the decision in front of the crew: return now, about seven minutes, almost no extra dose. Or continue the plan and take roughly twenty-five times more. It also checks whether any terrain could shelter them. Here the best ridge blocks 11 percent. Not enough. Go home." |
| 2:40 | Click **Execute return**. Watch the marker take the white line. | "One button. The safe way home was already marked." |
| 2:50 | Turn on **Walk-back time**. | "And that is the idea underneath all of it. Every point on this map knows how long it takes to walk home. That is what a cairn is for." |

## Why this wins each criterion

**Impact.** Getting home is the first safety problem of any surface walk. Walk-back margin is the constraint Apollo crews planned around, and the regional mapping tools we were given do not compute it.

**Creativity.** The cairn idea: a rover's stops become the trail markers for the humans who follow. Walk-back time as a map layer. Earth-namesake links for emotional grounding.

**Validity.** Nothing is typed in by hand. Route, elevations, slopes, photos and geologic units are pulled from public mission data by scripts in the repo, and the elevation model is validated against rover ground truth (0.99 m RMS). Simulated values are labelled everywhere.

**Relevance.** All five listed resources are used, each for something real:

| Resource | What it does in REDCAIRN |
|---|---|
| Mars Trek | Every map tile and every elevation value |
| USGS geologic mapping | The geologic unit shown on each stop (Htu) |
| Curiosity's proposed path up Mount Sharp | The plan this walk completes |
| Worldview | The layer-stack model, and the Earth-namesake links |
| Perseverance raw images | A live frame from the other rover, in the attribution panel |

**Presentation.** One story, one walk, one decision under pressure. Blender render to open, live demo in the middle, one line to close.

## Numbers to know cold

| Fact | Value |
|---|---|
| Route, one way | 1.52 km, +77 m climb |
| Stops | 6 (dock plus 5) |
| Planned EVA | 3 h 21 min, 3.03 km round trip |
| Steepest slope on route | 14.6°, just under the 15° caution limit |
| Terrain on the site | 88% safe, 5% caution, 7% no-go |
| Terrain cells analysed in the browser | 146,034 at 2 m |
| Elevation model vs rover | 0.99 m RMS |
| Background radiation at Gale | 0.67 mSv per day (measured) |
| Planned EVA dose | 0.09 mSv |
| Walk home from the far end | 18 min |
| Measured terrain shielding (Murray Buttes) | 4% dose reduction |

## Questions judges may ask

**"Is the radiation data real?"** The background dose rate and the terrain-shielding effect are measured by the rover's radiation detector. The storm is a simulated drill shaped on the September 2017 event and exaggerated twenty times so the response is visible in a short demo. The app says so on screen.

**"Why this site?"** Gale crater was proposed three times as a human exploration zone, and it is the only place with a one-metre elevation model, surface radiation measurements and a rover track on the same ground. The challenge brief itself names the boxwork on Mount Sharp.

**"Would this work somewhere a rover has not been?"** The slope, shielding, routing and walk-back engine only need an elevation model and imagery. The rover track adds ground truth and photos. The site is one data file, so Jezero crater is the next one to add.

**"What did AI do?"** AI assistants accelerated the code and the data-retrieval scripts. The data, the site choice rationale and every figure trace to public sources listed in the app's attribution panel.

**"What is not finished?"** Suit values are planning assumptions, not flight numbers. Orbital mineral maps are too coarse for a 1.5 km walk, so rock information comes from what the rover found on the ground.

## Closing line

> The rover could not come home. Its last job is to make sure you can.
