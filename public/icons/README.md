# PWA Icons

This folder contains placeholder icons for the News Crawler PWA.

## Required Icons

For production, replace these placeholder files with properly designed icons:

| File | Size | Purpose |
|------|------|---------|
| `icon-72.png` | 72x72 | Android legacy |
| `icon-96.png` | 96x96 | Android legacy |
| `icon-128.png` | 128x128 | Chrome Web Store |
| `icon-144.png` | 144x144 | Windows tiles |
| `icon-152.png` | 152x152 | iOS touch icon |
| `icon-192.png` | 192x192 | Android/Chrome, manifest |
| `icon-384.png` | 384x384 | High DPI devices |
| `icon-512.png` | 512x512 | Splash screen, manifest |

## Optional Shortcut Icons

| File | Size | Purpose |
|------|------|---------|
| `icon-feed.png` | 192x192 | Feed shortcut |
| `icon-saved.png` | 192x192 | Saved articles shortcut |
| `icon-breaking.png` | 192x192 | Breaking news shortcut |

## Optional Screenshots

| File | Size | Purpose |
|------|------|---------|
| `screenshot-wide.png` | 1280x720 | Desktop PWA install |
| `screenshot-narrow.png` | 720x1280 | Mobile PWA install |

## Icon Design Guidelines

1. **Simple and recognizable** - News/document icon with recognizable symbol
2. **Safe zone** - Keep important content within center 80% for maskable icons
3. **Background color** - Use `#1a1a2e` (app theme color) or transparent
4. **Format** - PNG with transparency for non-maskable, solid color for maskable

## Generation Tools

Use these tools to generate icons from a source image:

- [PWA Asset Generator](https://github.com/nicegoodthings/pwa-asset-generator)
- [Real Favicon Generator](https://realfavicongenerator.net/)
- [Maskable.app Editor](https://maskable.app/editor)

## Current Placeholder

The current icon-192.png and icon-512.png are 1x1 pixel placeholder PNGs.
Replace with actual icons before production deployment.
