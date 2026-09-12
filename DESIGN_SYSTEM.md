# Wanderlust App Design System

This is the UI contract for the CRM. New screens and refactors should use these tokens and component classes instead of creating page-specific visual rules.

## Product principles

1. **Full-width workspace by default** — authenticated pages use the full available content area beside the sidebar.
2. **Dense, calm, operational UI** — compact controls, crisp dividers, restrained color, no oversized cards.
3. **One neutral base** — zinc/white surfaces with blue as the primary accent.
4. **Color means something** — red is urgent/error, amber is warning/due, emerald is success, blue is selection/action.
5. **Simple hierarchy** — page title → section title → body → muted metadata.
6. **Consistent interaction sizes** — 32px compact controls and 40px default controls.

## Token architecture

The source of truth is `src/app/globals.css`.

### Primitive tokens

Raw values such as zinc, blue, red, amber and emerald colors; spacing; radii; and control heights.

Examples:

- `--zinc-200`
- `--blue-600`
- `--space-4`
- `--radius-md`
- `--control-md`

Do not reference primitive tokens directly in feature components unless a semantic token does not exist.

### Semantic tokens

Use these for intent:

- `--color-canvas`
- `--color-surface`
- `--color-surface-subtle`
- `--color-surface-hover`
- `--color-border`
- `--color-border-strong`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-muted`
- `--color-accent`
- `--color-danger`
- `--color-warning`
- `--color-success`

Tailwind aliases are available:

- `bg-canvas`
- `bg-surface`
- `bg-surface-subtle`
- `border-line`
- `border-line-strong`
- `text-ink`
- `text-ink-secondary`
- `text-ink-muted`
- `text-accent`
- `text-danger`
- `text-warning`
- `text-success`

## Page layout

Authenticated screens are full-width automatically through `AppShell`.

Preferred root:

```tsx
<div className="app-page">
  <div className="page-header">
    <div>
      <p className="page-eyebrow">Leads</p>
      <h1 className="page-title">All leads</h1>
      <p className="page-description">Manage active travel inquiries.</p>
    </div>
    <div className="page-actions">...</div>
  </div>

  ...content
</div>
```

`workspace-page`, `workspace-header`, `workspace-title`, `workspace-eyebrow`, and `workspace-description` remain supported aliases.

### Page spacing

Do not add `max-w-* mx-auto` to authenticated page roots.

The shell controls horizontal and vertical gutters using:

- Desktop: 32px horizontal / 24px vertical
- Medium: 24px horizontal
- Mobile: 16px horizontal / 16px vertical

## Surfaces

Use:

```tsx
<section className="panel">...</section>
```

or:

```tsx
<section className="surface-flat">...</section>
```

Structured panels should use:

```tsx
<section className="panel">
  <div className="panel-header">...</div>
  <div className="panel-body">...</div>
  <div className="panel-footer">...</div>
</section>
```

Avoid `rounded-2xl`, large shadows, gradients, or decorative card colors for normal CRM data.

## Buttons

Available classes:

- `button-primary` — one primary action per region
- `button-secondary` — normal secondary action
- `button-ghost` — low-emphasis action
- `button-danger` — destructive action only
- `button-sm` — compact modifier

Do not create new button geometry per page.

## Form controls

Use:

- `field`
- `select-field`
- `textarea-field`
- `field-sm` for compact toolbar controls

Labels should generally be 11–12px, medium weight, zinc muted text.

## Toolbars and filters

Use `toolbar` or `filter-bar`, then group controls inside `toolbar-group`.

Keep filters compact. Prefer one horizontal row on desktop and wrapping on smaller screens.

## Metrics

Use:

```tsx
<div className="metric-grid">
  <div className="metric">
    <div className="metric-label">Active leads</div>
    <div className="metric-value">128</div>
    <div className="metric-hint">Currently open</div>
  </div>
</div>
```

Numbers, currency, IDs and timestamps should use monospace/tabular styling where practical.

## Status

Prefer a status dot with neutral text over colored pills:

```tsx
<span className="status-line">
  <span className="status-dot status-dot-success" />
  Available
</span>
```

Variants:

- `status-dot-success`
- `status-dot-warning`
- `status-dot-danger`
- `status-dot-info`

Reserve colored backgrounds for genuinely urgent or selected states.

## Tables

Tables inside `#main-content` inherit the shared table system automatically:

- full width
- compact cells
- consistent header typography
- shared borders
- subtle row hover

Feature pages should not redefine table row padding unless the content requires a special layout.

## Empty states

Use:

```tsx
<div className="empty-state">
  <h3 className="empty-state-title">No follow-ups</h3>
  <p className="empty-state-description">You are caught up for now.</p>
</div>
```

## Typography

- Page title: 24px, semibold
- Section heading: 13px, semibold
- Body: 13–14px
- Metadata: 12px
- Micro-label: 11px
- Numeric operational values: monospace

Avoid oversized dashboard headings unless the screen is intentionally marketing-oriented.

## Radius and shadows

- Default control radius: 6px
- Default panel radius: 8px
- Large app radius: 10px maximum for standard workspace UI
- Default panel shadow: very subtle; borders provide most separation

## Rules for new UI

Before merging a new screen:

1. Root uses `app-page` or `workspace-page`.
2. No authenticated page root uses `max-w-*`.
3. Panels use `panel`, `surface`, or `surface-flat`.
4. Buttons use the shared button classes.
5. Form controls use the shared field classes.
6. Status color is restrained and meaningful.
7. Tables use the shared table defaults.
8. Mobile content remains usable at 16px page gutter.
9. Avoid one-off hex colors when an existing semantic token fits.
10. Avoid adding a new radius, shadow, control height, or spacing pattern without updating the design system first.
