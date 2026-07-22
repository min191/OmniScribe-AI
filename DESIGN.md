---
version: alpha
name: OmniScribe Proofing Workstation
description: A three-column OCR proofing workstation for turning photographed pages into verified Markdown and Obsidian notes.
colors:
  primary: "#154FB3"
  chrome: "#1A1D1C"
  machine-canvas: "#D9D4C6"
  paper-panel: "#F1EDE2"
  graphite: "#1B1E1C"
  cobalt: "#154FB3"
  amber-signal: "#F2A900"
  success: "#3F7F4A"
  danger: "#A33E32"
  hairline: "#77736A"
  on-dark: "#F1EDE2"
  on-success: "#FFFFFF"
  cobalt-soft: "#D9E3F5"
typography:
  wordmark:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: 0.08em
  panel-title:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: 0.09em
  status:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.04em
  folio:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.4
  ocr-console:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.62
  body:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.6
  body-strong:
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.5
rounded:
  none: 0px
  xs: 2px
  sm: 4px
  md: 6px
spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
components:
  app-shell:
    backgroundColor: "{colors.machine-canvas}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
  app-header:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.on-dark}"
    typography: "{typography.status}"
    height: 68px
  paper-panel:
    backgroundColor: "{colors.paper-panel}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
    padding: "{spacing.sm}"
  panel-title:
    backgroundColor: "{colors.machine-canvas}"
    textColor: "{colors.graphite}"
    typography: "{typography.panel-title}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-dark}"
    typography: "{typography.panel-title}"
    rounded: "{rounded.xs}"
    padding: "{spacing.sm} {spacing.md}"
    height: 44px
  status-signal:
    backgroundColor: "{colors.amber-signal}"
    textColor: "{colors.graphite}"
    typography: "{typography.status}"
    rounded: "{rounded.md}"
  success-state:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    typography: "{typography.status}"
  danger-state:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-dark}"
    typography: "{typography.status}"
  proofing-gutter:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-dark}"
    typography: "{typography.folio}"
    width: 48px
  selected-row:
    backgroundColor: "{colors.cobalt-soft}"
    textColor: "{colors.graphite}"
    typography: "{typography.body}"
    rounded: "{rounded.xs}"
  divider:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.on-success}"
    height: 1px
---

# OmniScribe Proofing Workstation

## Visual Reference

Image #1 is the approved reference for visual hierarchy, density, and the relationship between machine chrome, paper panels, status lamps, and the central proofing console. A repository copy lives at [`docs/design/omniscribe-workstation-reference.png`](docs/design/omniscribe-workstation-reference.png). It is a hierarchy reference, not permission to reproduce invented data.

The product is a working OCR proofing station for people who need to inspect photographed pages before saving them as linked Markdown. The interface must feel like one coherent instrument. It is not a marketing page, a dashboard of invented metrics, or a collection of floating cards.

## Design Thesis

The screen uses the vocabulary of a document workstation: black equipment chrome, warm machine enamel, paper inspection surfaces, compact mono readouts, and visible operational state. The central Markdown console is always the protagonist. The source queue explains where its contents came from; the inspector explains how the final note will be organized.

The single signature is a cobalt line-number and proofing gutter paired with one amber status lamp. Cobalt encodes sequence, focus, and registration. Amber means an active machine state. Neither is decorative.

## Layout

Both `/` and `/jobs/:jobId` use the same shell and panel primitives.

```text
┌────────────────── real backend, phase, pages, progress ──────────────────┐
│  SOURCE / QUEUE / PIPELINE  │  LIVE OCR MARKDOWN  │  META / GRAPH / SAVE │
│            24%              │         47%         │          29%         │
└───────────────────────────────────────────────────────────────────────────┘
```

The upload route keeps the console and inspector visible in honest empty or disabled states. The job route turns the source column into a read-only summary and page queue. It never suggests that pages can be added to a running job.

Panel borders are double or nested hairlines with a shallow two-pixel shadow. Radius is limited to 0, 2, 4, or 6 pixels. Surfaces should look seated in a machine chassis, never like floating product cards.

## App Header

The header is black equipment chrome. The wordmark, phase, page count, backend state, demo state, and progress use IBM Plex Mono. Every readout comes from current application state.

Do not show model memory, user counts, made-up accuracy, fake latency, or any reference-image metric that the application cannot prove. The backend lamp includes a text label, so status never depends on color alone.

## Source and Queue

The upload source accepts only JPG and PNG, up to eight images and 10 MB per image. Validation copy names the file and the limit. Reorder remains available through drag and explicit up/down controls; remove is a separate danger action.

On a job, source information is read-only. Queue rows show the real filename, folio, page thumbnail, and one of: waiting, processing, done, or error. Selecting a page opens that image in source mode. In Markdown mode it scrolls to the corresponding proofing section.

On mobile, the queue becomes a horizontal strip. It must not create a second vertical scroll region.

## Pipeline

The pipeline always contains exactly five steps:

1. Nhận trang.
2. GLM OCR.
3. Tổ chức nội dung.
4. Kiểm tra bản nháp.
5. Lưu Obsidian.

Completed, current, waiting, and interrupted steps combine a mark, label, and status text. The UI maps these states from existing job and page status values without changing the backend contract.

## OCR Markdown Console

`OCR Markdown trực tiếp` is the default and remains the default after `document.ready`. The toolbar order is Markdown, Ảnh gốc, Xem trước, Chỉnh sửa. Editing is disabled until the final document is ready.

