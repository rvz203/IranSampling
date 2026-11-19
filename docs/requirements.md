# Proposal review and implementation scope

The requirements come from the locally supplied `FaraCode_Sampling_Operations_Proposal.pdf`. The review covered all six pages, including the phase-one scope and acceptance criteria on pages 3–4.

The document proposes a first version of a sampling operations system for Iran Sampling. Its operational sequence is campaign and point definition → shift planning → staff assignment → on-location attendance → readiness confirmation → distribution, inventory and issue recording → checkout and reporting → supervisor review → management reporting.

## Traceability

| Proposal area | Implementation |
| --- | --- |
| Base data and access | PostgreSQL people, role-based Go authorization, customers, brands and products; team and catalog screens |
| Operations planning | Campaigns with dates, targets and briefs; geocoded execution points; timed shifts, supervisors, staffing and assignment |
| Field execution | Mobile shift workspace, directions, GPS check-in/out, sample count and authenticated photo evidence |
| Supervisor control | Scoped team/point visibility, readiness confirmation, issue follow-up and report approve/return |
| Shift inventory | Immutable movements for initial, added, distributed, damaged and returned quantities; live balance; serialized mutations |
| Issues and alerts | Priority, accountable owner, status changes, dashboard notifications and audit history |
| Dashboard and reports | Daily operational metrics, distribution chart, campaign progress, attendance and stock views, shift reviews and CSV |
| Traceability | Every mutation writes an audit record in the same database transaction; photos link to person, point via shift, and server time |

## Implementation choices where the proposal leaves rules open

- Persian is the default, as requested. English translates interface controls and changes layout direction. User-entered Persian records retain their original text.
- Administrator, manager and coordinator can plan operations. Supervisors see their supervised shifts; samplers see assigned shifts. Field actions are scoped on the server rather than only hidden in the UI.
- A location has a configurable 50–5,000 metre attendance radius (500 m by default). GPS accuracy must be positive and no worse than 150 m. Check-in is accepted from one hour before shift start until two hours after shift end. Existing arrivals may be checked out later with valid GPS at the point. Coordinates and server time are stored; this does not constitute tamper-proof proof of attendance. Shift inputs and campaign date boundaries use Tehran time, independently of the browser timezone.
- New staff assignments must fit the shift's capacity, target an active sampler, and not overlap another unfinished assigned shift.
- Distribution requires supervisor-confirmed readiness. Samplers must check in before recording inventory movements. Reviewers can reconcile the ledger for their scoped shifts.
- Submitting a new report requires all checked-in people to check out and at least one image. A sampler must have personally completed attendance. Imported demo history represents previous shifts and does not invent photos.
- A pending report freezes stock, new arrivals, staffing and readiness changes. Returning a report reopens editing; the return requires meaningful feedback. Approval requires zero remaining stock and no unresolved urgent issues, then completes and locks the shift. Approved reports cannot be silently re-approved or edited, and urgent issues on approved shifts remain resolved.
- The overview reports today's activity and a 7/14-day trend. CSV export supports 7/30/90-day periods and city selection. Every displayed operational quantity comes from persisted records.
- The map is explicitly labeled as schematic. Markers use actual saved coordinates; the streets are illustrative and require no third-party map service. Directions open a conventional map provider.
- Evidence is limited to authenticated JPEG/PNG images, 8 MB and 25 megapixels. Original names are metadata; random server-generated names are used on disk.
- The field app queues location samples and photo files during a connection outage and retries them for the same account. Check-in, check-out, inventory, issue and report writes use the online server rules. A successful web write followed by a failed read offers refresh without repeating the committed write.

## Phase-one boundaries

The PDF lists recruitment and testing, structured training, dynamic form building, automatic wages and payments, advanced staff evaluation, complex analytics, intelligent allocation and AI features as later-phase work. Those are not represented as implemented features.

This repository implements the core workflows and the added Android/iOS field app. Location sharing is limited to the active shift with the worker's permission. The app targets 30-second samples and shows stale locations when the OS or connection delays delivery. The proposal's commercial terms, SMS notifications, identity federation and third-party business-system integrations remain outside the implementation.

The remaining product validation is a real pilot with agreed operating locations, role rules, acceptable GPS radius/accuracy, connectivity expectations, and stakeholder acceptance scenarios.
