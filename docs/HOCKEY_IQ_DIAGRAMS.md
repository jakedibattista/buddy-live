# Hockey IQ Practice: Traditional Whiteboard Diagram Engine & Parser

This document outlines the architecture, layout specifications, and relative-coordinate parser implemented in `apps/buddy-live/src/components/IqVisualCard.tsx` to solve squashing, geometry inaccuracies, and layout rendering issues in the Hockey IQ Practice screen.

---

## 1. The Core Issues Addressed

Before these updates, the Hockey IQ visual diagrams suffered from three major limitations:

1. **Distorted Aspect Ratio (2:1 ViewBox)**:
   * The half-rink background was drawn using `viewBox="0 0 200 100"`. A real hockey rink's offensive zone is nearly square (~85 ft wide by 60–100 ft long). Rendering it twice as wide horizontally squashed crease paths and faceoff circles, making tactical positions look extremely wide and compressed.
   * On mobile displays and sidebars, fitting this wide 2:1 rectangle forced the browser to scale the container down significantly, leaving dead vertical margins.

2. **Reversed Rink Geometry**:
   * The center red line was drawn at `y=50` (top/middle) and the blue line was drawn at `y=85` (bottom/outer). This put the blue line *further* from the goal net (`y=5`) than the center line, reversing real-world rink logic.

3. **Brittle, Absolute NLP Parsing**:
   * String parsing mapped player and defender terms to hardcoded coordinates. If the player was parsed to the left wing (`x=50`), but the defender matched a default position (`x=130`), they were drawn on the completely opposite side of the ice, which destroyed the tactical meaning of the question.

---

## 2. Solution: The Traditional Dry-Erase Whiteboard

Instead of using heavy, sluggish AI-generated image plates at runtime (which add latency, cost, and load-time layout flashes), we completely restyled the deterministic SVG drawing layer into a **Tactile Dry-Erase Whiteboard** using pure CSS, SVG primitives, and custom SVG filters.

This mimics the exact whiteboard coaches carry on the bench and in locker rooms, utilizing a traditional four-color dry-erase theme: **White, Black, Red, and Blue**.

### A. Esthetic & Styling Specifications
* **Whiteboard Surface:** The card uses a clean, high-gloss white backdrop (`#fbfcfd`) framed by an aluminum metallic trim border (`border-4 border-zinc-400/80`) with high-contrast shadows.
* **Felt-Tip Marker Filter (`#marker`):** We added an inline SVG displacement map using `feTurbulence` and `feDisplacementMap` to distort vector lines slightly. This gives rink markings, borders, and marker letters a wavy, hand-drawn "felt-tip dry-erase marker" feel:
  ```xml
  <filter id="marker" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.4" xChannelSelector="R" yChannelSelector="G" />
  </filter>
  ```
* **Authentic Team Markers:**
  * **Active Player (Black Marker):** Slate/black circle (`stroke="#1e293b"`) with a bold **X** token, labeled with a highly visible `YOU` marker.
  * **Teammate (Blue Marker):** Blue circle (`stroke="#2563eb"`) with a bold **T** token representing offensive squad support.
  * **Defender (Red Marker):** Red circle (`stroke="#dc2626"`) with a bold **D** token representing defensive coverage.
  * **Goalie (Blue Marker):** Blue rectangle outline (`stroke="#2563eb"`) with a bold **G** token centered in the crease.

---

## 3. 1:1 Proportional Vertical Geometry

We aligned the viewport to a perfect `100x100` coordinate space. This is highly responsive, fitting mobile portrait cards and desktop splits seamlessly without squashed elements.

The half-rink markings are mapped in their true physical progression and traditional locker-room whiteboard colors from the end of the rink (top) to the center line (bottom):
* **Goal Net:** Drawn in slate-gray at top-center (`x=44 to 56`, `y=6 to 12`).
* **Goal Line (Red):** Solid red line drawn at `y=12` (`stroke="#ef4444"`).
* **Goal Crease (Blue):** Curved blue boundary peaking at `y=18` (`stroke="#2563eb"`) with a light blue fill (`#eff6ff`).
* **Faceoff Circles (Red):** Drawn on the left (`x=25`) and right (`x=75`) wings, centered at `y=35` with dashed red lines (`stroke="#ef4444"`) to mimic ice markings.
* **Faceoff Dots (Red):** Solid red dots drawn at circle centers.
* **Offensive Blue Line (Blue):** Solid blue marker boundary (`stroke="#2563eb"`) drawn at `y=75` separating the attack zone.
* **Center Red Line (Red):** Solid red marker line (`stroke="#ef4444"`) drawn at the very bottom (`y=99`) to ground the half-rink representation.

---

## 4. Upgraded Relative-Coordinate Parser

To ensure players and defenders remain in tight tactical proximity (avoiding the opposite-side-of-the-ice disconnect), we rewritten `parseDiagramPositions` to use **relative positioning rules** based on the active player's coordinates.

### Coordinates Hierarchy

1. **Player Position (`px`, `py`):**
   * Identified first from NLP keywords in the `diagram` description (e.g., *behind the net*, *left circle*, *point*, *slot*, etc.).
   * Defaults to high slot/breakaway zone (`x=50`, `y=55`).

2. **Goalie Position:**
   * Calculated relative to the goal net. If "goalie is way out" or "aggressive" is detected, goalie moves out of the crease to `y=25` (challenging). Otherwise, hugs the posts or stands centered at `y=13`.

3. **Relative Defender Placement (`dx`, `dy`):**
   * If a defender is present, their position is calculated directly from the player's coordinate variables (`px, py`):
     * *On your hip / left:* placed at `x = px - 11`, `y = py + 2`.
     * *On your right:* placed at `x = px + 11`, `y = py + 2`.
     * *Drops to block / shot block:* placed directly in front of the player on their shooting lane (`x = px`, `y = py - 12`).
     * *Closing / charging:* placed in pursuit path, checking if the player is far out at the point or deep in the slot.
     * *Fallback:* Wing-aware calculations prevent defenders from appearing on the opposite wing. If player is on the left wing (`px < 40`), defender guards the inside cut (`x = px + 16, y = py - 4`).

4. **Teammate Placement:**
   * Placed on the opposite wing (`x = px > 50 ? px - 35 : px + 35, y = py - 4`) to set up lateral cross-crease passes, or behind as a trailer (`x = px, y = py + 16`).

---

## 5. Whiteboard Tactical Indicators

To make scenarios feel alive and explain the "what would you do?" game context visually, the diagram engine renders dynamic dry-erase movement indicators:

* **Pass-Lane Target Indicator (Blue Pen):** If the description mentions a passing play (e.g., `"pass"`, `"saucer"`), the renderer automatically connects the player's **X** to the teammate's **T** with a blue dotted marker line (`stroke="#2563eb"`).
* **Skater Run Arrow (Black Pen):** If the scenario is a `"breakaway"`, the player's starting vector is shown running up the ice with a dashed black line and a black arrowhead pointing to their active coordinate.
* **Defender Slide Arrow (Red Pen):** If a defender is `"sliding"` or `"closing"`, a dashed red arrow shows their closing path towards the player, illustrating the speed and direction of defender pressure in real-time.

All arrows use customized SVG markers with felt-tip displacement filters, fitting the locker-room dry-erase aesthetic perfectly.
