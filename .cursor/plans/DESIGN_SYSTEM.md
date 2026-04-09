# Lola's Rentals — Design System Reference

> Extracted from `HomePage.tsx`, `tailwind.config.ts`, `index.css`, and all home components.  
> Use this document when building new pages. Copy patterns verbatim — do not invent new colours or fonts.

---

## 1. TYPOGRAPHY

### Font Families (Tailwind tokens)

| Token | Family | Use case |
|---|---|---|
| `font-headline` / `font-sans` | `"Alegreya Sans"` | All headings, hero title, card titles, nav logo |
| `font-body` | `Plus Jakarta Sans` | Base body text (`<body>` default via `font-body` on root div) |
| `font-lato` | `Lato, Nunito` | Labels, captions, subtitles, CTA text, UI copy |
| `font-display` | `"Playfair Display"` | Available but unused on homepage — reserved for editorial use |

### Heading Styles

**H1 — Hero title** (`HeroSection`)
```html
<!-- Static / touch version -->
<h1 style="
  font-family: 'Alegreya Sans';
  font-weight: 700;
  font-size: clamp(36px, 5vw, 52px);
  color: #00577C;
  line-height: 1.15;
">
  Rated by Many,<br />
  <span style="font-style: italic; color: #FCBC5A;">Rooted</span> in Community
</h1>

<!-- CSS-only hero (HeroSection.tsx / .hero-title class) -->
<!-- font-size: clamp(2rem, 5.5vw, 4.2rem); color: #1A7A6E -->
```
Pattern: **teal main phrase + italic gold accent word**. Often uses `VariableProximity` for the desktop interactive weight-shift effect.

**H2 — Section headings**
```html
<h2 class="font-headline font-bold" style="
  font-size: clamp(32px, 5vw, 42px);
  color: #363737;
  line-height: 1.2;
  margin-bottom: 16px;
">
  Choose Your Ride
</h2>
```
Charcoal (`#363737`) for the main text. Teal overline label appears above (see Section Header pattern).

**H3 — Card titles (TiltedCard)**
```html
<h3 class="font-headline font-bold" style="font-size: 22px; color: #00577C; line-height: 1.3;">
  Rooted in Community
</h3>
```

**H3 — Large inverted block (PawCardCallout)**
```html
<h3 class="font-headline font-black" style="
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.15;
  color: #FFFFFF;
">
  Every Peso<br />
  <span style="font-style: italic; color: #FCBC5A;">Wags a Tail</span>
</h3>
```

**H4 — Stepper step titles**
```html
<h4 class="font-headline font-bold" style="font-size: 20px; color: #00577C; margin-bottom: 8px;">
  Get Your Paw Card
</h4>
```

### Section overline label (eyebrow text)
```html
<p class="font-lato" style="
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #00577C;
  font-weight: 700;
  margin-bottom: 12px;
  text-align: center;
">
  Our Fleet
</p>
```

### Hero subtitle / body
```html
<!-- Hero subline -->
<p class="font-lato" style="
  font-size: 18px;
  color: #363737;
  max-width: 560px;
  line-height: 1.6;
  text-align: center;
  margin: 0 auto 40px;
">
  Explore Siargao, support our street dogs and cats.
</p>

<!-- Section body -->
<p class="font-lato" style="
  font-size: 16px;
  color: #363737;
  opacity: 0.7;
  max-width: 560px;
  line-height: 1.65;
  text-align: center;
  margin: 0 auto 48px;
">
  Everything included with every booking.
</p>
```

### Review card text
```html
<p class="text-sm italic leading-relaxed text-charcoal-brand">...</p>
<h6 class="text-sm font-bold text-charcoal-brand">Sarah J.</h6>
<p class="text-[10px] font-black uppercase text-charcoal-brand/50">DIGITAL NOMAD</p>
```

### Count-up / stat display
Defined in `index.css` as `.count-up-text`:
```css
font-size: clamp(48px, 6vw, 72px);
font-weight: 800;
color: #00577C;
font-family: 'Alegreya Sans', sans-serif;
line-height: 1;
```

---

## 2. COLORS

### Brand palette

| Token | Hex | Tailwind class | Usage |
|---|---|---|---|
| Teal | `#00577C` | `text-teal-brand` / `bg-teal-brand` | Headings, accents, active nav, overlines, icon labels |
| Gold | `#FCBC5A` | `text-gold-brand` / `bg-gold-brand` | CTA buttons, italic accent words, price badges, stars |
| Sand | `#f1e6d6` | `bg-sand-brand` | Page background, hero background, section backgrounds |
| Cream | `#FAF6F0` | `bg-cream-brand` | Card backgrounds, footer background |
| Charcoal | `#363737` | `text-charcoal-brand` | Primary body text, button text on gold |
| White | `#FFFFFF` | `bg-white` / `text-white` | TiltedCard background, inclusion icons, inverted text on teal |

