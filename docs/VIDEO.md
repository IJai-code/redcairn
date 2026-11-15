# REDCAIRN: the 30-second video kit

Everything you need to record the demo. The rule: **30 seconds or less**, or it is not eligible for global judging.
Stills of every shot are in `docs/video/` (1920×1080, rendered from the live build).

## The arc

| Time | Picture (open this link) | On screen / voice-over |
|---|---|---|
| 0:00–0:05 | Black. Then fade into the intro: Mount Sharp in 3D with the line drawing itself. `…/#intro` (`docs/video/intro.png`) | **Audio:** the 2013 birthday tune. **Caption:** "In 2013, alone on Mars, a rover played itself Happy Birthday." |
| 0:05–0:12 | Press **Begin**: the slope map paints green, amber, red. Move the cursor along the route so the readout shows slope and minutes home. `…/#plan` (`plan.png`) | **VO:** "Fourteen years later, its tracks are the safest way up. Point anywhere: how steep, how far from home." |
| 0:12–0:20 | **Start at the rover**, then **Follow it to cairn 1**: the rover drives the leg in the 3D window while the marker moves on the map. The EVA-2 radio line arrives. `…/#stop-0` then Next (`stop-1.png`, `stop-2.png`) | **VO:** "The rover went first. Its stops are your cairns: its own photo, your air, your dose." |
| 0:20–0:26 | The storm: three ways home drawn on the terrain. Click **Take the new line** and watch the rover lead you home. `…/#storm` (`storm.png`) | **VO:** "When the Sun flares, the map already knows the way home." |
| 0:26–0:30 | Turnaround: the Earth photo, then **Add a stone to the cairn**. Cut to home: the rover drives off alone, the sol clock ticking. `…/#stop-5`, `…/#home` (`stop-5.png`, `home.png`) | **Caption:** "It walked this ground alone, so you wouldn't have to." End card: **REDCAIRN · redcairn.netlify.app** |

Keep the voice-over calm and slow; leave 1 second of silence before the last line.

## How to record (Mac)

1. Open **https://redcairn.netlify.app** in Chrome. Press **Cmd+Ctrl+F** for full screen. Turn **Sound on** (top right) if you want the radio and motors.
2. Close other tabs and set the window to 1920×1080 if you can (System Settings → Displays).
3. Press **Cmd+Shift+5**, choose **Record Entire Screen** (or a 1920×1080 selection), Options → Microphone: None. Record each shot as its own clip; it is easier to edit.
4. For each shot, paste the link from the table, wait 3 seconds for the map tiles to load, then do the action.
5. Edit in **iMovie** (or CapCut): drop the clips in order, trim to the times above, add the captions as titles, the birthday audio at the start and the voice-over on top. Total must be **≤ 30.0 s**.
6. Export **1080p MP4**. Upload to YouTube as **Unlisted** and put the link in the submission.

**Tip:** the 3D window drives faster than the 7-second slot. Record the full drive and speed it up 1.5–2× in the edit.

## The birthday audio

NASA published the tune. Download the video from **https://science.nasa.gov/resource/happy-birthday-curiosity/** and use the first 4 to 5 seconds of its audio. NASA media is generally free to use for education. Credit "NASA" in the end card or description, and do not use the NASA logo.

## Record the radio voices (about 10 minutes)

The app plays these through a radio filter when Sound is on. Ask two teammates: one reads the habitat, one reads EVA-2, and anyone reads Curiosity's line.
Record each line on its own in **Voice Memos** or **QuickTime → New Audio Recording**. Leave half a second of silence at each end. Save it with the exact file name below into `assets/audio/`, then commit and push.

| File | Voice | Line |
|---|---|---|
| `01-curiosity-landing.m4a` | Curiosity (excited, a little robotic) | "I'm safely on the surface of Mars. Gale Crater, I am in you!" |
| `02-habitat-route.m4a` | Habitat (calm controller) | "Habitat to EVA-1 and EVA-2: route uploaded. Pick your line." |
| `03-habitat-clear.m4a` | Habitat | "Habitat to EVA-1, EVA-2: you are clear. Follow the rover." |
| `04-eva2-slope.m4a` | EVA-2 (your partner, warm) | "Seventeen degrees. It made it on torn wheels. We'll make it on boots." |
| `05-eva2-line.m4a` | EVA-2 | "One boot on each side. Wet Mars behind us, dry Mars ahead." |
| `06-eva2-turnaround.m4a` | EVA-2 | "Turnaround. Leave something for whoever comes next." |
| `07-habitat-storm.m4a` | Habitat (urgent but steady) | "Habitat to EVA-1: solar particle event inbound. Bring EVA-2 home." |
| `08-eva2-yourcall.m4a` | EVA-2 | "I'm with you. Your call." |
| `09-eva2-behind.m4a` | EVA-2 | "Right behind you." |
| `10-habitat-home.m4a` | Habitat | "Both suits at the hatch. Welcome home." |

On screen, Curiosity's line is marked **real** (its first post from Mars, 6 August 2012); all the others say **imagined**. If you use an AI voice instead of a person, say so in the description.

## Submission checklist (before 23:59 tonight)

- [ ] Video ≤ 30 s, uploaded (Unlisted), link copied
- [ ] Project link: https://redcairn.netlify.app · code: https://github.com/IJai-code/redcairn
- [ ] Description: the one sentence from `docs/PITCH.md`, the five resources and how each is used (also in the app's **Architecture & data** panel)
- [ ] Data attribution and AI use: copy from the app's **System architecture & data attribution** panel
- [ ] No NASA logos anywhere (video end card included)
- [ ] Test the live site once on a phone and once on a laptop, with the cache cleared
