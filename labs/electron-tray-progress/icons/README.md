# Tray Icons

This directory should contain tray icons for each state:

- `idle.png` - Gray circle (16x16)
- `running.png` - Blue circle (16x16)
- `running2.png` - Darker blue circle for animation (16x16)
- `paused.png` - Yellow/amber circle (16x16)
- `complete.png` - Green circle (16x16)
- `error.png` - Red circle (16x16)

If icons are missing, TrayProgressManager creates simple colored circle fallbacks.

## Creating Custom Icons

For best results, create 16x16 PNG icons with transparency. On macOS, also consider providing @2x versions (32x32) named `idle@2x.png`, etc.

### Color Scheme

| State | Color (Hex) | Description |
|-------|-------------|-------------|
| idle | #808080 | Gray - waiting |
| running | #00aaff | Blue - active |
| running2 | #0088cc | Darker blue - animation frame |
| paused | #ffaa00 | Amber - paused |
| complete | #00ff88 | Green - success |
| error | #ff4444 | Red - error |

### Tool Suggestions

- Figma/Sketch for vector design
- ImageMagick for batch conversion
- `nativeImage.createFromDataURL()` for programmatic icons