### Semantic colour usage rules
- **Teal** = structure/meaning (headings, overlines, labels, interactive icons, progress)
- **Gold** = call-to-action and delight (main buttons, italic "pop" words, badges, highlights)
- **Sand** = warmth/background (never use for text)
- **Cream** = elevated surface (cards, modal backgrounds)
- **Charcoal** = readable text (body, captions — never pure black)
- **White** = high-contrast surface inside a card (image area, icon tile background)

### Opacity variants in use
```
text-charcoal-brand/60   ← subdued body copy (reviews section)
text-charcoal-brand/50   ← captions, meta text
rgba(255,255,255,0.82)   ← body text inside teal/dark panels (PawCardCallout)
#363737 at opacity 0.65  ← section descriptors, card body text
#363737 at opacity 0.4   ← divider symbol "×"
```

---

## 3. BUTTONS

### Primary CTA — Gold skeuomorphic (hero + fleet cards)
```html
<Link
  to="/book/reserve"
  class="inline-block rounded-[6px] border-2 border-charcoal-brand bg-gold-brand
         px-12 py-4 font-lato text-sm font-extrabold uppercase tracking-[0.05em]
         text-charcoal-brand transition-shadow duration-150"
  style="box-shadow: 4px 4px 0 #363737; transform: skewX(-4deg);"
>
  <span style="display: inline-block; transform: skewX(4deg);">Book Your Ride</span>
</Link>
```
- **Hover:** `box-shadow: 6px 6px 0 #363737` + `translate(-2px, -2px)` via Framer Motion `whileHover`
- **Skew:** outer `skewX(-4deg)` + inner counter-`skewX(4deg)` so text stays upright

### Primary CTA — Gold standard (card / fleet / Be Pawsitive CTA)
```html
<button style="
  background-color: #FCBC5A;
  color: #363737;
  border: 2px solid #363737;
  border-radius: 8px;
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-shadow: 3px 3px 0 #363737;
  font-family: 'Lato', sans-serif;
  padding: 12px 0;
  width: 100%;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
">
  Book Your Ride
</button>
```
- **Hover:** `translate(-2px, -2px)` + `box-shadow: 5px 5px 0 #363737`
- **Active / leave:** reset to `translate(0,0)` + `box-shadow: 3px 3px 0`

### PrimaryCtaButton component (`PrimaryCtaButton.tsx`)
```tsx
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';

// Uses a yellow SVG background image (Button (yellow).svg) so it works on any bg
<PrimaryCtaButton
  type="button"
  onClick={handler}
  disabled={loading}
  className="flex w-full items-center justify-center gap-2 py-3.5 font-bold"
>
  🛒 Add to Basket
</PrimaryCtaButton>
```
Base classes: `relative inline-flex items-center justify-center overflow-hidden rounded-full font-bold text-charcoal-brand shadow-md transition-all duration-300 ease-in-out hover:scale-105 hover:brightness-110 disabled:opacity-50`

### Ghost / outline button (unavailable state)
```html
<button class="flex w-full flex-col items-center justify-center gap-1 rounded-full
               border-2 border-teal-700 bg-transparent py-3.5 font-bold text-teal-700
               transition-all duration-300 hover:bg-teal-700/10">
  Next available from …
</button>
```

### "In basket" state (read-only)
```html
<div class="flex w-full items-center justify-center gap-2 rounded-full
            bg-teal-700 py-3.5 font-bold text-white">
  In Basket ✓
</div>
```

### Ghost text link (PawCardCallout)
```html
<a style="
  font-size: 18px;
  font-weight: 700;
  color: #FCBC5A;
  font-family: 'Lato', sans-serif;
  text-decoration: none;
  transition: opacity 0.2s ease;
">
  Get Your Paw Card 🐾
</a>
```
Hover: `opacity: 0.8`

---

## 4. CARDS

### BorderGlow card
`BorderGlow` (`src/components/home/BorderGlow.tsx`) — interactive teal glow that follows the cursor near card edges. On touch devices degrades to a CSS `borderPulse` animation.

