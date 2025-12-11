# Chapter 1: The SVG Coordinate System

*Understanding where things are before you can put them where you want.*

---

## 1.1 The Origin and Axes

Every SVG has a coordinate system. Understanding it is **the most fundamental skill** for spatial reasoning.

### The Basic Setup

```
(0,0) ─────────────────────────────────► X
  │
  │     Positive X = moving RIGHT
  │     Positive Y = moving DOWN
  │
  │         (100, 50)
  │            •
  │
  │
  ▼
  Y
```

**Key Insight**: Unlike typical mathematics where Y increases upward, **SVG Y increases downward**. This matches how screens render pixels from top to bottom.

### The Origin (0, 0)

The origin is the **top-left corner** of the SVG canvas. All coordinates are measured from this point.

| Coordinate | Meaning |
|------------|---------|
| (0, 0) | Top-left corner |
| (100, 0) | 100 units right of origin, at top |
| (0, 100) | 100 units down from origin, at left |
| (100, 100) | 100 right and 100 down |

### ⚠️ Common Mistake

**Wrong intuition**: "I want to move something up, so I'll increase Y"
**Correct**: To move UP, **decrease** Y. To move DOWN, **increase** Y.

```
Moving UP    = subtract from Y (y - amount)
Moving DOWN  = add to Y (y + amount)
Moving LEFT  = subtract from X (x - amount)
Moving RIGHT = add to X (x + amount)
```

---

## 1.2 The viewBox Attribute

The `viewBox` defines what portion of the infinite coordinate plane is visible.

### Syntax

```xml
<svg viewBox="minX minY width height">
```

### Example

```xml
<svg viewBox="0 0 800 600" width="800" height="600">
```

This means:
- Start viewing at coordinate (0, 0)
- Show 800 units of width
- Show 600 units of height
- Display at 800×600 pixels

### Why viewBox Matters

The viewBox enables **coordinate system independence**. You can design in one coordinate system and display at any size:

```xml
<!-- Same content, different display sizes -->
<svg viewBox="0 0 100 100" width="50" height="50">   <!-- 50% size -->
<svg viewBox="0 0 100 100" width="100" height="100"> <!-- 100% size -->
<svg viewBox="0 0 100 100" width="200" height="200"> <!-- 200% size -->
```

### The Four viewBox Numbers

```
viewBox="minX minY width height"
         │    │    │      │
         │    │    │      └── How tall the view is
         │    │    └── How wide the view is
         │    └── Y coordinate of top-left corner of view
         └── X coordinate of top-left corner of view
```

### Panning with viewBox

To "pan" the view (show a different area), change minX and minY:

```xml
<!-- Normal view, origin at top-left -->
<svg viewBox="0 0 800 600">

<!-- Panned right 100 units (shows x=100 to x=900) -->
<svg viewBox="100 0 800 600">

<!-- Panned down 50 units (shows y=50 to y=650) -->
<svg viewBox="0 50 800 600">
```

---

## 1.3 Coordinate Spaces

SVG has multiple coordinate spaces that nest inside each other.

### The Three Main Spaces

1. **Screen Space** (pixels on monitor)
2. **SVG Space** (the viewBox coordinate system)
3. **Local Space** (coordinates relative to a group or element)

### Local Space with Groups

When you use `<g transform="translate(x,y)">`, you create a **local coordinate system**:

```xml
<svg viewBox="0 0 400 300">
  <!-- This group moves its local origin to (100, 50) -->
  <g transform="translate(100, 50)">
    <!-- In local space, this rect is at (10, 10) -->
    <!-- In SVG space, it's at (110, 60) -->
    <rect x="10" y="10" width="50" height="30"/>
  </g>
</svg>
```

### Computing Absolute Position

To find where something really is, **add up all the transforms**:

```
Absolute Position = Local Position + Sum of all parent translates
```

**Example**:
```xml
<g transform="translate(100, 50)">
  <g transform="translate(20, 10)">
    <rect x="5" y="5"/>
  </g>
</g>

Absolute X = 5 + 20 + 100 = 125
Absolute Y = 5 + 10 + 50 = 65
```

---

## 1.4 Units and Measurements

### Default Units

