# Margin | Mini brand guide

Private text and Markdown workspace. Working name: Margin.

## Identity
- Idea: A document outline with a colored text margin and baseline.
- Icon: `icon.svg` is the master artwork. Do not add text to small icons.
- Tone: Quiet, efficient, precise and personal.
- Short descriptor: Private notes and code, in one place.

## Colors (from existing app)
- Dark background: `#1E1F22`
- Surface: `#26282C`
- Blue accent: `#5EA1FF`
- Main text: `#D8DBE0`
- Light background: `#F5F6F8`
- Light accent: `#0B62D6`

Keep the existing CSS variables, fonts and overall UI spacing. No new design system is required.

## Assets
- `icon.svg`: scalable master
- `icon-192.png`, `icon-512.png`: installable web app
- `icon-maskable-512.png`: maskable install icon, with reduced symbol
- `favicon.ico`, `favicon-16.png`, `favicon-32.png`: browser tab
- `apple-touch-icon.png`: saved link

## Suggested implementation
1. Copy all icon files into `web/icons/`.
2. In `web/manifest.webmanifest`, update `name` and `short_name` to `Margin` and keep existing icon entries.
3. In `web/index.html` and `web/login.html`, replace the title `Notepad` with `Margin`.
4. Add `<link rel="icon" href="/icons/favicon.ico" sizes="any">` and `<link rel="icon" type="image/svg+xml" href="/icons/icon.svg">` to both page heads.
5. Add `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` where useful.
6. Keep `--accent`, dark/light themes and existing interface behavior unchanged.
7. Verify icon rendering at 16px and in installed PWA mode.

Names are not checked for trademark or domain availability. No repository changes were made.