```tsx
import BorderGlow from '../../components/home/BorderGlow.js';

<BorderGlow
  glowColor="36 96 67"      // HSL string: roughly teal
  backgroundColor="#FAF6F0" // cream card background
  borderRadius={20}          // px, also sets inner radius to borderRadius - 2
  glowIntensity={1.2}
  coneSpread={30}
  // Optional: animated gradient border
  colors={['#FCBC5A', '#F5A623', '#f1e6d6']}
  style={{ height: '100%' }}
>
  {/* your card content */}
</BorderGlow>
```

CSS `borderPulse` (touch fallback, defined in `index.css`):
```css
@keyframes borderPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(252,188,90,0); }
  50%       { box-shadow: 0 0 14px 4px rgba(252,188,90,0.35); }
}
```

### TiltedCard (homepage "Why Choose Us" tiles)
`TiltedCard` (`src/components/home/TiltedCard.tsx`) — Framer Motion 3D tilt + gold glow on hover.

```tsx
import TiltedCard from '../../components/home/TiltedCard.js';

<TiltedCard
  icon={iconCommunity}           // SVG import, displayed at 64×64px
  title="Rooted in Community"
  body="Body copy here..."
  rotateAmplitude={12}           // default, max tilt degrees
  scaleOnHover={1.04}            // default
/>
```

Internal card styles:
```js
backgroundColor: '#FFFFFF'
borderRadius: '14px'
padding: '40px'
boxShadow (idle):  '0 2px 16px rgba(0,0,0,0.07), 0 0 28px rgba(252,188,90,0.2)'
boxShadow (hover): '0 8px 28px rgba(0,0,0,0.1), 0 0 40px rgba(252,188,90,0.35)'
```

Title: `font-headline font-bold`, `22px`, `color: #00577C`  
Body: `font-lato`, `16px`, `color: #363737`, `lineHeight: 1.65`

### Standard review card (Tailwind)
```html
<div class="rounded-4xl bg-cream-brand p-8 shadow-[0_4px_20px_rgba(61,61,61,0.05)]
            transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
```

### Inclusion icon tile
```js
{
  width: 72, height: 72,
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  padding: 14,
}
```

### Inverted teal callout block (PawCardCallout)
```js
{
  backgroundColor: '#00577C',
  borderRadius: 20,
  padding: '48px 40px 40px',
  minHeight: 400,
  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
}
```

---

## 5. SECTION HEADERS

### Standard section header pattern (full)
```html
<!-- 1. Eyebrow label (uppercase teal) -->
<p class="font-lato" style="
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #00577C;
  font-weight: 700;
  margin-bottom: 12px;
  text-align: center;
">
  Section Category
</p>

<!-- 2. Section heading (charcoal, headline font) -->
<h2 class="font-headline font-bold" style="
  font-size: clamp(32px, 5vw, 42px);
  color: #363737;
  margin-bottom: 16px;
  line-height: 1.2;
  text-align: center;
">
  The Main Heading
</h2>

<!-- 3. Section descriptor (optional) -->
<p class="font-lato" style="
  font-size: 16px;
  color: #363737;
  opacity: 0.7;
  max-width: 560px;
  margin: 0 auto 48px;
  line-height: 1.6;
  text-align: center;
">
  Descriptive subline explaining the section.
</p>
```

### Teal + gold headline split (hero / callout pattern)
Use when the heading needs emotional impact:
```html
<h2 class="font-headline font-black" style="font-size: clamp(32px, 5vw, 52px); color: #00577C;">
  Primary Phrase,<br />
  <span style="font-style: italic; color: #FCBC5A;">Gold Accent Word</span>
</h2>
```
Rule: **teal = rational/structural phrase**, **gold italic = emotional/impact word**.

### Inline Tailwind variant (BrowseBookVehicleSection)
```html
<h2 class="font-headline text-3xl font-black tracking-tight text-teal-brand">
  Available Fleet <span class="text-gold-brand">Siargao</span>
</h2>
<p class="text-sm text-charcoal-brand/60">Select your ride and add to basket</p>
```

---

## 6. ANIMATIONS & EFFECTS

### Keyframes (Tailwind config + index.css)

