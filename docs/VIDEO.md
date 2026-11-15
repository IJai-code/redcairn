# REDCAIRN: the 30-second video kit

Everything you need to record the demo. The rule: **30 seconds or less**, or it is not eligible for global judging.
Stills of every shot are in `docs/video/` (1920×1080, rendered from the live build).

## The finished cut

`docs/video/redcairn-30s.mp4` is the finished cut: 30.0 s, 1920×1080, 30 fps, AAC audio at about −14 LUFS. Upload it as is.

| Time | Picture | Caption | Sound |
|---|---|---|---|
| 0:00–0:07 | Blender plates: Mount Sharp, the torn wheels, you at the hatch | "A rover landed alone, and began to climb." / "Sharp rock tore its wheels. It kept climbing." / "You land. Your first walk: find it, and come home." | NASA Goddard's 2013 recording of SAM playing "Happy Birthday" |
| 0:07–0:11 | The field map: HiRISE photo, slope for a suit, Curiosity's track, cursor readout | "Slope for a spacesuit, from NASA's 1 m elevation model. Point anywhere: height, slope, minutes to walk home." | Score in; radio: "Habitat to EVA-1 and EVA-2: route uploaded. Pick your line." |
| 0:11–0:13 | Tapping a number opens its source | "Tap it: what it is, how it's computed, which NASA data it comes from." | |
| 0:13–0:19 | Walking the tracks; reaching Curiosity at its real position | "You walk Curiosity's real tracks, at true scale." / "You found it." | Radio: "There it is. Fourteen years, and it's still working." |
| 0:19–0:25 | The real September 2017 storm: flash, three ways home, the new line | "The Sun flares. Three ways home…" / "The new line home: 41% less radiation than the way you came." | Drone; radio: "I'm with you. Your call." |
| 0:25–0:27 | Jezero: Perseverance's whole track on the crater photo | "Jezero, built from Perseverance's own maps. Checked against the rover: 0.41 m." | Score resolves |
| 0:27–0:30 | End card: plate 6, the line, the URL, the data credits | "It walked this ground alone, so you wouldn't have to." | Radio: "Both suits at the hatch. Welcome home." |

How it was made:
- **Picture.** Every app shot was recorded from the real site in Chrome (frame by frame, CDP screencast). The plates are the Blender renders.
- **Score.** Synthesised in code from sine partials, with no samples.
- **Voices.** The team's recordings, through a radio filter: band-pass, compression, soft clipping and a hiss bed.
- **AI.** No AI images, music or voices.

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
