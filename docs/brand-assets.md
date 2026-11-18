# FaraCode monochrome asset pack

These original, code-authored SVG assets belong to the FaraCode sampling workspace. They use a common black, white and silver material palette, an isometric product illustration style, soft ground shadows, and simple silhouettes that remain recognizable at dashboard scale. No Uber logos, illustration files, proprietary typefaces, or other third-party artwork were copied.

| Asset | Use |
| --- | --- |
| `/brand/mark.svg` | Dark route/F monogram on light surfaces |
| `/brand/mark-inverse.svg` | White route/F monogram on dark surfaces |
| `/brand/favicon.svg` | Rounded black application icon with white monogram |
| `/brand/campaign-kit.svg` | Sampling box with product units |
| `/brand/location-pin.svg` | Field location over a schematic map tile |
| `/brand/team-badge.svg` | Team credential with verified attendance |
| `/brand/report-clipboard.svg` | Operations report with approval check |

The four illustrations share a `240 × 200` viewBox and transparent backgrounds. Use an aspect ratio of `6 / 5`; reserve image dimensions to prevent layout movement. A width of 96–180 CSS pixels works well for dashboard service cards. Use empty alternative text when an illustration accompanies an already labeled action; provide meaningful alternative text when displayed independently.

The monogram combines an F-shaped path, a short route segment and an endpoint. Both mark variants use the same `64 × 64` viewBox. Display it with enough surrounding space to preserve its silhouette; do not stretch its proportions.

Creation method: editable native SVG paths and gradients. No raster image generation or external asset downloads were used for this pack. The separate generated still-life artwork is managed by the main task and is not part of these SVG assets.

## Operational page assets

`web/public/brand/pages` adds nine original solid black SVG glyphs in a shared 32 × 32 viewBox: `icon-campaigns`, `icon-shifts`, `icon-map`, `icon-team`, `icon-attendance`, `icon-inventory`, `icon-issues`, `icon-reports` and `icon-catalog`. They use native paths and white cutouts, and accompany each page heading with empty alt text because the heading already labels the page.

The same directory holds nine corresponding PNG still-lifes generated with built-in ImageGen. See [the page asset inventory](operational-pages.md) and [exact image prompts](page-artwork-prompts.json) for their paths and creation details.