| Name | Effect | Duration | Used for |
|---|---|---|---|
| `animate-page-fade-in` | opacity 0→1 | 600ms | Root layout div on every page |
| `animate-fade-up` | opacity 0→1 + translateY(20px)→0 | 500ms | `FadeUpSection` scroll reveal |
| `animate-card-enter` | same as fade-up | 500ms | Fleet / vehicle cards on search |
| `animate-slide-up` | translateY(100%)→0 | 250ms | Bottom sheet / modal entrance |
| `animate-toast-slide-up` | translateY(100%)→0 | 300ms | Toast notifications |
| `animate-badge-pop` | scale 1→1.25→1 | 400ms | Basket icon count badge bump |
| `animate-float-slow` | organic x/y drift | 16–20s | `HeroFloatingClouds` (large clouds) |
| `animate-float-medium` | organic x/y drift | 12–14s | `HeroFloatingClouds` (mid clouds) |
| `animate-float-fast` | organic x/y drift | 8s | `HeroFloatingClouds` (small clouds) |
| `cloudDriftLegacy` | translateX(-220px)→110vw with fade | 12–32s | Auto-scrolling drift clouds |
| `marqueeScroll` | translateX(0)→-50% | variable | `InclusionMarquee` |
| `borderPulse` | gold box-shadow pulse | 3s infinite | `BorderGlow` touch fallback |
| `lolaRide` | Lola scooter from right to left | 22s infinite | Hero road strip |

### VariableProximity (hero interactive text)
`src/components/home/VariableProximity.tsx` — Responds to mouse proximity to animate OpenType `wght` axis:
- `fromFontVariationSettings: "'wght' 300, 'opsz' 9"` (thin when far)
- `toFontVariationSettings: "'wght' 900, 'opsz' 40"` (black when cursor is near, `radius: 150px`)
- Fallback: static bold text with `framer-motion` fade-in

### FadeUpSection (scroll reveal)
```tsx
import { FadeUpSection } from '../../components/public/FadeUpSection.js';

<FadeUpSection>
  <section>...</section>
</FadeUpSection>
```
Uses `IntersectionObserver` (`threshold: 0.08`, `rootMargin: 0px 0px -40px 0px`). Fires once. Applies `animate-fade-up` when visible, or `translate-y-5 opacity-0` before.

### TiltedCard 3D tilt
Framer Motion spring physics:
```js
const springValues = { damping: 30, stiffness: 100, mass: 2 };
rotateAmplitude = 12   // degrees
scaleOnHover = 1.04
```

### BorderGlow mouse-track
`--edge-proximity` (0–100) and `--cursor-angle` CSS variables updated on `onPointerMove`. The `border-glow-card` CSS class (from `BorderGlow.css`) uses these to paint an arc-gradient border that follows the cursor.

### Hover effects summary
| Element | Effect |
|---|---|
| Gold skeuomorphic button | `translate(-2px,-2px)` + `box-shadow` grows |
| `PrimaryCtaButton` | `scale(1.05)` + `brightness(1.1)` |
| Fleet hero card | `scale(1.03)` via Framer + 3D tilt up to 12° |
| Review card | `hover:-translate-y-0.5 hover:shadow-md` |
| VehicleCard (booking) | `hover:-translate-y-1 hover:shadow-xl` |

---

## 7. SPACING & LAYOUT

### Page structure
```tsx
<PageLayout title="..." showBasketIcon>
  {/* fullBleed=false (default): main gets px-4 pt-20 pb-32 */}
  {/* fullBleed=true (homepage): main gets no padding — hero sits flush */}
</PageLayout>
```

### Section padding pattern
```js
// Most homepage sections
padding: '64px 5%'          // top/bottom 64px, sides 5%
maxWidth: 1280               // inner content cap
margin: '0 auto'

// Smaller sections / cards
padding: '48px 40px 40px'   // PawCardCallout style

// Review section (Tailwind)
// px-6 py-16
```

### Grid patterns for cards

**2-up (fleet preview, Be Pawsitive split)**
```css
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 64px;
```

**3-up (TiltedCard "Why Us", vehicle booking grid)**
```css
grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
gap: 24px; /* or gap-8 for booking cards */
```

**Review cards (3 fixed columns at md)**
```html
<div class="grid gap-6 md:grid-cols-3">
```

### Max-width containers
```
max-w-7xl (1280px) + mx-auto  ← all major sections
max-w-7xl + px-6              ← ReviewsSection, FleetPreviewSection
max-width: 720px + margin: auto ← Fleet preview narrow mode (only 2 vehicles)
max-width: 560px + margin: auto ← body copy paragraphs
max-width: 480px               ← shorter descriptors
```

### Section dividers
```tsx
import SectionDivider from '../../components/home/SectionDivider.js';

<div style={{ marginTop: -2, marginBottom: -2 }}>
  <SectionDivider variant="dash" />         {/* Thin road-dash SVG */}
  <SectionDivider variant="bold" />         {/* Bold road separator SVG */}
  <SectionDivider variant="dash" flip />    {/* Mirrored */}
</div>
```