If you don't specify units, SVG uses **user units** (abstract units defined by viewBox):

```xml
<rect x="100" y="50" width="200" height="100"/>
<!-- 100, 50, 200, 100 are all in user units -->
```

### Explicit Units

SVG supports these units:

| Unit | Meaning | Usage |
|------|---------|-------|
| (none) | User units | Most common for internal coordinates |
| `px` | Pixels | Screen display |
| `%` | Percentage | Relative to container |
| `em` | Font size | Text-relative sizing |
| `pt` | Points | Print (1pt = 1/72 inch) |
| `mm`, `cm` | Metric | Print layouts |
| `in` | Inches | Print layouts |

### Best Practice

**Use user units without explicit unit suffixes** for almost everything. Let viewBox and width/height handle the conversion to screen pixels.

```xml
<!-- Good: consistent user units -->
<svg viewBox="0 0 1200 700" width="1200" height="700">
  <rect x="100" y="50" width="200" height="100"/>
</svg>

<!-- Avoid: mixing units -->
<rect x="100px" y="5em" width="2in" height="50mm"/>
```

---

## 1.5 Practical Exercises

### Exercise 1: Predict the Position

Given this SVG:
```xml
<svg viewBox="0 0 400 300">
  <g transform="translate(50, 25)">
    <circle cx="100" cy="75"/>
  </g>
</svg>
```

**Question**: What is the absolute position of the circle's center?

**Answer**: 
- Absolute X = 100 + 50 = 150
- Absolute Y = 75 + 25 = 100
- Center is at (150, 100)

### Exercise 2: Moving Elements

You have a rectangle at (200, 150). You want to move it:
- 50 units to the left
- 30 units up

**Question**: What should the new coordinates be?

**Answer**:
- New X = 200 - 50 = 150 (left = subtract)
- New Y = 150 - 30 = 120 (up = subtract, because Y is inverted)
- New position: (150, 120)

---

## 1.6 Decision Tree: Where Is This Element?

Use this flowchart to find the absolute position of any element:

```
START
  │
  ▼
┌─────────────────────────────────────┐
│ Read the element's x, y (or cx, cy) │
│ Call these: localX, localY          │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│ Does element have a parent <g>?     │
└─────────────────────────────────────┘
  │
  ├── NO ──► localX, localY is the absolute position. DONE.
  │
  ▼ YES
┌─────────────────────────────────────┐
│ Read parent's transform attribute   │
│ Extract translate(tx, ty)           │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│ Add to running total:               │
│   totalX += tx                      │
│   totalY += ty                      │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│ Move to grandparent <g>             │
│ Repeat until no more parents        │
└─────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────┐
│ absoluteX = localX + totalX         │
│ absoluteY = localY + totalY         │
└─────────────────────────────────────┘
  │
  ▼
DONE
```

---

## 1.7 Formula Reference

### Position After Translate

```
absoluteX = localX + translateX₁ + translateX₂ + ... + translateXₙ
absoluteY = localY + translateY₁ + translateY₂ + ... + translateYₙ
```

### Rectangle Bounds

For a rectangle at (x, y) with size (width, height):

```
left   = x
right  = x + width
top    = y
bottom = y + height
```

### Center of Rectangle

```
centerX = x + width / 2
centerY = y + height / 2
```

### viewBox Scaling Factor

```
scaleX = displayWidth / viewBoxWidth
scaleY = displayHeight / viewBoxHeight
```

---

## 1.8 Chapter Checklist

Before moving to the next chapter, ensure you can:

- [ ] Explain why SVG Y-axis points downward
- [ ] Calculate absolute position from nested transforms
- [ ] Interpret the four numbers in a viewBox
- [ ] Convert between local and absolute coordinates
- [ ] Move an element up/down/left/right by adjusting coordinates

---

## 1.9 Key Takeaways

1. **Y is inverted**: Down is positive, up is negative
2. **Origin is top-left**: (0,0) is the top-left corner
3. **Transforms stack**: Add up all parent translates to find absolute position
4. **viewBox defines the view**: It maps coordinates to display size
5. **Use user units**: Don't mix unit types

---

*Next: [Chapter 2: Geometric Primitives](02-geometric-primitives.md)*
