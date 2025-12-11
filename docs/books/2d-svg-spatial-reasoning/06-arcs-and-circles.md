```markdown
# Chapter 6: Arcs and Circles

*When curves must follow the perfect geometry of circles and ellipses.*

---

## 6.1 Why Arcs?

Bézier curves can approximate circles, but they're never perfect. For:
- **Pie charts**
- **Progress rings**
- **Rounded connectors**
- **Gauge indicators**

...you often need true circular or elliptical arcs.

SVG's arc command (`A`) draws a portion of an ellipse.

---

## 6.2 The Arc Command

### Syntax

```
A rx ry x-axis-rotation large-arc-flag sweep-flag x y
```

| Parameter | Meaning |
|-----------|---------|
| `rx` | X radius of the ellipse |
| `ry` | Y radius of the ellipse |
| `x-axis-rotation` | Rotation of ellipse in degrees |
| `large-arc-flag` | 0 = small arc, 1 = large arc |
| `sweep-flag` | 0 = counter-clockwise, 1 = clockwise |
| `x y` | End point of the arc |

### Minimal Example

```xml
<path d="M 50 100 A 50 50 0 0 1 150 100" stroke="black" fill="none"/>
```

This draws a semicircle:
- From (50, 100) to (150, 100)
- Radius 50 in both directions (circle)
- No rotation
- Small arc (0)
- Clockwise (1)

---

## 6.3 Understanding the Flags

The tricky part of arcs: **four possible arcs** connect any two points on an ellipse.

```
Given: Start point, end point, and radii

Four arcs possible:
  - Large + Clockwise
  - Large + Counter-clockwise
  - Small + Clockwise
  - Small + Counter-clockwise
```

### Visual Guide

```
        ╭───────────╮
       ╱    LARGE    ╲
      ╱   (sweep=1)   ╲
     │                 │
 Start ●             ● End
     │                 │
      ╲   (sweep=0)   ╱
       ╲    LARGE    ╱
        ╰───────────╯
              
         ╭─────╮
        ╱ SMALL╲
Start ●╱(sweep=1)╲● End
        ╲(sweep=0)╱
         ╰─────╯
```

### Decision Table

| large-arc | sweep | Result |
|-----------|-------|--------|
| 0 | 0 | Small arc, counter-clockwise |
| 0 | 1 | Small arc, clockwise |
| 1 | 0 | Large arc, counter-clockwise |
| 1 | 1 | Large arc, clockwise |

---

## 6.4 Circles with Arcs

A full circle requires **two arcs** (you can't draw a complete circle with one arc command):

```xml
<path d="M 0 50 
         A 50 50 0 1 1 100 50 
         A 50 50 0 1 1 0 50" 
      fill="blue"/>
```

### Why Two Arcs?

An arc needs start and end points. If they're the same point, the arc has zero length. So:
1. First arc: Left to right (semicircle)
2. Second arc: Right to left (completes the circle)

---

## 6.5 Computing Arc Endpoints

Given a center, radius, and angle, find the point on the circle:

```javascript
function pointOnCircle(cx, cy, r, angleDegrees) {
    const angleRadians = angleDegrees * Math.PI / 180;
    return {
        x: cx + r * Math.cos(angleRadians),
        y: cy + r * Math.sin(angleRadians)
    };
}
```

### Angle Reference (SVG coordinates, Y-down)

```
            270° (or -90°)
               ↑
               │
 180° ←────────●────────→ 0°
               │
               ↓
             90°
```

**Note**: Because Y points down, positive angles go clockwise!

---

## 6.6 Pie Slice Recipe

A pie slice is: move to center, line to edge, arc along edge, close back to center.

```javascript
function pieSlice(cx, cy, r, startAngle, endAngle) {
    const start = pointOnCircle(cx, cy, r, startAngle);
    const end = pointOnCircle(cx, cy, r, endAngle);
    
    // Determine if we need the large arc
    const angleDiff = endAngle - startAngle;
    const largeArc = Math.abs(angleDiff) > 180 ? 1 : 0;
    
    // Sweep direction (1 for clockwise if going positive angle)
    const sweep = angleDiff > 0 ? 1 : 0;
    
    return `M ${cx} ${cy}
            L ${start.x} ${start.y}
            A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}
            Z`;
}

