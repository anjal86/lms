# Project Guidelines & Agent Instructions

## Frontend Design Standards: Anti-Slop / Linear-Attio Grade
All UI components in this project must strictly adhere to the **`anti-slop-ui`** skill:
1. **No Bubbly Cards**: Max border-radius `rounded-md` (6px) or `rounded-lg` (8px). No `rounded-2xl` or `rounded-3xl` on cards.
2. **No Pastel Badge Soup**: Use 6px micro status dots + neutral text instead of colored pill badges (`bg-emerald-50`, `bg-blue-50`, etc.).
3. **High Data Density**: Tables must be compact (`h-9` / `py-2`), with crisp 1px borders (`border-zinc-200` in light mode, `border-zinc-800` in dark mode).
4. **Zinc Palette**: Use the neutral zinc scale (`zinc-950`, `zinc-900`, `zinc-800`, `zinc-200`, `zinc-100`, `zinc-50`) instead of generic blue/teal slop.
5. **Monospace Tabular Numbers**: Currency, dates, phone numbers, and lead codes must use `font-mono font-medium tracking-tight`.
6. **Flyout Drawers**: Prefer slide-over inspection drawers instead of jarring full-screen centered dialogs.

## Accessibility & Responsive Standards: UI/UX Pro Max
All screens and components must also strictly comply with the **`ui-ux-pro-max`** skill (`.agents/skills/ui-ux-pro-max/`):
1. **WCAG 2.2 AA Compliance**:
   - Every icon-only button (`<button>`, `<a>`, `<Link>`) must possess a descriptive, contextual `aria-label`.
   - Modals and drawers must include `role="dialog"`, `aria-modal="true"`, and appropriate `aria-labelledby` or `aria-label`.
   - Every form input, textarea, and select dropdown must have an associated `<label>` or an `aria-label`.
2. **Keyboard Focus States**:
   - Interactive inputs must never have focus indicators suppressed without an active replacement.
   - Global ring styling: `focus-visible:ring-1 focus-visible:ring-zinc-950 focus-visible:border-zinc-950`.
3. **Responsive Mobile Ergonomics (375px - 430px)**:
   - Desktop sidebars must be hidden on mobile (`hidden md:flex`) and replaced with a slide-over mobile navigation drawer in `Header.tsx`.
   - Primary mobile touch targets must meet the minimum 44×44px interactive area (`min-h-[44px]`).
4. **Reduced Motion & Cursor Ergonomics**:
   - Global cursor pointer enforced on all interactive elements (`button`, `select`, `a`, `summary`).
   - Honor `@media (prefers-reduced-motion: reduce)` by suppressing transitions and animations.
5. **Skill CLI Search Tooling**:
   - Query design system, accessibility, and chart recommendations before implementing UI using `py .agents/skills/ui-ux-pro-max/scripts/search.py "<query>"`.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
