# REDCAIRN: the 30-second video kit

Everything you need to record the demo. The rule: **30 seconds or less**, or it is not eligible for global judging.
Stills of every shot are in `docs/video/` (1920×1080, rendered from the live build).

## The arc

The opening film is most of the video. Let it play, then show the map doing its job.

| Time | Picture | On screen / voice-over |
|---|---|---|
| 0:00–0:04 | Plate 1, Mount Sharp (the opening, root URL) | **Audio:** the 2013 birthday tune, quiet. Caption on screen: "In August 2012, a rover landed alone in Gale crater…" |
| 0:04–0:08 | Plate 2, the rover at dusk | "On its first birthday, it played itself Happy Birthday. Once." |
| 0:08–0:11 | Plate 3, the wheels | "Sharp rock tore its wheels. It kept climbing." |
| 0:11–0:14 | Plate 4, Earth as a point of light | "One evening, it photographed Earth." |
| 0:14–0:18 | Plate 5, you at the hatch, then the map with the slope layer | **VO:** "Fourteen years later, you land. This map gets you to it: slope, air, radiation, the way home." |
| 0:18–0:24 | Walk to the rover in the 3D window (`#stop-5` → Follow its tracks); plate 6, "You found it." | **Radio (EVA-2):** "There it is. Fourteen years, and it's still working." |
| 0:24–0:28 | The storm: three ways home on the map | **VO:** "When the Sun flares, the map already knows the way home." |
| 0:28–0:30 | Home card | Caption: "It walked this ground alone, so you wouldn't have to." End card: **REDCAIRN · ijai-code.github.io/redcairn** |

## How to record (Mac)

1. Open **https://ijai-code.github.io/redcairn/** in Chrome. Press **Cmd+Ctrl+F** for full screen. Turn **Sound on** (top right) if you want the radio and motors.
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
| `03-habitat-clear.m4a` | Habitat | "Habitat to EVA-1, EVA-2: you are clear. Follow its tracks." |
| `04-eva2-slope.m4a` | EVA-2 (your partner, warm) | "Seventeen degrees. It made it on torn wheels. We'll make it on boots." |
| `05-eva2-line.m4a` | EVA-2 | "One boot on each side. Wet Mars behind us, dry Mars ahead." |
| `06-eva2-turnaround.m4a` | EVA-2 | "Turnaround. Leave something for whoever comes next." (at the last cairn) |
| `07-habitat-storm.m4a` | Habitat (urgent but steady) | "Habitat to EVA-1: solar particle event inbound. Leave the rover. Bring EVA-2 home." |
| `08-eva2-yourcall.m4a` | EVA-2 | "I'm with you. Your call." |
| `09-eva2-behind.m4a` | EVA-2 | "Right behind you." |
| `10-habitat-home.m4a` | Habitat | "Both suits at the hatch. Welcome home." |
| `11-eva2-found.m4a` | EVA-2 (quiet, moved) | "There it is. Fourteen years, and it's still working." |
| `12-habitat-camera.m4a` | Habitat | "Habitat to EVA-1: we see you on its camera. You're standing next to it." |

On screen, Curiosity's line is marked **real** (its first post from Mars, 6 August 2012); all the others say **imagined**. If you use an AI voice instead of a person, say so in the description.

## Submission checklist (before 23:59 tonight)

- [ ] Video ≤ 30 s, uploaded (Unlisted), link copied
- [ ] Project link: https://ijai-code.github.io/redcairn/ · code: https://github.com/IJai-code/redcairn
- [ ] Description: the one sentence from `docs/PITCH.md`, the five resources and how each is used (also in the app's **Architecture & data** panel)
- [ ] Data attribution and AI use: copy from the app's **System architecture & data attribution** panel
- [ ] No NASA logos anywhere (video end card included)
- [ ] Test the live site once on a phone and once on a laptop, with the cache cleared
