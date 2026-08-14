# HASM Markdown Design Policy

## Design direction

HASM Markdown is a quiet desktop writing tool built around **Serenity**, **Paper and Ink**, and **Mathematical Minimalism**. The interface should feel like a carefully typeset workroom: generous space, crisp geometric divisions, restrained motion, and a visible relationship to the HASM calculated logo.

Use an elegant Japanese Mincho serif for document content, editor text, preview text, and body copy: `Yu Mincho`, `游明朝`, `Georgia`, or `serif`. Serif text uses at least `0.03em` letter spacing and a comfortable `1.7` to `1.8` line height. Control labels may use a quiet sans-serif treatment, but must remain subordinate to the writing surface.

Avoid flashy animations, bright primary colors, generic flat UI, excessive rounded cards, decorative blobs, purple-on-white defaults, and marketing-style hero layouts. Use subtle geometric borders and restrained mathematical accents for dividers, active states, and focus indicators.

## Theme system

- Color patterns come from `src/hasm_color_pattern` and are selected from the workspace menu.
- Every theme value is a CSS Custom Property defined at `:root` and synchronized to the application root.
- UI chrome, editor text, inputs, dialogs, assets, and `markdown-it` preview must use the same variables and update immediately when a pattern changes.
- Never use pure `#000000` or `#FFFFFF` as a base surface. Prefer muted ink tones and paper-like off-whites.
- Theme changes must preserve readable contrast and must not expose secrets or document contents in logs.
- Never use a dark theme accent as foreground text on a dark surface. Derive contrast-safe readable accent and on-accent tokens for labels, links, active controls, warnings, and focus states; normal reading text must meet at least WCAG AA contrast where practical.

## Layout and interaction

- The default writing view is a responsive dual pane: Markdown editor on the left and rendered preview on the right.
- The main menu is a minimal hamburger control that opens an off-canvas drawer or overlay only when requested.
- The drawer contains file actions, theme selection, text scale, focus mode, asset management, and diagnostics.
- Text scale provides Small, Medium, and Large presets by changing the root `--base-font-size` variable.
- Focus modes provide Split, Editor, and Preview views. On narrow windows, panes stack with stable minimum dimensions.
- When workspace assets exist, the editor displays a compact, horizontally scrollable asset shelf with aliases and thumbnails. Selecting an asset inserts its Markdown reference at the current cursor without changing the stored asset syntax.
- Bootstrap may be used only for grid, flexbox, and structural layout utilities. Its default component appearance must be overridden with HASM styling. Do not add another UI library.
- Use familiar icons for icon-only controls, and provide accessible labels or tooltips for unfamiliar controls.
- Controls must have stable dimensions, clear focus states, and text that remains inside its parent at desktop and mobile sizes.
- Use meaningful, restrained page-load or reveal motion only when it improves orientation; never make motion necessary to complete a task.

## Implementation rules

- Keep changes in the owning React or Rust module documented by `docs/arch/02-directory-structure.md`.
- Prefer existing pattern APIs and shared logger functions over new abstractions or ad hoc logging.
- Preserve public interfaces and serialized data shapes unless a requirement explicitly changes them.
- Handle filesystem, archive, IPC, asset, and workspace-lock errors explicitly.
- When behavior changes, update the relevant architecture, requirement, evaluation, and test documentation in the same change.
- Run the narrowest relevant check first, then report the exact result and any unavailable checks.

## Review checklist

Before accepting a UI change, confirm that all pages and states use theme variables, the preview has no fixed white or dark fallback, the drawer works on mobile, the editor remains readable at all three scales, and dialogs and asset management share the same Paper and Ink language. Check that no unrelated refactor or generated artifact was introduced.
