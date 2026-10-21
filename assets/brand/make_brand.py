"""Draws the ForUs brand artwork as SVG and renders the PNGs the app needs."""
import subprocess
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
WORK = Path(__file__).parent / "svg"
WORK.mkdir(exist_ok=True)

# A heart on a 1024 grid, centred on (512, 512).
HEART = (
    "M512 812 C 292 668, 176 552, 176 418 "
    "C 176 300, 266 214, 378 214 "
    "C 442 214, 488 246, 512 292 "
    "C 536 246, 582 214, 646 214 "
    "C 758 214, 848 300, 848 418 "
    "C 848 552, 732 668, 512 812 Z"
)
# A play triangle sitting in the heart's optical centre.
PLAY = "M462 392 L462 590 L620 491 Z"

DEFS = """
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#b98aff"/>
    <stop offset="0.55" stop-color="#8b4dff"/>
    <stop offset="1" stop-color="#4f22c4"/>
  </linearGradient>
  <radialGradient id="shine" cx="0.3" cy="0.2" r="0.75">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="heartFill" x1="0" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="#c49bff"/>
    <stop offset="0.5" stop-color="#9b5cff"/>
    <stop offset="1" stop-color="#5f2ae0"/>
  </linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#241a3d"/>
    <stop offset="1" stop-color="#0c0a12"/>
  </linearGradient>
  <linearGradient id="board" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#2d2250"/>
    <stop offset="1" stop-color="#120e1e"/>
  </linearGradient>
  <!-- The clapsticks' diagonal black-and-white stripes. -->
  <pattern id="stripes" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
    <rect width="60" height="120" fill="#f6f4fa"/>
    <rect x="60" width="60" height="120" fill="#1a1430"/>
  </pattern>
  <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#2a0f6b" flood-opacity="0.55"/>
  </filter>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="40"/>
  </filter>
</defs>
"""


def mark(scale=1.0, white_heart=True, glow=False):
    """The heart-and-play mark, scaled about the canvas centre."""
    t = f"translate(512 512) scale({scale}) translate(-512 -512)"
    heart_fill = "#ffffff" if white_heart else "url(#heartFill)"
    play_fill = "url(#heartFill)" if white_heart else "#ffffff"
    halo = f'<path d="{HEART}" fill="#9b5cff" opacity="0.6" filter="url(#glow)"/>' if glow else ""
    return f"""
<g transform="{t}">
  {halo}
  <path d="{HEART}" fill="{heart_fill}" filter="url(#shadow)"/>
  <path d="{PLAY}" fill="{play_fill}" stroke="{play_fill}" stroke-width="34" stroke-linejoin="round"/>
</g>"""


def clapper(scale=1.0, dx=0, dy=0):
    """A film clapperboard with the heart-play on its board, the top stick
    tilted open. Drawn around (512, 560) on the 1024 grid."""
    t = f"translate({512 + dx} {560 + dy}) scale({scale}) translate(-512 -560)"
    return f"""
<g transform="{t}" filter="url(#shadow)">
  <!-- The board. -->
  <rect x="232" y="468" width="560" height="324" rx="44" fill="url(#board)"/>
  <rect x="232" y="468" width="560" height="324" rx="44" fill="none" stroke="#9b5cff" stroke-opacity="0.35" stroke-width="6"/>
  <!-- The lower clapstick, fixed to the board. -->
  <rect x="232" y="398" width="560" height="78" rx="16" fill="url(#stripes)"/>
  <!-- The upper clapstick, swung open from the hinge on the left. -->
  <g transform="rotate(-17 248 398)">
    <rect x="232" y="312" width="560" height="78" rx="16" fill="url(#stripes)"/>
  </g>
  <circle cx="250" cy="398" r="20" fill="#f6f4fa"/>
  <circle cx="250" cy="398" r="8" fill="#9b5cff"/>
  <!-- The ForUs mark on the board. -->
  <g transform="translate(0 118)">{mark(0.34)}</g>
</g>"""


def svg(width, height, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">{DEFS}{body}</svg>'


def render(name, content, width, height):
    src = WORK / f"{name}.svg"
    src.write_text(content)
    subprocess.run(["rsvg-convert", "-w", str(width), "-h", str(height), "-o", str(OUT / f"{name}.png"), str(src)], check=True)


# Full app icon: the clapperboard on the purple gradient.
render("icon", svg(1024, 1024, f'<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#shine)"/>{clapper(1.08, dy=-20)}'), 1024, 1024)

# Adaptive icon: Android masks it to a circle or squircle, so the mark stays
# inside the central safe zone and the gradient is a separate layer.
render("adaptive-icon", svg(1024, 1024, clapper(0.82, dy=-12)), 1024, 1024)
render("adaptive-background", svg(1024, 1024, '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#shine)"/>'), 1024, 1024)

# Splash: the purple mark with a soft glow, on transparent (the splash
# background colour is the app's own dark).
render("splash-icon", svg(1024, 1024, mark(0.82, white_heart=False, glow=True)), 1024, 1024)

# Android TV launcher banner (320x180 dp, rendered at 2x): the clapperboard and
# the wordmark.
banner = f"""
<rect width="1280" height="720" fill="url(#dark)"/>
<circle cx="340" cy="360" r="260" fill="#9b5cff" opacity="0.18" filter="url(#glow)"/>
<g transform="translate(-170 -190)">{clapper(0.62)}</g>
<text x="540" y="425" font-family="Noto Sans" font-weight="900" font-size="190" fill="#f6f4fa" letter-spacing="-6">For<tspan fill="#a06bff">Us</tspan></text>
"""
render("tv-banner", svg(1280, 720, banner), 400, 240)
render("tv-banner-large", svg(1280, 720, banner), 1280, 720)

print("rendered:", sorted(p.name for p in OUT.glob("*.png") if p.stem in {"icon", "adaptive-icon", "adaptive-background", "splash-icon", "tv-banner", "tv-banner-large"}))

# Android's notification bar icon: a white silhouette on transparent, here the
# heart with the play symbol cut out of it.
notification = f"""
<mask id="cut"><rect width="1024" height="1024" fill="#fff"/>
  <path d="{PLAY}" fill="#000" stroke="#000" stroke-width="34" stroke-linejoin="round"/></mask>
<g transform="translate(512 512) scale(1.12) translate(-512 -512)">
  <path d="{HEART}" fill="#ffffff" mask="url(#cut)"/>
</g>"""
render("notification-icon", svg(1024, 1024, notification), 96, 96)