---

## 8. REUSABLE COMPONENTS

| Component | Import path | When to use |
|---|---|---|
| `<PageLayout>` | `components/layout/PageLayout` | Every customer-facing page — provides nav, footer, bottom mobile nav, sand background, floral decorations |
| `<FadeUpSection>` | `components/public/FadeUpSection` | Wrap any section you want to animate in on scroll |
| `<PrimaryCtaButton>` | `components/public/PrimaryCtaButton` | Any gold rounded CTA button (SVG background, scales on hover) |
| `<BorderGlow>` | `components/home/BorderGlow` | Wrap premium cards that warrant an interactive teal glow on hover |
| `TiltedCard` | `components/home/TiltedCard` | 3-column "why us" / feature tiles with icon, title, body and gold glow |
| `<HeroFloatingClouds>` | `components/ui/HeroFloatingClouds` | Ambient floating cloud layer; add to any page with `relative overflow-hidden` parent; use `variant="functional"` (30% opacity) for non-hero pages |
| `SectionDivider` | `components/home/SectionDivider` | Visual break between full-width sections; wrap in negative-margin div |
| `<InclusionMarquee>` | `components/home/InclusionMarquee` | Auto-scrolling icon+label ticker for any set of features/inclusions |
| `<ReviewsSection>` | `components/home/ReviewsSection` | Drop-in 3-column review cards section |
| `<PawCardCallout>` | `components/home/PawCardCallout` | Full-height teal panel with heading, body, and CTA link — use as a left/right column block |
| `<Stack>` | `components/home/Stack` | Draggable stacked photo deck with autoplay |
| `CountUp` | `components/home/CountUp` | Animated number counter (`.count-up-text` class) |
| `<BePawsitiveMeter>` | `components/home/BePawsitiveMeter` | Live charity donation counter — fetches public API, falls back to `282995` |
| `Stepper` / `Step` | `components/home/Stepper` | Step-by-step wizard/explainer inside a section |
| `VariableProximity` | `components/home/VariableProximity` | Variable-font text that reacts to mouse proximity — desktop only, has touch fallback |
| `<FleetPreviewSection>` | `components/home/FleetPreviewSection` | Full fleet preview with live pricing, BorderGlow cards, and CTA buttons |

---

## Quick Copy Patterns

### New section (standard)
```tsx
<FadeUpSection>
  <section style={{ backgroundColor: '#f1e6d6', padding: '64px 5%' }}>
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <p className="font-lato" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#00577C', fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>
        Category Label
      </p>
      <h2 className="font-headline font-bold" style={{ fontSize: 'clamp(32px, 5vw, 42px)', color: '#363737', marginBottom: 16, lineHeight: 1.2, textAlign: 'center' }}>
        Section Heading
      </h2>
      <p className="font-lato" style={{ fontSize: 16, color: '#363737', opacity: 0.7, maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.6, textAlign: 'center' }}>
        Descriptive subline.
      </p>
      {/* content grid */}
    </div>
  </section>
</FadeUpSection>
```

### BorderGlow card (booking style)
```tsx
<BorderGlow glowColor="36 96 67" backgroundColor="#FAF6F0" borderRadius={24} glowIntensity={0.8} style={{ height: '100%' }}>
  <div className="flex h-full flex-col overflow-hidden rounded-[22px] bg-[#FAF6F0]">
    {/* image area */}
    {/* content area with mt-auto CTA */}
  </div>
</BorderGlow>
```

### Gold offset-shadow CTA button (inline)
```html
<button style="
  background-color: #FCBC5A; color: #363737;
  border: 2px solid #363737; border-radius: 8px;
  font-weight: 800; font-size: 14px;
  letter-spacing: 0.05em; text-transform: uppercase;
  box-shadow: 3px 3px 0 #363737;
  font-family: Lato, sans-serif;
  padding: 12px 24px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
"
onMouseEnter="this.style.transform='translate(-2px,-2px)'; this.style.boxShadow='5px 5px 0 #363737';"
onMouseLeave="this.style.transform=''; this.style.boxShadow='3px 3px 0 #363737';"
>
  Action Label
</button>
```

### HeroFloatingClouds (background ambience on inner pages)
```tsx
// Parent must have: className="relative overflow-hidden"
<HeroFloatingClouds variant="functional" />  // 30% opacity
<HeroFloatingClouds variant="editorial" />   // 60% opacity
```
