# REDCAIRN: pitch and demo

Live: https://redcairn.netlify.app · Code: https://github.com/IJai-code/redcairn
Challenge: Interplanetary Survival Guide: Martian Map (NASA Space Apps 2026)

## The one sentence

Land on Mars, suit up, and walk the first Marswalk through your own helmet, on the real ground of Gale crater, behind the rover that drove it first.

## What judges need to get in 3 minutes

The judging guide scores Impact, Creativity, Validity, Relevance and Presentation, 1 to 5 each. The demo must be **a video of 30 seconds or less, or at most 7 slides**; longer demos are not eligible for global judging.

| Criterion | What proves it, on screen |
|---|---|
| Impact | The visor knows the walk home from every point and redraws it in an instant when the Sun flares |
| Creativity | The map is inside the helmet. You land, suit up, and follow the rover that went first; its old stops are your cairns |
| Validity | True-scale ground from a 1 m elevation model that matches the rover's own heights to 0.99 m; routes, slope, time, air and dose computed live; simulated values labelled |
| Relevance | Optical, topographic, spectral, geologic, radiation, atmospheric and chemical data from Viking, Mars Global Surveyor, Mars Express, MRO, Curiosity and Perseverance; all five listed resources used |
| Presentation | One line of text at a time, like subtitles; a story everyone can follow; a rover you come to care about |

## 30-second video (the demo we submit)

| Time | Picture | Words (voice or caption) |
|---|---|---|
| 0:00 | Cover, then the lander window over Mars | "We're [team], for the Martian Map challenge. This is REDCAIRN." |
| 0:04 | Gale crater: water minerals, then Curiosity's line drawing itself | "Six missions' data, layered on the real ground of Gale crater." |
| 0:10 | Touchdown, the visor booting line by line | "You land. Your helmet loads the map." |
| 0:15 | First person behind the rover, wheels turning; Curiosity's photo at a cairn | "The rover that drove here alone leads you. Its old stops are your cairns." |
| 0:22 | Visor turns red, the white line home | "When the Sun flares, the visor redraws the way home." |
| 0:27 | The rover drives on alone | "It walked this ground alone, so you wouldn't have to." |

## 7-slide version (if we choose slides)

1. **REDCAIRN: your first walk on Mars.** Team, members, challenge. Screenshot: first person behind the rover.
2. **The problem.** Mars Trek and USGS maps are regional; a Marswalk is 1.5 km on foot. Astronauts need slope, air, radiation and the way home at walking scale, while they walk.
3. **The idea.** Put the map inside the helmet. A rover drove this ground first; its stops become the cairns you follow.
4. **Descent and suit-up.** The lander window (orbit layers) and the visor boot (each data source checking in).
5. **The walk.** True-scale ground, the real horizon, the visor HUD, Curiosity's photo at each cairn.
6. **The storm.** 18 min on the new line vs 32 min the way you came vs 2 h behind a ridge: 0.16 vs 0.29 vs 1.08 mSv.
7. **The data.** List missions and data types (no logos): Viking (optical), MGS MOLA and Mars Express HRSC (topographic), MRO CRISM and Mars Express OMEGA (spectral), USGS (geologic), MRO HiRISE (optical, topographic), Curiosity (RAD radiation, REMS weather, rock chemistry, photos, track), Perseverance (live photo). Built with Blender and the browser. AI helped write code; data and figures are from the sources.

## The 3-minute live run

| Time | Click | Say |
|---|---|---|
| 0:00 | Open the site | "In a few minutes you'll be the first person to walk on Mars." |
| 0:05 | **Begin the descent** | "This is the lander window. Gale crater, rendered in Blender from real elevation. Orbit already found the water minerals; that's why we're here. That orange line is Curiosity: 38.6 km in fourteen years." |
| 0:30 | Touchdown; the visor boots | "Your helmet loads the map: terrain, slope limits, radiation, weather. Three routes: the rover's is longer, but every metre of it has been driven." |
| 0:45 | **Open the hatch** | "True scale, the real ground, the real horizon. Mount Sharp's slopes are where the elevation data says they are. And that is our rover; it drove this ground alone a year before you." |
| 1:00 | **Follow the rover** twice; drag to look around; tap **Slope** | "The visor draws the route and the cairns. Air, the walk home, dose, the slope under your boots. At each cairn: the photo Curiosity took from this exact spot." |
| 1:45 | Jump to the turnaround (or keep walking), **Collect, then turn for home** | "Solar storm, simulated, at twenty times the September 2017 event." |
| 2:00 | Pick **Shelter behind a ridge**, explain | "Shelter sounds right. The best ridge blocks 9%. Six times the dose. The visor already drew the answer: go home." |
| 2:30 | The ending | "It walked this ground alone, so that you would not have to. Curiosity is still out there, 810 m past our turnaround." |

Shortcuts: `#walk` starts outside the hatch, `#suit` at the visor boot, `#explore` on the free map. Press Space or Enter for the main button.

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

**"Is the horizon real?"** Yes. Blender builds Gale crater at true scale from the Mars Trek MOLA + HRSC elevation under Viking colour, stands a camera 1.7 m above the dock and renders a 360° panorama. We checked it against the elevation data: the horizon is 10° high to the east, where Mount Sharp is.

**"Is the radiation real?"** The everyday rate and terrain shielding were measured by Curiosity. The storm is shaped on the September 2017 event and made 20 times stronger so the drill is visible; the screen says so.

**"What's simulated?"** The suit, you, the walk's time compression, the storm's strength, and small rocks scattered for scale (HiRISE can't see anything under about a metre).

**"How did you use Blender?"** Headless scripts in `tools/`: the colour globe, the crater layers through one camera with Curiosity's track projected into them, the 360° horizon, the site photo, and our rover model split into body and six wheels for the browser.

**"Would this work elsewhere?"** The engine needs an elevation model and a photo. Jezero, with Perseverance's track and photos, is next.

**"What did AI do?"** AI assistants helped write code and data scripts. The data, the site choice and every figure come from the public sources in Data & sources.
