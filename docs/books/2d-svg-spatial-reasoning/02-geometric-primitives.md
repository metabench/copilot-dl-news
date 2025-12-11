# Chapter 2: Geometric Primitives

*The building blocks of all spatial reasoning.*

---

## 2.1 Points

A **point** is the simplest geometric primitive: a location in 2D space.

### Representation

```javascript
point = { x: 150, y: 100 }
```

### SVG Examples

Points appear in many SVG attributes:

```xml
<circle cx="150" cy="100" r="5"/>     <!-- Center point -->
<line x1="0" y1="0" x2="100" y2="50"/> <!-- Two points -->
<text x="50" y="80">Hello</text>       <!-- Text anchor point -->
```

### Point Operations

#### Distance Between Two Points

The **Euclidean distance** between points A and B:

```
distance = √[(x₂ - x₁)² + (y₂ - y₁)²]
```

**Example**: Distance from (10, 20) to (40, 60):
```
dx = 40 - 10 = 30
dy = 60 - 20 = 40
distance = √(30² + 40²) = √(900 + 1600) = √2500 = 50
```

#### Midpoint Between Two Points

```
midX = (x₁ + x₂) / 2
midY = (y₁ + y₂) / 2
```

**Example**: Midpoint of (10, 20) and (40, 60):
```
midX = (10 + 40) / 2 = 25
midY = (20 + 60) / 2 = 40
midpoint = (25, 40)
```

---

## 2.2 Vectors

A **vector** represents direction and magnitude (not a fixed position).

### Representation

```javascript
vector = { dx: 30, dy: 40 }  // or { x: 30, y: 40 }
```

### Vector from Two Points

To create a vector from point A to point B:

```
vector.dx = B.x - A.x
vector.dy = B.y - A.y
```

### Vector Operations

#### Vector Length (Magnitude)

```
length = √(dx² + dy²)
```

#### Unit Vector (Normalized)

A vector with length 1, pointing in the same direction:

```
unitX = dx / length
unitY = dy / length
```

**Example**: Normalize vector (3, 4):
```
length = √(3² + 4²) = √25 = 5
unitX = 3 / 5 = 0.6
unitY = 4 / 5 = 0.8
unit vector = (0.6, 0.8)
```

#### Scale Vector

To make a vector longer or shorter:

```
scaledX = dx * scaleFactor
scaledY = dy * scaleFactor
```

#### Add Vectors

To combine two movements:

```
resultX = v1.dx + v2.dx
resultY = v1.dy + v2.dy
```

### Why Vectors Matter in SVG

Vectors are essential for:
- Computing movement offsets
- Calculating curve tangents
- Determining separation directions (for fixing overlaps)
- Defining gradients and patterns

---

## 2.3 Lines and Line Segments

### Line Segment

A **line segment** connects two points with finite length.

```xml
<line x1="10" y1="20" x2="100" y2="80"/>
```

### Line Properties

```
start point: (x1, y1)
end point:   (x2, y2)
length:      √[(x2-x1)² + (y2-y1)²]
midpoint:    ((x1+x2)/2, (y1+y2)/2)
```

### Point on Line (Interpolation)

To find a point at fraction `t` along a line (t=0 is start, t=1 is end):

```
pointX = x1 + t * (x2 - x1)
pointY = y1 + t * (y2 - y1)
```

**Example**: Point at t=0.25 on line from (0,0) to (100,80):
```
pointX = 0 + 0.25 * (100 - 0) = 25
pointY = 0 + 0.25 * (80 - 0) = 20
point = (25, 20)
```

### Line Intersection

Two lines intersect where they share a point. This is useful for:
- Finding where edges meet
- Computing clipping points
- Grid alignments

The formula is more complex (see Appendix A), but the concept is: solve two line equations simultaneously.

---

## 2.4 Rectangles

The **rectangle** is the most important shape for layout reasoning.

### Representation

There are two common ways to represent a rectangle:

**Method 1: Position + Size**
```javascript
rect = { x: 100, y: 50, width: 200, height: 150 }
```

**Method 2: Corner Coordinates**
```javascript
rect = { left: 100, top: 50, right: 300, bottom: 200 }
```

### Converting Between Representations

```
// Position+Size → Corners
left   = x
top    = y
right  = x + width
bottom = y + height

// Corners → Position+Size
x      = left
y      = top
width  = right - left
height = bottom - top
```

### Rectangle Properties

```xml
<rect x="100" y="50" width="200" height="150" rx="10"/>
```

| Property | Formula |
|----------|---------|
| Left edge | x |
| Right edge | x + width |
| Top edge | y |
| Bottom edge | y + height |
| Center X | x + width/2 |
| Center Y | y + height/2 |
| Area | width × height |
| Perimeter | 2 × (width + height) |

### ⚠️ Common Confusion: rx/ry

The `rx` and `ry` attributes control **corner rounding**, not position:

```xml
<rect x="100" y="50" width="200" height="150" rx="10" ry="10"/>
<!--                                          │      │
                                              │      └── Y corner radius
                                              └── X corner radius -->
```

---

## 2.5 Bounding Boxes

A **bounding box** is the smallest rectangle that completely contains a shape.

