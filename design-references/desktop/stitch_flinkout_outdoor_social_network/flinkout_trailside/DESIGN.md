---
name: Flinkout Trailside
colors:
  surface: '#f9f9f8'
  surface-dim: '#d9dad9'
  surface-bright: '#f9f9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f3'
  surface-container: '#edeeed'
  surface-container-high: '#e7e8e7'
  surface-container-highest: '#e1e3e2'
  on-surface: '#191c1c'
  on-surface-variant: '#414846'
  inverse-surface: '#2e3131'
  inverse-on-surface: '#f0f1f0'
  outline: '#717976'
  outline-variant: '#c1c8c4'
  surface-tint: '#46645c'
  primary: '#16342d'
  on-primary: '#ffffff'
  primary-container: '#2d4b43'
  on-primary-container: '#99bab0'
  inverse-primary: '#adcec3'
  secondary: '#395f94'
  on-secondary: '#ffffff'
  secondary-container: '#9ec2fe'
  on-secondary-container: '#284f83'
  tertiary: '#5b1800'
  on-tertiary: '#ffffff'
  tertiary-container: '#812600'
  on-tertiary-container: '#ff9976'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c8eadf'
  primary-fixed-dim: '#adcec3'
  on-primary-fixed: '#01201a'
  on-primary-fixed-variant: '#2e4c44'
  secondary-fixed: '#d5e3ff'
  secondary-fixed-dim: '#a7c8ff'
  on-secondary-fixed: '#001c3b'
  on-secondary-fixed-variant: '#1e477b'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832600'
  background: '#f9f9f8'
  on-background: '#191c1c'
  surface-variant: '#e1e3e2'
typography:
  display-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Be Vietnam Pro
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Be Vietnam Pro
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  container-max: 1200px
  gutter: 16px
---

## Brand & Style

The design system is built to feel like a reliable companion for the everyday explorer. It rejects the aggressive, high-performance aesthetic of competitive sports apps in favor of a "Community-First Movement" philosophy. The vibe is welcoming, tactile, and grounded in nature, yet energized by digital connectivity.

The visual style is **Modern Tactile Minimalism**. It utilizes soft, approachable surfaces and card-based containers that feel organized but not rigid. The emotional goal is to lower the barrier to entry for outdoor activity, making a 15-minute neighborhood walk feel as celebrated as a mountain hike. Interface elements prioritize clarity and friendliness to ensure users feel invited to share their journeys without the pressure of "athlete" branding.

## Colors

The palette is rooted in the "Earth & Action" concept. 

- **Primary (Deep Forest):** Used for core navigation, headers, and grounded UI elements. It provides a stable, professional base.
- **Secondary (Slate Blue):** Applied to secondary actions, subtle backgrounds, and weather-related UI components.
- **Tertiary (Safety Orange):** Reserved for "Live" status, active recordings, and critical call-to-actions. It ensures high visibility against map layers.
- **Accent (Electric Lime):** Used sparingly for progress bars, achievement badges, and "Active Now" indicators to provide a punch of modern energy.
- **Neutral:** A warm-tinted off-white for backgrounds to reduce eye strain in outdoor sunlight, paired with a charcoal-slate for high-readability text.

## Typography

The typography strategy balances warmth with technical precision. 

**Be Vietnam Pro** is the workhorse of the system. Its friendly, contemporary curves make social interactions feel personal and inviting. It is used for all narrative content, names, and headers.

**Space Grotesk** is used for "Data & Wayfinding." Its geometric, slightly technical character provides a necessary contrast for map overlays, distance markers, and telemetry (speed, duration, elevation). This distinction helps users mentally separate "social" information from "functional" data at a glance.

## Layout & Spacing

This design system uses a **Fluid-Floating Grid**. Since the product is map-centric, the layout relies on a "Layered Canvas" approach where social and control elements float above a full-bleed map background.

- **Mobile:** A single-column layout with a persistent "Bottom Sheet" for social feeds and activity controls. Margins are kept at 16px to maximize map visibility.
- **Desktop/Tablet:** A split-view or multi-panel layout. The map remains the primary background layer, with floating "Glass" cards (max-width 400px) containing social threads and navigation details.
- **Spacing Rhythm:** Based on an 8px linear scale. Large 40px - 64px gaps are used between major content sections to maintain the airy, unhurried brand feel.

## Elevation & Depth

To simulate the feeling of layers in a landscape, the design system utilizes **Tonal Depth** and **Soft Ambient Shadows**.

1.  **Level 0 (Map/Base):** The fundamental layer.
2.  **Level 1 (Surface):** The primary content cards. These use a subtle 1px border in a slightly darker neutral tone and a very soft, diffused shadow (15% opacity, 12px blur, 4px offset) to appear gently lifted.
3.  **Level 2 (Active/Floating):** Interaction buttons (like 'Start Activity') and high-priority alerts. These use a more pronounced shadow with a hint of the Primary Forest green in the shadow tint to create a rich, organic feel.
4.  **Overlay Layer:** Use background blurs (10px - 15px) for navigation bars and map controls to ensure legibility without completely obscuring the map underneath.

## Shapes

The shape language is **Rounded and Organic**. Sharp corners are avoided to maintain the friendly, approachable personality.

- **Standard Buttons & Cards:** 0.5rem (8px) radius provides a soft but modern feel.
- **Interactive Inputs:** 0.5rem (8px) to match the containers.
- **Avatars & Action Triggers:** Pill-shaped (fully rounded) to denote high interactivity and distinct social elements.
- **Map Markers:** Teardrop shapes with rounded tips to blend the technicality of GPS with the system's soft aesthetic.

## Components

### Buttons & Inputs
- **Primary Action:** Bold Forest Green background with white text. Rounded (0.5rem).
- **Live Action:** Safety Orange background. Used exclusively for "Record," "Stop," or "Emergency."
- **Inputs:** Soft Neutral-200 background with a subtle inner shadow to look "pressed" into the surface.

### Social Cards
Feed items are contained in white or very light green cards with 0.5rem rounded corners. They include a header with a Pill-shaped avatar and a "Data Strip" at the bottom using Space Grotesk to show the walk's stats.

### Map Controls
Floating circular buttons (48x48px) with a blur-backdrop (Glassmorphism) and a Slate Blue icon. This keeps the UI light and prevents it from feeling like a "heavy" app.

### Chips & Tags
Used for activity types (e.g., #StrollerFriendly, #DogFriendly). These use low-saturation Slate Blue backgrounds with high-contrast text to remain legible but secondary.

### Progress & Live Metrics
Progress rings and live path-lines on the map use the **Electric Lime** accent color for maximum contrast against both light and dark map styles.