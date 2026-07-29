---
name: catalyst-demo-video
description: Turn a raw screen recording of a Catalyst feature into a branded, sound-designed vertical demo video (intro type-beats → device-framed uncut footage → logo outro). Use when the user asks for a feature demo, product demo clip, or "another video like the preview demo" for Catalyst / Catalyst Companion.
---

# Catalyst feature-demo video

Produces the house-style demo: 1080x1920, ~30-35s, cream/ink Catalyst branding,
type-beat hook, the feature footage playing in a floating device frame with
synced SFX + composed music, logo end card.

**Workspace**: this skill operates inside the Catalyst social workspace, referred
to below as `$CATALYST_SOCIAL` (default `~/Documents/1mg/catalyst-social`; set the
env var to override). The proven reference build is
`$CATALYST_SOCIAL/videos/catalyst-preview-demo` (final render in its `renders/`);
treat it as the canonical example of every rule below. That workspace is not part
of this repository — if it is absent, say so and ask where the reference project
lives rather than guessing at the brand assets.

## Pipeline

1. **Route through /hyperframes first** (it is the mandatory entry point). A
   frozen recipe exists: `catalyst-feature-demo` (v1, general-video), stored in
   the reference project's `.media/recipes/`. Adopt it when offered — it locks
   destination/aspect/flow and the design spec.
2. **Scaffold**: `npx hyperframes init "videos/<feature>-demo" --non-interactive
   --example=blank` under `$CATALYST_SOCIAL`. Copy from the
   reference project: `frame.md` (brand truth — Catalyst-remixed preset),
   `assets/fonts/`, `assets/logo-light.svg`, `assets/vendor/gsap.min.js`.
3. **Probe the footage before promising anything**: `ffprobe` for size/duration,
   then extract a 1-per-second thumbnail strip (`crop`,`scale=110:-1`,`hstack`)
   and READ it. Map the real event timeline; never trust assumed timings.
   Screen recordings of the Android emulator: the phone screen is a tall crop —
   find it empirically with a test-crop frame (reference used
   `crop=460:1044:1058:132` on a 2560x1440 desktop capture). Trim trailing
   macOS UI leaks (Control Center etc.).
4. **Cut segments with held tails**: encode each with
   `-vf "crop=...,fps=30,tpad=stop_mode=clone:stop_duration=N"` so the last
   frame freezes instead of the clip vanishing; `-an -c:v libx264 -crf 18
   -pix_fmt yuv420p -movflags +faststart`. Cut ugly moments (ad interstitials)
   with trim+concat+`setpts=PTS/x` speed ramps — but ONLY if the user asked for
   an edited cut; the preferred house cut is intro + UNCUT footage + outro.
5. **Composition** (monolithic index.html, one paused GSAP timeline on
   `window.__timelines["main"]`): S1 hook 3s — three type-beats
   ("Your app." / "Real device." / "No build step." pattern) + violet ✱ spike;
   middle — footage in `.device-wrap` (rounded 28-30px, hairline border, soft
   shadow, `object-fit: cover`), static "✱ CATALYST <NAME>" SF-Mono kicker;
   outro ~3.6s — logo scale-in 0.88→1 back.out, name, tagline, mono URL.
   Every element that fades out at a clip boundary needs a `tl.set(...,
   {autoAlpha: 0}, boundary)` hard kill (lint enforces it). Never put CSS
   `transform: translateX(-50%)` on a GSAP-animated element — use
   `xPercent: -50` inside the tweens.
6. **Sound is synthesized locally with ffmpeg** (no providers needed).
   Reference scripts live in the reference project's public/ WAVs; the music
   generator pattern: 120bpm C–G–Am–F loop, five `aevalsrc` layers (kick 54Hz
   pow-decay, bass 8ths root notes + octave harmonic, pad triads with per-bar
   attack, 16th arp on chord tones, offbeat hats from `random(0)` noise), each
   band-limited (`lowpass`/`highpass`), `amix=normalize=0`, compressor, fades.
   NEVER ship a bare filtered pulse — it reads as white noise. SFX kit: thud
   (95Hz exp decay), whoosh (bandpassed pink noise fade in/out), tap (1.8kHz +
   600Hz clicks), switch (double transient), ding (880+1318+1760 bell), pop
   (520Hz blip), brand hit (70Hz thump + shimmer). Place each as its own
   `<audio>` element with unique id + track index 10+, synced to REAL on-screen
   events read off the thumbnail strip (event time + intro offset). BGM at
   `data-volume="0.4"`, duck to 0.25 under the outro.
7. **Verify like the reference did**: `npx hyperframes check` must pass; then
   `npx hyperframes snapshot --at <scene midpoints>` and READ the contact
   sheet — look specifically for: wrong footage segment under a caption (cut
   points drift), captions colliding with the device frame during punch-ins,
   overlays mispositioned vs. actual on-screen dialogs. After `npx hyperframes
   render`, extract a frame strip from the MP4 itself and read it; check the
   audio stream exists (`ffprobe`) and RMS is sane (~-20dB region).
8. Deliver the `renders/*.mp4` path + what each timespan shows. Offer one
   revision loop.

## Hard-won gotchas

- Root `data-duration` is read at compile time; scene clips must not overlap on
  the same `data-track-index`; videos/audio are direct children of root
  (never inside a timed wrapper) with motion on an UNTIMED wrapper div.
- `qrcode`/terminal scenes, dashboards, or any UI without footage: build them
  as native HyperFrames HTML (code-surface style from frame.md) instead of
  screen-recording them — crisper and editable.
- macOS screen-recording filenames contain U+202F narrow spaces — glob for
  them, never paste the literal path.
- If HeyGen/local audio providers are missing, the ffmpeg synthesis above is
  the fallback; state it in the delivery note.