### Why Bounding Boxes Matter

Every shape—no matter how complex—has a bounding box. This simplifies:
- Collision detection (rectangles are easy to test)
- Layout calculations
- Clipping and containment checks

### Bounding Box of Any Shape

```
bbox = {
  x: minimum X of all points in shape,
  y: minimum Y of all points in shape,
  width: (maximum X) - (minimum X),
  height: (maximum Y) - (minimum Y)
}
```

### Examples

**Circle** at center (cx, cy) with radius r:
```
bbox.x = cx - r
bbox.y = cy - r
bbox.width = 2 * r
bbox.height = 2 * r
```

**Ellipse** at center (cx, cy) with radii (rx, ry):
```
bbox.x = cx - rx
bbox.y = cy - ry
bbox.width = 2 * rx
bbox.height = 2 * ry
```

**Line** from (x1, y1) to (x2, y2):
```
bbox.x = min(x1, x2)
bbox.y = min(y1, y2)
bbox.width = |x2 - x1|
bbox.height = |y2 - y1|
```

---

## 2.6 Circles and Ellipses

### Circle

Defined by center point and radius:

```xml
<circle cx="200" cy="150" r="50"/>
```

| Property | Value |
|----------|-------|
| Center | (cx, cy) |
| Radius | r |
| Diameter | 2 × r |
| Left edge | cx - r |
| Right edge | cx + r |
| Top edge | cy - r |
| Bottom edge | cy + r |

### Point on Circle

To find a point on the circle at angle θ (in radians):

```
pointX = cx + r × cos(θ)
pointY = cy + r × sin(θ)
```

**Angle Reference**:
```
θ = 0       → Right (positive X)
θ = π/2     → Down (positive Y, remember Y is inverted!)
θ = π       → Left (negative X)
θ = 3π/2    → Up (negative Y)
```

### Ellipse

Like a circle, but stretched differently in X and Y:

```xml
<ellipse cx="200" cy="150" rx="80" ry="50"/>
```

Point on ellipse at angle θ:
```
pointX = cx + rx × cos(θ)
pointY = cy + ry × sin(θ)
```

---

## 2.7 Practical Exercise: Layout Calculation

**Problem**: Place three buttons (each 100×40) horizontally with 20px gaps, starting at x=50.

**Solution**:
```
Button 1: x = 50
Button 2: x = 50 + 100 + 20 = 170
Button 3: x = 170 + 100 + 20 = 290

Total width = 3 × 100 + 2 × 20 = 340
```

```xml
<rect x="50"  y="100" width="100" height="40"/>
<rect x="170" y="100" width="100" height="40"/>
<rect x="290" y="100" width="100" height="40"/>
```

---

## 2.8 Algorithms for Simple Models

### Algorithm: Evenly Distribute N Items

Given:
- Container width `W`
- Item width `w`
- Number of items `n`

Find: X position of each item for even distribution

```
gap = (W - n × w) / (n + 1)

item[0].x = gap
item[1].x = gap + w + gap = 2×gap + w
item[2].x = 3×gap + 2×w
...
item[i].x = (i + 1) × gap + i × w
```

### Algorithm: Center an Item

Given:
- Container at position (containerX, containerY) with size (containerW, containerH)
- Item with size (itemW, itemH)

Find: Position to center item in container

```
itemX = containerX + (containerW - itemW) / 2
itemY = containerY + (containerH - itemH) / 2
```

### Algorithm: Align Items to Right Edge

Given:
- Container right edge at `containerRight`
- Items with widths `w[i]`
- Gap between items `g`

Find: X position of each item, right-aligned

```
// Start from rightmost item, work left
item[n-1].x = containerRight - w[n-1]
item[n-2].x = item[n-1].x - g - w[n-2]
item[n-3].x = item[n-2].x - g - w[n-3]
...
```

---

## 2.9 Formula Reference Card

### Distance
```
d = √[(x₂-x₁)² + (y₂-y₁)²]
```

### Midpoint
```
mid = ((x₁+x₂)/2, (y₁+y₂)/2)
```

### Rectangle Edges
```
left = x, right = x + width
top = y, bottom = y + height
```

### Rectangle Center
```
center = (x + width/2, y + height/2)
```

### Circle Bounding Box
```
bbox = {x: cx-r, y: cy-r, width: 2r, height: 2r}
```

### Point on Circle
```
(cx + r×cos(θ), cy + r×sin(θ))
```

### Even Distribution Gap
```
gap = (containerWidth - n×itemWidth) / (n + 1)
```

---

## 2.10 Chapter Checklist

- [ ] Calculate distance between two points
- [ ] Find midpoint of a line segment
- [ ] Convert rectangle position+size to corners and back
- [ ] Compute bounding box of a circle
- [ ] Calculate centered position of an item in a container
- [ ] Evenly distribute N items with equal gaps

---

## 2.11 Key Takeaways

1. **Points** locate positions; **vectors** describe movement
2. **Rectangles** are the foundation of layout reasoning
3. **Bounding boxes** simplify complex shapes to rectangles
4. **Center point** = position + half the size
5. **Even distribution** requires calculating the gap first

---

*Next: [Chapter 3: Understanding Transforms](03-transforms.md)*
