# Design QA

- Source visual truth: user-provided `assets/scoreboard-rock-full.png` and `assets/rock-wallpaper-user.png`, with `/Users/ricardoalfaro/Desktop/75480de6a100bae3984ba68883d2fbbe.jpg`, `/Users/ricardoalfaro/Desktop/pinball-rush-cuerpo.jpg` and `/Users/ricardoalfaro/Desktop/14603231056_e6ebe45a82_b.jpg` as physical-table references
- Active wallpaper: `assets/rock-wallpaper-user.png`
- Active scoreboard art: `assets/scoreboard-rock-full.png`
- Intended viewport: 390 x 844
- Intended state: active game after launch
- Implementation screenshot: unavailable; no in-app browser is connected to this session

**Findings**

- [P1] Production playfield background was missing
  - Location: full canvas playfield in the supplied iPhone captures.
  - Evidence: the canvas rendered against its black fallback while the chrome rails and game elements remained visible.
  - Impact: the primary rock artwork and visual hierarchy disappeared in production.
  - Fix: resolve the wallpaper through `new URL(..., import.meta.url)` so Vite fingerprints and emits it into the production bundle.
- [P1] Balls could jitter indefinitely behind either lower slingshot
  - Location: narrow cavities between each slingshot and its adjacent guide rails.
  - Evidence: supplied captures show the ball resting behind both the left and right sling assemblies.
  - Impact: the current speed-only ball search can reset continuously when collision jitter remains above its threshold.
  - Fix: detect residence in either cavity and apply a center/upward ball-search pulse after 0.85 seconds.
- [P1] Compact score was vertically and horizontally displaced
  - Location: top compact scoreboard.
  - Evidence: the supplied iPhone capture shows the DSEG digits touching the upper crop while the SCORE label shifts the combined row.
  - Impact: the main value is harder to read and does not sit inside the intended display aperture.
  - Fix: position label and digits independently and use the seven-segment font only for numeric displays.
- [P1] Rendered visual comparison is blocked
  - Location: full mobile playfield.
  - Evidence: both source references and the generated wallpaper were opened, but no browser-rendered implementation capture could be produced.
  - Impact: crop, visual density, ball contrast, glass reflections and touch-HUD overlap cannot be approved from source code or build output alone.
  - Fix: open the running game at 390 x 844, capture the active playfield, and compare it together with the two reference images.

**Required fidelity surfaces**

- Fonts and typography: not visually verified.
- Spacing and layout rhythm: not visually verified at 390 x 844.
- Colors and visual tokens: the supplied wallpaper establishes black, distressed gold, red, purple and cyan accents; rendered compositing remains unverified.
- Image quality and asset fidelity: supplied wallpaper is 941 x 1672; runtime crop and sharpness remain unverified.
- Copy and content: build-time inspection confirms scoring labels and controls are present; rendered legibility remains unverified.

**Full-view comparison evidence**

- Blocked because the implementation screenshot is unavailable.

**Focused region comparison evidence**

- Blocked for the same reason; bumper cluster, spinner, multiplier inserts, lower flippers and glass layer require focused captures.

**Implementation checklist**

- Capture the active game at 390 x 844.
- Check wallpaper crop and ball contrast.
- Check that seven bumpers, six targets, spinner and 2X-6X inserts read as separate layers.
- Check that the six new posts, transparent twin-rail ramp and 3x3 mission matrix increase density without hiding the ball.
- Check that the glass highlight does not hide the ball or scoring HUD.
- Check that the thick cabinet rails remain visible on all four sides without covering the plunger or flippers.
- Check that the enlarged amber scoreboard occupies its own top region and the shortened playfield remains proportional.
- Check that the supplied scoreboard artwork is visibly present behind the live score without making the digits hard to read.
- Long-press the plunger zone and confirm no context menu, text selection or drag UI appears.
- Launch at 100% power repeatedly and confirm the ball stays visible inside the table.
- Leave the ball in a dead spot and confirm ball search rescues it after 2.4 seconds.
- Fix any P0/P1/P2 differences and repeat the comparison.

**Comparison history**

- Initial pass: blocked before comparison because no browser implementation capture was available.
- Physics/edge pass: random launch deviation removed, maximum launch speed reduced to 1650 px/s, offscreen containment added, and a full metal cabinet frame added; rendered comparison remains blocked.
- Twilight Zone density pass: added six physical illuminated posts, a nine-insert mission matrix and a layered acrylic ramp with twin chrome rails; rendered comparison remains blocked.
- Scoreboard/ball-search pass: reserved 118 CSS pixels for a larger amber score display, recalculated the canvas from the remaining playfield dimensions, blocked context menus, and added automatic stuck-ball recovery; rendered comparison remains blocked.
- Supplied-scoreboard pass: integrated the exact provided image as the top scoreboard backdrop and strengthened long-press suppression with captured context/select/drag events plus non-passive touch handlers; rendered comparison remains blocked.
- Full-scoreboard pass: replaced the prior backdrop with the complete 1672 x 941 supplied artwork, added a locally bundled DSEG7 Classic display face, placed the live total in the main score aperture, placed remaining balls in the central BALLS aperture, and retained the compact-to-full scoring animation; rendered comparison remains blocked.
- Production screenshot repair pass: bundled the canvas wallpaper through Vite, separated word-capable digital typography from DSEG numeric typography, centered the compact score independently from its label, and added explicit left/right sling-pocket recovery; a fresh implementation capture remains required.

final result: blocked