// Example: 45° slice starting at 0°
pieSlice(100, 100, 80, 0, 45);
```

---

## 6.7 Donut (Ring) Slice Recipe

Like a pie slice, but with an inner and outer radius:

```javascript
function donutSlice(cx, cy, outerR, innerR, startAngle, endAngle) {
    const startOuter = pointOnCircle(cx, cy, outerR, startAngle);
    const endOuter = pointOnCircle(cx, cy, outerR, endAngle);
    const startInner = pointOnCircle(cx, cy, innerR, startAngle);
    const endInner = pointOnCircle(cx, cy, innerR, endAngle);
    
    const angleDiff = endAngle - startAngle;
    const largeArc = Math.abs(angleDiff) > 180 ? 1 : 0;
    const sweep = angleDiff > 0 ? 1 : 0;
    
    return `M ${startOuter.x} ${startOuter.y}
            A ${outerR} ${outerR} 0 ${largeArc} ${sweep} ${endOuter.x} ${endOuter.y}
            L ${endInner.x} ${endInner.y}
            A ${innerR} ${innerR} 0 ${largeArc} ${1-sweep} ${startInner.x} ${startInner.y}
            Z`;
}
```

**Key insight**: The inner arc goes in the opposite sweep direction!

---

## 6.8 Progress Ring Recipe

A circular progress indicator:

```javascript
function progressRing(cx, cy, r, percent) {
    if (percent >= 100) {
        // Full circle (two arcs)
        return `M ${cx} ${cy - r}
                A ${r} ${r} 0 1 1 ${cx} ${cy + r}
                A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
    }
    
    const angle = (percent / 100) * 360;
    const startAngle = -90; // Start at top
    const endAngle = startAngle + angle;
    
    const start = pointOnCircle(cx, cy, r, startAngle);
    const end = pointOnCircle(cx, cy, r, endAngle);
    
    const largeArc = angle > 180 ? 1 : 0;
    
    return `M ${start.x} ${start.y}
            A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// 75% progress ring
progressRing(100, 100, 40, 75);
```

---

## 6.9 Elliptical Arcs

When `rx ≠ ry`, you get an ellipse:

```xml
<path d="M 50 100 A 80 40 0 0 1 210 100" stroke="black" fill="none"/>
```

This is an arc of an ellipse with:
- Horizontal radius: 80
- Vertical radius: 40

### Rotated Ellipses

The `x-axis-rotation` parameter rotates the entire ellipse:

```xml
<!-- 45° rotated ellipse arc -->
<path d="M 50 50 A 80 40 45 0 1 150 150" stroke="black" fill="none"/>
```

---

## 6.10 Arc vs Bézier: When to Use Which

| Use Arc When | Use Bézier When |
|--------------|-----------------|
| Perfect circular/elliptical shape | Organic, non-circular curves |
| Pie charts, progress indicators | Connectors, paths |
| Circular buttons, rounded corners | S-curves, flowing lines |
| Angle-based positioning | Free-form shaping |

### Rounded Rectangle Comparison

```xml
<!-- Using rx/ry on rect (simplest) -->
<rect x="10" y="10" width="100" height="50" rx="10" ry="10"/>

<!-- Using arcs in path (more control) -->
<path d="M 20 10 
         H 100 A 10 10 0 0 1 110 20
         V 50 A 10 10 0 0 1 100 60
         H 20 A 10 10 0 0 1 10 50
         V 20 A 10 10 0 0 1 20 10
         Z"/>

<!-- Using quadratic curves (approximate) -->
<path d="M 20 10
         H 100 Q 110 10 110 20
         V 50 Q 110 60 100 60
         H 20 Q 10 60 10 50
         V 20 Q 10 10 20 10
         Z"/>
```

---

## 6.11 Arc Bounding Box

Computing the bounding box of an arc is complex because you must find where the arc crosses axis-aligned tangent points.

### Simplified Algorithm

```javascript
function arcBounds(x1, y1, rx, ry, rotation, largeArc, sweep, x2, y2) {
    // Convert to center parameterization (complex, see SVG spec)
    const { cx, cy, theta1, dtheta } = arcToCenter(
        x1, y1, rx, ry, rotation, largeArc, sweep, x2, y2
    );
    
    // Sample the arc at multiple points
    const points = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    
    const steps = 36; // Every 10 degrees
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const angle = theta1 + t * dtheta;
        points.push({
            x: cx + rx * Math.cos(angle) * Math.cos(rotation) 
                  - ry * Math.sin(angle) * Math.sin(rotation),
            y: cy + rx * Math.cos(angle) * Math.sin(rotation) 
                  + ry * Math.sin(angle) * Math.cos(rotation)
        });
    }
    
    // Find min/max
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
```

---

## 6.12 Common Arc Mistakes

### Mistake 1: Arc Too Small to Fit

If the distance between points is greater than 2×radius, the arc is impossible:

```xml
<!-- WRONG: Points are 200 apart, but radius is only 50 -->
<path d="M 0 0 A 50 50 0 0 1 200 0"/>
<!-- Browser will scale up the radius automatically -->
```

### Mistake 2: Same Start and End Point

```xml
<!-- WRONG: Arc has zero length -->
<path d="M 100 100 A 50 50 0 0 1 100 100"/>
<!-- Nothing draws! -->
```

**Solution**: Use two arcs for a full circle.

### Mistake 3: Wrong Sweep Direction

```xml
<!-- Goes the long way around when you wanted short -->
<path d="M 0 50 A 50 50 0 0 0 100 50"/>
<!-- This is counter-clockwise, might not be what you want -->
```

**Solution**: Try the other sweep value (0 ↔ 1).

---

## 6.13 Algorithm: Describe Arc for Any Two Angles

```javascript
function arcBetweenAngles(cx, cy, r, startDeg, endDeg, direction = 'clockwise') {
    const start = pointOnCircle(cx, cy, r, startDeg);
    const end = pointOnCircle(cx, cy, r, endDeg);
    
    // Calculate angle difference
    let angleDiff = endDeg - startDeg;
    if (direction === 'clockwise' && angleDiff < 0) angleDiff += 360;
    if (direction === 'counter-clockwise' && angleDiff > 0) angleDiff -= 360;
    
    const largeArc = Math.abs(angleDiff) > 180 ? 1 : 0;
    const sweep = direction === 'clockwise' ? 1 : 0;
    
    return {
        start,
        end,
        path: `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`
    };
}
```

---

## 6.14 Decision Tree: Arc Parameters

```
Want to draw an arc from point A to point B?
│
├─► Determine radii (rx, ry)
│   ├─► Circle? Use same value for both
│   └─► Ellipse? Use different values
│
├─► Determine rotation (usually 0)
│
├─► Choose large-arc-flag
│   ├─► Want the short way around? → 0
│   └─► Want the long way around? → 1
│
└─► Choose sweep-flag
    ├─► Going clockwise? → 1
    └─► Going counter-clockwise? → 0
```

---

## 6.15 Formula Reference

### Point on Circle

```
x = cx + r × cos(θ)
y = cy + r × sin(θ)
```

### Point on Ellipse

```
x = cx + rx × cos(θ) × cos(φ) - ry × sin(θ) × sin(φ)
y = cy + rx × cos(θ) × sin(φ) + ry × sin(θ) × cos(φ)

where φ = rotation angle of ellipse
```

### Arc Length (Circular)

```
length = r × |θ₂ - θ₁|   (angles in radians)
```

### Angle from Percentage

```
angle = percentage / 100 × 360°
```

### Common Angle Conversions

```
Degrees to Radians: rad = deg × π / 180
Radians to Degrees: deg = rad × 180 / π
```

---

## 6.16 Chapter Checklist

- [ ] Draw a semicircle with an arc command
- [ ] Choose correct large-arc and sweep flags
- [ ] Draw a complete circle using two arcs
- [ ] Create a pie slice path
- [ ] Create a progress ring indicator
- [ ] Calculate point on circle from center and angle

---

## 6.17 Key Takeaways

1. **Arcs are ellipse segments**: Perfect circular/elliptical geometry
2. **Four possible arcs**: Use flags to choose which one
3. **sweep=1 is clockwise**: In SVG's Y-down coordinate system
4. **Full circles need two arcs**: One arc can't have same start and end
5. **Angles are measured from positive X**: 0° is right, 90° is down
6. **Start at -90° for "top"**: Common for progress indicators

---

*Next: [Chapter 7: Bounding Boxes](07-bounding-boxes.md)*

```