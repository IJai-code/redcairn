# REDCAIRN: pitch and demo script

Live: https://redcairn.netlify.app · Code: https://github.com/IJai-code/redcairn

## The one sentence

REDCAIRN turns what the machines on Mars left behind into the first trail a person can follow out, and follow home.

## The 30-second version

> Mars is full of machines that went quiet: Viking, Sojourner, Spirit, Opportunity, Phoenix, InSight, Ingenuity. Only Curiosity is still driving. For fourteen years it has climbed a mountain inside Gale crater, and every place it stopped became a record: where it stood, how steep it was, what the rock was made of.
>
> On Earth, hikers stack stones into cairns to mark the safe way for whoever comes next. REDCAIRN turns those records into cairns. It layers orbital imagery, elevation, geologic mapping, water minerals seen from orbit, rover ground truth and measured radiation into one guide that answers the three questions an astronaut on foot has: where is it safe to step, what is worth stopping for, and can I still get home?

## How it is built, in one breath

One scroll, three acts, one stage behind the words.

| Act | What you see | Made from |
|---|---|---|
| I · Remember | A true-colour Mars globe with every machine that went quiet | Viking colour mosaic (Mars Trek), stitched in Blender; mission records |
| II · Read the mountain | Gale crater in 3D, layer switches like Mars Trek, Curiosity's 38.6 km line drawing itself; then Mount Sharp's six rock layers | MOLA + HRSC elevation, Viking colour, USGS geologic map, CRISM + OMEGA water minerals, rendered in Blender through one camera; Curiosity odometry to sol 5,073 |
| III · Walk it | A 2.5D diorama of the real ground, five stops, the suit, the way home, a solar-storm drill | HiRISE 25 cm photograph and 1 m elevation model (Mars Trek), Curiosity's track, photos and radiation data |

## The 3-minute demo

Use the chapter buttons at the top (I, II, III) to jump. Scroll slowly; every scene changes on its own.

| Time | Do this | Say this |
|---|---|---|
| 0:00 | Open the site. Leave the first screen up. | "Mars is full of machines that went quiet. They left us a trail. This is the real colour of Mars, from the Viking orbiters." |
| 0:15 | Scroll to **Opportunity**. | "Built for ninety days. It stayed fourteen years, and a dust storm took it. Every one of these machines left a record. We built a walking guide out of those records." |
| 0:35 | Click **II · Read the mountain**. | "This is Gale crater, 154 km across, rendered in Blender from real elevation. The mountain in the middle rises 5,502 metres from the floor. We measured that from the data." |
| 0:50 | Scroll once: **Seen from space first**. Click **Height**, then **Rock units (USGS)**. | "Before any rover landed, two orbiters saw minerals that only form in water, the blue dots. The USGS geologic map shows the mountain as its own rock unit. Every layer is a separate Blender render through the same camera, so you can switch them like in Mars Trek and they line up exactly." |
| 1:15 | Scroll once: **That thin line is Curiosity**. Let the line draw. | "That line is fourteen years. 38.6 kilometres, 1,029 metres of climbing, and that is only 19% of the way up. The counter is the rover's own odometry, current to sol 5,073. The white bit at the end is our walk." |
| 1:40 | Click **III · Walk it**. Scroll to **Stop 2**. Toggle **Steepness** and **Radiation shelter**. | "Now we are on the ground: the real 25 cm orbital photo over the 1 m elevation model. Green is walkable in a suit, red is too steep. The route is the track the rover actually drove, and our elevation model agrees with the rover's own measurements to within a metre. This photo is what you will see standing here, taken by Curiosity from this spot." |
| 2:10 | Scroll to **The way home**. Click **Start the drill**. | "Every point on this map knows how long it takes to walk home. Now a solar storm hits; it is a simulated drill, and it says so. REDCAIRN draws a new white line home in an instant: 18 minutes instead of 32, and 45% less dose. Could you hide behind a hill? The best one here blocks 11%. Not enough. Go home." |
| 2:40 | Scroll to the end. Add a stone or two. Point at the Perseverance photo. | "Back at the rover with 4 hours 45 minutes of air left. You leave a stone for each machine that made the walk possible. And this picture is live: the newest frame from Perseverance, still working on the other side of Mars." |
| 2:55 | Stop. | "The rover could not come home. Its last job is to make sure you can." |

