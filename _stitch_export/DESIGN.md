# Design System Specification: The Tropical Sanctuary

## 1. Overview & Creative North Star
**Creative North Star: "The Sun-Drenched Veranda"**

This design system rejects the cold, sterile efficiency of modern SaaS in favor of a "warm-editorial" experience. It mimics the feeling of a hand-crafted journal discovered in a beachside villa—tactile, layered, and deeply human. We achieve this by breaking the rigid digital grid with organic overlaps, asymmetric "floating" illustrations, and a rejection of traditional borders. 

The system prioritizes **Atmospheric Depth** over structural rigidity. Elements should feel like they are resting on sand or tucked under a palm leaf, rather than trapped in a box. We use generous whitespace (the "Shoreline" effect) to ensure the interface feels breezy and unhurried.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the natural textures of Siargao: the deep teal of the Pacific, the golden hour sun, and the warmth of coral sand.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to define sections or cards. Boundaries are strictly defined by background shifts or tonal layering. For example, a `surface-container-low` card sitting on a `surface` background provides all the definition needed.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of papers and glass.
- **Base Layer:** `surface` (#fff8f1) for the main page body.
- **Secondary Sectioning:** Use `surface-container` (#f6eddd) for large structural blocks.
- **Interactive Layers:** Use `surface-container-low` (#fcf2e3) for cards to create a "recessed" or "soft lift" feel.

### The "Glass & Gradient" Rule
To add "soul" to the interface:
- **CTAs:** Use a subtle linear gradient from `primary` (#006056) to `primary-container` (#1a7a6e) at a 135° angle.
- **Floating Navigation:** Use `surface-bright` at 85% opacity with a `24px` backdrop-blur to create a "frosted sea glass" effect for fixed headers or floating action buttons.

---

## 3. Typography: The Editorial Voice
We pair the structural rhythm of **Epilogue** with the approachable fluidity of **Plus Jakarta Sans**.

- **Display & Headlines (Epilogue):** These are our "Character" moments. Use `display-lg` and `headline-lg` with tight letter-spacing (-0.02em) to create an authoritative yet friendly editorial look. Headlines should often be "broken" by small decorative icons (a sun or paw) to keep the vibe non-corporate.
- **Body & Titles (Plus Jakarta Sans):** Designed for high legibility in tropical glare. Use `body-lg` for most descriptive text to maintain an "approachable" scale. 
- **The Identity Shift:** Always use `on-surface-variant` (#3e4946) for body copy instead of pure black to maintain the "charcoal on sand" warmth.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are too "digital." Here, we use light to create atmosphere.

- **The Layering Principle:** Stack `surface-container-lowest` cards on `surface-container-high` backgrounds. The contrast in warmth creates natural separation without visual clutter.
- **Ambient Shadows:** For floating elements (like a Siargao Paw Card), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(62, 73, 70, 0.06)`. Note the use of the `on-surface` color for the shadow tint rather than black.
- **The "Ghost Border" Fallback:** If a divider is mandatory for accessibility, use `outline-variant` (#bdc9c5) at **15% opacity**. It should be felt, not seen.
- **Organic Shapes:** Apply `xl` (3rem) or `lg` (2rem) roundedness to all containers. Occasionally use an asymmetric "blob" radius (e.g., `80px 40px 80px 40px`) for decorative image masks to mimic island flora.

---

## 5. Components

### The Siargao Paw Card (Signature Component)
A high-end card utilizing `surface-container-low`, an `xl` corner radius, and a subtle palm leaf pattern watermark in the corner (using `outline-variant` at 5% opacity). No borders.

### Buttons
- **Primary:** Gradient-filled (`primary` to `primary-container`), `full` roundedness, `title-sm` typography in `on-primary`.
- **Secondary:** `surface-container-highest` background with `primary` text. No border.
- **Tertiary:** `on-surface` text with a subtle `secondary` (#7c5800) underline that is 4px thick and sits 2px below the baseline, mimicking a highlighter.

### Inputs & Fields
- **Text Fields:** Use `surface-container-high` backgrounds. When focused, transition the background to `surface-container-lowest` and add a 2px "Ghost Border" of `primary`.
- **Checkboxes/Radios:** Use `secondary` (#7c5800) for active states. The "Check" should feel like a hand-drawn stroke.

### Lists & Navigation
- **The Divider Rule:** Strictly forbid horizontal lines. Use `spacing-6` (2rem) of vertical whitespace or a alternating background tint between list items.
- **Chips:** Use `secondary-container` (#febf39) with `on-secondary-container` (#6f4f00) for high-energy tags (e.g., "New Rental").

---

## 6. Do’s and Don’ts

### Do:
- **Overlap Elements:** Let a paw print motif or a "Sun" icon partially bleed off the edge of a card or section.
- **Use Tonal Backgrounds:** Use the `spacing-10` scale to create massive breathing room between content blocks.
- **Prioritize Softness:** Ensure every corner uses at least the `md` (1.5rem) roundedness scale.

### Don’t:
- **Don't use 1px Borders:** This is the quickest way to make the design look like a generic template.
- **Don't use Pure White (#FFFFFF):** Except for the `surface-container-lowest` background of a card. Use the `background` (#fff8f1) or `surface` tokens to keep the "Sand" warmth.
- **Don't use Centered Grids exclusively:** Use intentional asymmetry. Place a heading on the left and a supporting illustration slightly "off-center" to the right to create a professional, editorial layout.