# Video / helm verification — 2026-09-21

## Actual upstream test

Local credentials are held in ignored `.env.local`, with server-side `LITELLM_KEY` (not a VITE-prefixed browser secret).

The Forgeax `minimax-h3-max` route rejected multipart `input_reference` with HTTP 500, explicitly requiring a nonempty `first_frame` public URL, mm_file URL, or supported data URI.

Changed the request to JSON with `first_frame` containing the PNG captured from the live authored scene. One corrected generation succeeded: 4,415,275 bytes, browser decoded 1088 × 768. This proves submission, polling, download and decoding; it is not a guarantee of artistic fidelity or immediate generation latency.

`tools/video-live-check.mjs` performs a real, potentially billable single request. Do not include it in automatic regression loops.
`tools/shutter-keyframe-check.mjs` intercepts network requests and verifies the frozen exposure frame and JSON payload without charging.

Offline / failed generation keeps playable local footage, but explicitly identifies it as local and not generated video. Server-side dev proxy is not a production backend.

## Helm

New Three.js console separates enclosure, inset panels, controls, guards, bezels, fasteners, joystick boot and grip. Fixed seated eye position remains unchanged when looking down.
Independent screenshot review is separate from interaction verification; no AAA certification or blind-test claim is made.