## Why this wins each criterion

**Impact.** Getting home is the first safety problem of any surface walk. Walk-back time as a map layer, a route proven by a rover, and a storm drill that re-plans the way home are things the regional mapping tools we were given do not do.

**Creativity.** The cairn idea: a rover's stops become trail markers for the humans who follow. The story starts with the machines that went quiet, so the guide carries their memory. The 14-year track draws itself with the rover's real odometry.

**Validity.** Nothing is typed in by hand. Every layer, height, track point, photo, mineral detection and geologic unit is fetched from public mission services by scripts in the repo (`tools/`), and Blender renders the 3D views from those same files. The elevation model is checked against rover ground truth (0.99 m RMS). Simulated values (suit, storm strength, walker) are labelled on screen.

**Relevance.** All five listed resources are visible in the product, each doing something real:

| Resource | Where it shows up |
|---|---|
| Mars Trek | Every map pixel and height: the colour globe, the 3D crater's elevation and relief, the water minerals, the 25 cm photo and 1 m elevation model of the walk |
| USGS planetary geologic mapping | The **Rock units (USGS)** layer on the 3D crater: Mount Sharp (Htu) inside the crater's impact unit (AHi) |
| Curiosity's proposed path up Mount Sharp | The 38.6 km line the plan became, drawn over the mountain it was planned for; the walk follows it through the sulfate unit |
| Worldview | Each stop named after a place on Earth opens that place in Worldview |
| Perseverance raw images | The last picture in the story: Perseverance's newest frame, fetched live |

**Presentation.** One story everyone can follow, told in plain words, with the data underneath it. Blender renders, a live demo, one line to close.

## Numbers to know cold

| Fact | Value |
|---|---|
| Gale crater | 154 km across |
| Mount Sharp, floor to summit (our measurement, MOLA + HRSC) | 5,502 m |
| Curiosity, as of sol 5,073 (Nov 2026) | 38.6 km driven, 1,029 m climbed, 19% of the mountain |
| Walk, one way | 1.52 km, +77 m |
| Stops | 5, plus the rover |
| Planned time outside | 3 h 21 min, on 8 hours of air |
| Walk home from the far end | 18 min |
| Storm drill | new line home: 18 min, 0.16 mSv; the way you came: 32 min, 0.30 mSv (45% less dose) |
| Best natural shelter on the site | blocks 11% of the dose |
| Elevation model vs rover | 0.99 m RMS |
| Normal radiation at Gale | 0.67 mSv per day (measured by Curiosity) |
| NASA career dose limit | 600 mSv (NASA-STD-3001, 2022) |

## Questions judges may ask

**"Is the radiation data real?"** The everyday dose rate and the effect of terrain shielding were measured by Curiosity's radiation detector. The storm is a simulated drill shaped on the September 2017 event and made twenty times stronger so the response is visible in a short demo. The app says so on screen.

**"Why Gale?"** It was proposed three times as a human exploration zone, orbiters found water minerals there, and it is the only place with a 1 m elevation model, 25 cm photographs, years of surface radiation data and a rover track on the same ground.

**"How did you use Blender?"** Headless scripts in `tools/` build the scenes from the data: `blender_globe.py` stitches the Viking colour globe, `blender_gale.py` builds Gale crater from the elevation model and renders each layer through one camera, then projects Curiosity's track and the mineral detections into the picture, and `blender_scene.py` builds the walk site's orbital photo and models. Re-run them and you get the same pictures from fresh data.

**"Would this work somewhere a rover has not been?"** The slope, shelter, routing and walk-home engine only needs an elevation model and a photograph. The rover track adds ground truth and photos. Jezero crater is the obvious next site.

**"What did AI do?"** AI assistants helped write code and data-retrieval scripts. The data, the site choice and every figure trace to public sources listed in the app's Sources & honesty panel.

**"What is not finished?"** Suit values are planning assumptions, not flight numbers. Orbital mineral maps are too coarse for a 1.5 km walk, so the rock at each stop comes from what the rover found on the ground.

## Closing line

> The rover could not come home. Its last job is to make sure you can.
