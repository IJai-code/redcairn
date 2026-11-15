# REDCAIRN: pitch and demo

Live: https://redcairn.netlify.app · Code: https://github.com/IJai-code/redcairn
Challenge: Interplanetary Survival Guide: Martian Map (NASA Space Apps 2026)

## The one sentence

REDCAIRN is the map the first Mars astronaut carries: six missions' data layered on the real ground of Gale crater, played as one Marswalk you can finish in three minutes.

## What judges must get in 3 minutes

The official judging guide scores Impact, Creativity, Validity, Relevance and Presentation, 1 to 5 each, and says the demo must be **a video of 30 seconds or less, or at most 7 slides**. Over-length demos are not eligible for global judging.

| Criterion | What proves it, on screen |
|---|---|
| Impact | Every point of the map knows the walk home; the storm drill shows the map re-planning a crew's way home in an instant |
| Creativity | You play the astronaut: habitat display → helmet HUD over the rover's real photo → a decision under a solar storm → debrief |
| Validity | Routes, slopes, time, air and dose computed live on 146,034 cells of a 1 m elevation model that matches the rover's own heights to 0.99 m; simulated values labelled |
| Relevance | Optical, topographic, spectral, geologic, radiation, atmospheric and chemical data from Viking, Mars Global Surveyor, Mars Express, MRO, Curiosity and Perseverance; all five listed resources visible |
| Presentation | One headline and one sentence per screen; a rover that walked the ground first as the emotional thread |

## 30-second video (the demo we submit)

| Time | Picture | Words (voice or caption) |
|---|---|---|
| 0:00 | Team name over the true-colour globe | "We're [team], for the Martian Map challenge." |
| 0:03 | Gale crater in 3D, layers switching: height, rock units, water dots | "This is REDCAIRN: six missions' data, layered on the real ground of Gale crater." |
| 0:09 | Curiosity's 14-year line drawing itself | "A rover tested this ground for fourteen years. Its stops become your cairns." |
| 0:14 | Route choice, then the helmet HUD over Curiosity's photo | "Plan the route, then walk it with a helmet display built on its real photos." |
| 0:21 | Storm alert, white line home | "When the Sun flares, the map redraws the way home: nearly half the radiation." |
| 0:27 | Debrief: "Home, with 4 h 41 min of air." | "The first person on Mars won't walk alone." |

## 7-slide version (if we choose slides)

1. **REDCAIRN: your first walk on Mars.** Team, members, challenge name. Gale crater render.
2. **The problem.** Mars Trek and USGS maps are regional; a Marswalk is 1.5 km. Astronauts need slope, air, radiation and the way home at walking scale.
3. **The idea.** A rover walked this ground first; its stops are the cairns. Screenshot: Curiosity's line over Mount Sharp.
4. **Plan.** Three routes with real time, slope and steep-ground metres. Screenshot.
5. **Walk.** The helmet HUD over Curiosity's photo from that spot. Screenshot.
6. **Survive.** The storm drill: 18 min home on the new line vs 31 min the way you came vs 2 h behind a ridge. Screenshot.
7. **The data.** Mission logos are not allowed; list missions and data types instead: Viking (optical), MGS MOLA and Mars Express HRSC (topographic), MRO CRISM and Mars Express OMEGA (spectral), USGS (geologic), MRO HiRISE (optical, topographic), Curiosity (RAD radiation, REMS weather, rock chemistry, photos), Perseverance (live photo). "Built with Blender and the browser. AI helped write code; data and figures are from the sources."

## The 3-minute live run

| Time | Click | Say |
|---|---|---|
| 0:00 | Open the site | "You are the first person to walk on Mars. Six missions mapped this ground before you." |
| 0:10 | **Begin the mission** | "Gale crater, rendered in Blender from real elevation. The mountain rises 5.5 km." |
| 0:25 | **Why here**, then tap **Height** and **Rock units** | "From orbit, two spectrometers found minerals that only form in water. Every layer is a separate render through the same camera, so they line up like in Mars Trek." |
| 0:45 | **Who went first** | "That line is Curiosity: 38.6 km in fourteen years, using its own odometry. The white end is our walk." |
| 1:00 | **Plan your walk**, tap each route | "Three routes through the same five stops. The fastest is 23 minutes quicker but crosses ground no rover has checked. Orbit can't see rocks smaller than a metre. The rover's track can. We take the rover's route." |
| 1:25 | **Suit up and go**, tick a task, **Walk to cairn 1**, **Walk to cairn 2** | "This is the helmet display: air, walk-home time, dose, the slope under your boots, the bearing to the next cairn. The picture is the rover's real photo from this exact spot. Every task costs suit time." |
| 2:05 | Jump ahead (address bar `#storm`) | "At the turnaround, a solar storm. Simulated, and labelled that way." |
| 2:15 | Pick **Shelter behind a ridge**, then say why it's wrong | "Shelter sounds right. The best ridge blocks 9% of the radiation. You'd take six times the dose. The map already knew: the rover is the shelter." |
| 2:40 | Debrief, then **Explore every layer** | "Home with air to spare. Curiosity is still out there, 810 m past our turnaround. It walked this ground alone so that you would not have to." |

Shortcuts for the demo: `#crater`, `#water`, `#rover`, `#plan`, `#walk`, `#storm`, `#debrief`, `#explore`.

## Numbers to know cold

| Fact | Value |
|---|---|
| Gale crater | 154 km across; Mount Sharp 5,502 m floor to summit (our MOLA + HRSC measurement) |
| Curiosity, sol 5,073 (Nov 2026) | 38.6 km, 1,029 m climbed |
| Routes (round trip) | Rover-proven 2.95 km, 3 h 24 min · Fastest 1.94 km, 3 h 01 min · Gentlest 2.03 km, 3 h 02 min |
| Storm from the turnaround | New line 18 min, 0.16 mSv · Way you came 31 min, 0.29 mSv · Shelter 2 h then home: 1.08 mSv |
| Best terrain shelter near the turnaround | blocks 9% of the dose (Curiosity measured 4% at Murray Buttes) |
| Elevation model vs rover | 0.99 m RMS |
| Normal radiation at Gale | 0.67 mSv per day (Curiosity RAD) |
| NASA career dose limit | 600 mSv (NASA-STD-3001, 2022) |

## Questions judges may ask

**"Is the radiation real?"** The everyday rate and terrain shielding were measured by Curiosity. The storm is shaped on the September 2017 event and made 20 times stronger so the drill is visible; the screen says so.

**"Why is the rover's route longer than the fastest?"** It is the real track, with every metre driven. The elevation model only resolves the ground to about a metre, so a computed shortcut can still hide rocks. Ground truth is worth 23 minutes.

**"How did you use Blender?"** Headless scripts in `tools/`: the colour globe, Gale crater rendered once per data layer through one camera with Curiosity's track and the mineral detections projected into it, and the walk site's ground photo.

**"Would this work elsewhere?"** The engine needs an elevation model and a photo. Jezero, with Perseverance's track and photos, is the next site.

**"What did AI do?"** AI assistants helped write code and data scripts. The data, the site choice and every figure come from the public sources in the Data & sources panel.
