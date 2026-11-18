# Premium interface refactor

Date: 17 November 2026. The product remains Persian-first, with an English LTR option.

## Reference and evidence

The design review used the installed REA plugin to capture the DOM, accessibility tree and a screenshot of the [Uber Germany page](https://www.uber.com/de/en/) in Chromium. REA evidence `ev_98ba71764aa70212bf13d61c3af4d70a9fc52a02ae4ab5376542061d8a257c58` records the reference. The original reference bundle is saved locally at `docs/uber-reference-evidence.json`.

Observed visual characteristics were a black navigation and hero surface, prominent white headlines, understated rounded controls, light-gray inputs, and prominent photographic/service imagery. The reference was partially covered by its cookie notice; its navigation, main heading, form controls and image composition remained visible. No authenticated Uber administration interface was inspected. The dashboard design here is an original interpretation for sampling operations.

## Changes

- Original FaraCode route/F monogram, wordmark lockup, favicon and four monochrome service illustrations.
- Black application header, white navigation, quieter borders, readable supporting text, larger headings, and consistent black primary actions.
- Dashboard with an original sampling-kit still-life, database-derived period metrics, a monochrome distribution chart, latest-activation target, service shortcuts, schematic point map, activity feed and campaign table.
- Complete sign-in redesign, including the same artwork, brand header and clear form hierarchy.
- Campaigns, shifts, map, people, attendance, inventory, issues, reports and catalog share the visual system, along with forms, dialogs, drawers, notifications and empty states.
- More direct page titles, explicit accessible dialog names, a labeled global search button, and full-width mobile detail drawers.
- Existing campaign, GPS attendance, inventory, upload, approval and authorization flows retain their API contracts.

`globals.css` provides the existing component layout foundation in a neutral palette; `premium.css` defines the new identity, hierarchy, controls and responsive refinements. All fonts are locally hosted through the existing font packages. The hero uses Next.js image optimization and responsive sizes.

The subsequent [operational page expansion](operational-pages.md) adds nine dedicated pictures, nine custom glyphs and workflow-specific layouts. `pages.css` extends this system for the page heroes, card collections, calendar agenda, stock breakdown and issue board.

Metrics remain grounded in persisted records. Distribution totals use the selected 7/14-day range. The target card explicitly identifies the latest execution date when there are no shifts today; the refactor does not move historical demo records to today's date. Historical activity shows its date rather than implying it happened today.

## Original image

Tool: built-in ImageGen. Source: `web/public/brand/operations-still-life.png` (1536 × 1024). The image is used by the dashboard and sign-in screen. Vector assets and provenance are documented in `brand-assets.md`.

Final prompt:

> Use case: product-mockup. Asset type: premium sampling operations platform dashboard and sign-in hero illustration. Create one polished editorial 3D still-life, landscape 3:2 composition, on a seamless very light neutral gray background (#eeeeee). A matte black rigid open sampling kit box with several elegant unbranded white small product sample cartons and cups, a substantial brushed-silver location pin standing behind the kit, a minimal black smartphone lying diagonally with a blank pale screen, and a small smooth chrome sphere. Restrained realistic high-end materials, soft directional studio light, natural contact shadows and subtle ambient occlusion. Bold clear geometric silhouettes, confident composition, lots of uncluttered space around the objects, objects centered, no cropped objects. Monochrome black, white and silver only. Style: extremely premium product photography meets clean 3D editorial illustration, appropriate for an Uber-inspired enterprise dashboard. Text: no text, no letters, no logos, no watermarks, no UI, no decorative gradients or flowers. All artwork must be original.

## Verification

The following REA scenarios completed successfully. These are observations of the local development application, with provider-owned Chromium processes cleaned up after each run.

| Scenario | Evidence | Result |
| --- | --- | --- |
| Persian dashboard, 1440 × 1000 | `ev_8668655ca99a20f6aeed9b00f490b4d5932c28f0f11e15e011b036939d93fd7f` | Rendered dashboard, metrics, imagery and chart |
| Campaign form, campaign detail and report-review navigation | `ev_5d29180b1ff8831207f2dcd3ecea020eb809c673297d2becd48f0d0bd8aef4a2` | All 11 declared actions completed |
| Mobile navigation, shift filtering and shift drawer, 390 × 844 | `ev_61611b3955a2d03f6a04d19779053062489700b209ca2bdbee6f5f0689c4b4dc` | All eight declared actions completed |
| Final full-width mobile drawer | `ev_98f6f6b35ffcc094d2c09b74b82e0cedc6b9c9a5571d8a5aaec5762150bfa690` | All five actions completed; screenshot visually verified |
| Final Persian dashboard and service illustrations, 1440 × 1450 | `ev_cef96b27e5e1ee45fe068654f8311b58f7dc748830d9a538011d655f13af061c` | Complete capture, visually verified |
| Delivery screenshot with development controls hidden | `ev_426c046dbf6506262de6bf6b6538dc565e6c178178ecbde78dae6206698516c7` | Complete capture; saved as the final Persian dashboard preview |
| English language switch and LTR dashboard | `ev_d1878ed015001f076cb1f577ed17aa4214a0432a1d507273fa216cc536180082` | Language switch and direction change verified |
| Sign-out and redesigned sign-in screen | `ev_b989ae9061f09dcbd4594b5328bb88e2f66018a64532069c760bbee34bbac54d` | All four declared actions completed |

All nine operational routes returned HTTP 200. TypeScript and the optimized Next.js production build passed. The initial unauthenticated workspace request can produce an expected 401 before development demo sign-in. An earlier QA locator matched multiple table rows and was corrected to the first row; the completed scenario above supersedes that incomplete test run.

Screenshots are in `docs/screenshots`. Complete local QA evidence is retained under `.local/reference`. These checks verify rendered interfaces and the declared interactions; this UI refactor does not claim a new backend acceptance audit.
