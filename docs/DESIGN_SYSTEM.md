# Oliv Design System — "Grove"

A deliberate visual language so Oliv reads as *designed*, not generated. It
fuses two references:

- **Strava** — data confidence. Big bold stat numbers, uppercase letter-spaced
  micro-labels, one vivid brand color (International Orange `#FC4C02`) used
  sparingly over crisp neutrals, and a clear activity-card anatomy
  (author → hero → stats → social actions).
- **Beli** — social warmth. A **color-graded score** (Beli grades restaurants
  0–10 on a red→green gradient — the single most recognizable thing in the app),
  friendly rounded cards, soft depth, category iconography, generous whitespace.

For Oliv, **olive green is our "Strava orange"**: one confident brand color used
boldly and sparingly; neutrals + the food photos carry everything else. The
Health Score becomes our "Beli score" — graded on a warm→green ramp.

## What was making it feel AI-generated (and the fix)

| Tell | Fix |
|---|---|
| Emoji as UI icons (🏠 👥 📷 📈 🔥) | Real **Feather** line icons; one MaterialCommunityIcons `fire` for streaks. 🫒 survives *only* as the literal score glyph. |
| Flat, even-weight type | Two-family scale: **Space Grotesk** (display/numbers) + **Hanken Grotesk** (text), with big stat numbers and tracked uppercase micro-labels. |
| System font | Bundled grotesk faces with character. |
| Uniform soft rounding, no focal data moment | Strava stat-hero (huge calorie number) + Beli graded score pill as the recurring focal elements. |
| Static screens | Restrained reanimated motion (press-scale, score fill, number count-up). |

## Color

Warm-neutral base, deep confident olive brand, and a 5-stop score ramp.

```
ink     #1A1C17   near-black text (warm green undertone, not pure black)
ink70   #44483D   secondary text
ink50   #6E7268   tertiary / micro-labels
ink30   #A2A698   disabled / hairline-dark
paper   #FBFAF6   app background (clean, faint warmth — not "cream")
surface #FFFFFF   cards
line    #ECEAE0   hairlines
fill    #F1F0E8   inactive chip / track fill

olive       #54732B   PRIMARY brand / CTA (deep, alive — our "Strava orange")
oliveDeep   #2C3B18   strong ink, headers
oliveSoft   #E7EDD8   brand tint fill
ember       #E0683C   energy accent — streaks, highlights (warm coral)
```

**Score ramp** (`scoreColor(value)` buckets 1.0–5.0, the Beli move):
```
≤2.0  #C2553D  terracotta   (poor)
 2.5  #CC7A33  burnt amber
 3.0  #C29A2A  gold
 3.5  #9AA537  olive-lime
 4.0  #6E9A38  leaf
≥4.5  #54732B  deep olive   (excellent)
```

## Type

- **Display / numbers:** Space Grotesk — `700` (stats, titles, score), `500`.
- **Text:** Hanken Grotesk — `400/500/600/700`.
- Numbers always `fontVariant: tabular-nums`.

| Token | Font / size / weight | Use |
|---|---|---|
| `display` | Space 34 / 700, tracking −0.6 | the hero calorie number |
| `stat` | Space 22 / 700, −0.3, tabular | card stat numbers |
| `title` | Space 26 / 700, −0.4 | screen titles, brand |
| `heading` | Hanken 17 / 700, −0.2 | section headers |
| `body` | Hanken 15 / 400–500 | content |
| `label` | Hanken 13 / 600 | field labels, chips |
| `micro` | Hanken 11 / 700, UPPERCASE, tracking +0.9 | the Strava stat labels ("CALORIES", "PROTEIN") |

The tracked uppercase `micro` label sitting under a big Space number is the
signature "this was designed" pattern.

## Shape, depth, motion

- **Radii:** card 20, image 16, button 14, pill/chip full.
- **Elevation:** soft, green-tinted, low-opacity (not default gray). `card` (rest)
  and `raised` (CTA / center action).
- **Motion** (reanimated, gentle springs — smooth, never bouncy):
  press-scale `0.97` on cards & buttons, olive **fill animation** + number
  **count-up** on the score and the daily calorie hero.

## Component anatomy

- **MealCard** = Strava activity card: author row (avatar · name · time + meal
  type) → full-bleed hero (16:10) → title → **stat strip** (big CALORIES + P/C/F
  with micro-labels, hairline-divided) → graded **OliveScore** pill → action row
  (olive + comment, real icons + counts).
- **Daily hero** = Strava stat block: huge calories-remaining number, macro
  mini-bars, streak chip (fire + count), today's avg score as a graded pill.
- **OliveScore** = Beli graded pill: the value in Space-bold on a `scoreColor`
  chip + a compact filled-olive row.
- **Tab bar** = Feather line icons + an olive center action (plus) with a soft
  raise.

Sources: Strava brand color (International Orange `#FC4C02`) —
[Mobbin](https://mobbin.com/colors/brand/strava),
[BrandPalettes](https://brandpalettes.com/strava-colors/); Beli color-graded
0–10 score & teal/category-icon system —
[Pratt IXD critique](https://ixd.prattsi.org/2024/09/design-critique-beli-app/),
[Beli on the App Store](https://apps.apple.com/us/app/beli/id1478375386).
