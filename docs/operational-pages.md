# Operational page design

The nine operational pages now have dedicated workspaces within the premium FaraCode identity. Persian and RTL remain the default. Each page has an original monochrome still-life, its own native SVG icon, a clear primary action where permitted, and layouts tailored to its records.

| Page | Workspace improvements | Original picture and icon |
| --- | --- | --- |
| Campaigns | Brand cards with campaign targets, progress, dates, location counts and assigned people; search, status filters, sorting, and table mode | `campaigns.png`, `icon-campaigns.svg` |
| Shifts | Seven most recent recorded execution dates, day selection, all-date reset, scope filters, and existing shift cards/table and execution drawer | `shifts.png`, `icon-shifts.svg` |
| Operations map | Saved location/city/active-point metrics, city filtering, point cards with radius and directions, and the interactive schematic map | `map.png`, `icon-map.svg` |
| People | Team profiles with role, contact details, assigned shift/location counts, current-day attendance indicators, profile dialogs, filters and pagination | `team.png`, `icon-team.svg` |
| Attendance | Recorded GPS-accuracy summary, location/time/review explanation, guide dialog, date/status filters and the attendance table | `attendance.png`, `icon-attendance.svg` |
| Inventory | Active-shift receipt/distribution/balance breakdown, replenishment priorities, and balance/history tabs with movement filtering | `inventory.png`, `icon-inventory.svg` |
| Issues | Three status lanes, priority/date/point/owner cards, scoped status controls, issue details, filters and table mode | `issues.png`, `icon-issues.svg` |
| Reports | Review cards with submission details, summaries, linked distribution/balance quantities, evidence counts, approval dialogs and table mode | `reports.png`, `icon-reports.svg` |
| Catalog | Client, brand and product cards, related products/campaigns, clickable summary counts, tab switching, search and table mode | `catalog.png`, `icon-catalog.svg` |

Pictures and icons are saved in [`web/public/brand/pages`](../web/public/brand/pages). The nine 1536 × 1024 pictures were generated with **built-in ImageGen**. Exact final prompts, creation method and project paths are saved in [`page-artwork-prompts.json`](page-artwork-prompts.json). The nine icons are original code-authored SVG paths with a shared 32 × 32 viewBox. Existing original FaraCode service illustrations are also reused within campaign and catalog cards.

The still-lifes share black, white, gray and brushed-silver materials. Responsive Next.js image optimization serves them at appropriate sizes; contained framing keeps their objects visible. The page icon accompanies the English eyebrow, while the main title, copy and controls follow the selected language. The English font stack includes Vazirmatn so Persian record names retain their intended typography after switching to LTR.

## Data and behavior

All displayed metrics and cards use the existing authenticated Go workspace response. No fixture data was added to the frontend. Historical execution dates retain their original dates. Current presence requires a check-in on the server's current date in Asia/Tehran. Selecting a calendar day explicitly changes the shift scope to all records, and changing scope clears the selected date.

The new views call the existing creation, detail, stock, issue-update, evidence and approval flows. API authorization and PostgreSQL persistence retain their existing contracts. Cards have search/filtered empty states, and collections with enough rows have bounded pagination. The issue board uses explicit status controls rather than implying an unsupported drag action. Replenishment priorities concern stocked active shifts with fewer than 100 samples remaining.

## Implementation

- `web/src/components/collections.tsx`: shared illustrated page heading and collection controls.
- `web/src/components/page-panels.tsx`: reusable insights, card pagination, campaign/team/location/report/catalog cards, date agenda, stock breakdown, attendance guide and issue board.
- `web/src/components/operations.tsx` and `records.tsx`: page-specific filters, view state and connections to existing workflows.
- `web/src/app/pages.css`: page layouts, cards and responsive refinements, imported after the shared premium stylesheet.
- `web/src/app/globals.css`: Persian font fallback for mixed-language records in English mode.

## Verification

Validated on 18 November 2026 with the installed REA plugin and its provider-owned Chrome process. All **33 completed scenarios** and their retained evidence IDs are listed in [`operational-pages-qa.json`](operational-pages-qa.json).

- All nine pages rendered at 1440 × 1100 with loaded artwork and page-specific content.
- All nine pages rendered at 390 × 844; both the header and scrolled operational content were captured and visually reviewed.
- Campaign grid/table switching, detail dialog, matching search, empty search and clearing were exercised.
- Shift date selection, resetting to all dates and opening the execution drawer were exercised.
- Team profile dialogs, grid/table switching and forward/backward card pagination were exercised.
- Location detail/table switching, attendance guide/today filter, stock movement/history filtering, issue detail/board/table switching, report review dialogs and catalog product/client tabs were exercised.
- English LTR was checked on desktop team/catalog pages and mobile issue/shift pages. A final team capture verified the corrected font fallback for Persian names.
- TypeScript and the optimized Next.js production build passed. The nine SVG files parsed as valid XML.

Screenshots are in [`screenshots`](screenshots), prefixed `pages-`. The complete retained REA capture data is saved under the ignored `.local/reference` directory. A preliminary QA selector matched several card slots and was corrected before the completed scenarios. A temporary browser profile initially receives the expected unauthenticated workspace 401 before development demo sign-in; the completed captures showed no other browser console errors. These checks exercise the rendered frontend and its declared interactions; no operational records were modified by the QA scenarios.