Raw Markdown uses IBM Plex Mono and the cobalt numbered gutter. Page sections are always arranged by upload order. A queued or processing page has an explicit placeholder; a failed page has an error block. `page.ocr_completed` replaces the relevant placeholder with the complete Markdown for that page. This is honest page-level streaming, not simulated token typing.

`document.ready` replaces the live composition with the final Markdown. Reloading a job must rebuild the same console from the snapshot. Source images stay reachable even though Markdown is the primary view.

Rendered preview uses the same Be Vietnam Pro and IBM Plex Mono families as the interface. Do not introduce a serif display face. Editing must use a clearly bounded textarea and never turn preview content silently editable.

## Metadata Inspector

The inspector uses only the current schema: title, summary, document type, category, tags, and topics. Tags are deduplicated in priority order and limited to the three most representative values. Before `document.ready`, fields are disabled and visibly pending. After readiness they are ordinary editable values owned by the user.

Saving to Obsidian stays disabled until the document is ready and title is non-empty. Export success shows the real note path and open URI. Export failure stays actionable and leaves the document available for another attempt.

## Knowledge Graph

The graph is a hybrid of final metadata and links from explicitly configured local vault roots. The current document is the visual focus; category supplies its broad organizing context, while notes, topics, and up to three tags retain distinct semantic roles. Page images remain provenance in the source queue and never become knowledge nodes.

The graph uses one persistent force-simulation world per job. New graph responses are reconciled by node ID: existing nodes keep `x/y/vx/vy`, while new nodes seed beside a known neighbor at a stable hashed angle. The simulation remains alive across preview/Explorer mounting, search, filters, Local/Global changes, resize, zoom, and selection. Hidden nodes stay in physics so restoring a filter never rebuilds the layout.

The compact B2 preview is the complete depth-1 neighborhood around the current document, with no six-node cap. Explorer projects either a depth-1/depth-2 Local graph around the selected node or the full Global response, while both surfaces render the same world coordinates. Node dragging applies local heat: direct neighbors respond through link forces while distant nodes are damped. Pan, zoom, fit, and reset change only the camera.

Nodes are small Obsidian-like circular glyphs rather than cards: amber current document, cobalt category, paper/cobalt topic, green tag, and paper/graphite vault note; temporary nodes use a dashed outline. Degree changes glyph radius within a narrow bound. Labels use IBM Plex Mono with a paper halo and progressive zoom visibility. Circle collision protects glyphs, rectangular collision protects label footprints, and clipped quadratic edge routes avoid unrelated nodes/labels when a straight route would intersect them.

Keyboard users move spatially between nodes with arrow keys and select with Enter or Space. The dialog closes with Escape and restores focus. Empty, unavailable-vault, filtered, and truncated states must remain explicit in both Vietnamese and English.

## Responsive Behavior

- At 1200px and above, use the full three-column 24/47/29 grid and `100dvh`. Each column may scroll within the workstation.
- From 800px to 1199px, use a 240px source column plus the console. Metadata and graph open in a keyboard-operable drawer with a dismissible scrim.
- Below 800px, use one document-flow column: console first, source and horizontal queue second, metadata and graph third. Remove fixed heights and nested vertical scrolling.
- All interactive targets are at least 44px. Long filenames truncate visually while their accessible name and `title` retain the full value.

## Motion

Use motion to express processing and spatial continuity. An amber registration line may scan the active Markdown section while GLM OCR is running. Progress width may transition for at most 300ms. The graph simulation settles continuously, drag reheats only its neighborhood, and Local/Global opacity/camera transitions last about 160ms. Hover and drawer transitions last 120–180ms.

`prefers-reduced-motion` removes the scan animation and makes transitions effectively immediate. Processing still has visible text and numeric progress.

## Accessibility

- Maintain WCAG AA contrast for text and controls.
- Every interactive element receives a visible three-pixel amber focus ring with a two-pixel offset.
- Pair status color with text or a readable icon.
- Use live regions for offline, reconnection, validation, partial failure, and export results.
- Preserve logical DOM reading order when columns collapse.
- Keep source switching, page selection, reordering, editing, metadata, drawer dismissal, and export keyboard operable.

## Do

- Use real filenames, status, progress, Markdown, metadata, and export paths.
- Keep the console visible as the dominant surface on every route.
- Preserve partial page failures while successful pages continue.
- Use cobalt only for proofing sequence, selection, focus, and primary action.
- Use amber only for active machine state and focus visibility.
- Keep Vietnamese copy direct, specific, and operational.

## Don't

- Do not add a marketing hero, gradient glow, glass card, or oversized display headline.
- Do not fake token streaming, memory, model, user, accuracy, or timing metrics.
- Do not advertise unsupported formats or controls.
- Do not use retro decoration that communicates no state.
- Do not infer cross-links the metadata does not contain.
- Do not read directly from an Obsidian vault for graph preview.
- Do not change endpoint paths, request schemas, or SSE event names for visual work.

## Implementation Contract

1. Shared `WorkbenchShell` owns the header, three-column grid, panel primitive, and responsive collapse for both routes.
2. `page.ocr_completed` continues to carry complete Markdown for one page. The frontend composes the live document from `job.pages` in numeric order.
3. `document.ready` remains the final source of Markdown and metadata.
4. Graph fallback data is derived from final metadata; the graph-preview endpoint may enrich it only from configured safe vault roots without returning absolute paths or note contents.
5. JPG/PNG, eight-file, 10 MB limits and partial-page errors remain unchanged.
6. Verify empty upload, backend offline, demo, reorder/remove, processing, organizing, partial error, ready, edit, export success/failure, and reload states.
7. Run `npm run design:lint`, `npm run test`, `npm run lint`, `npm run build`, and the backend suite before handoff.
