```markdown
# Chapter 5: Bézier Curves Demystified

*The secret to beautiful, organic curves in SVG.*

---

## 5.1 Why Curves?

Straight lines look mechanical. Nature rarely has straight edges. Curves give your SVG:
- **Organic feel**: Natural, hand-drawn appearance
- **Smooth connections**: Elegant transitions between elements
- **Visual flow**: Guide the eye along a path
- **Professional polish**: The difference between "functional" and "beautiful"

---

## 5.2 What Is a Bézier Curve?

A **Bézier curve** is defined by:
1. **Start point** (where the curve begins)
2. **End point** (where the curve ends)
3. **Control points** (points that "pull" the curve toward them)

The curve **doesn't pass through** the control points. It's pulled toward them, like a magnet.

### The Intuition

Imagine a rubber band stretched between start and end. The control points are magnets that pull the rubber band toward them, bending it into a curve.

```
Start ●─────────────────────────────────────● End
         ↖                                ↗
           Control pulls curve this way
```

---

## 5.3 Quadratic Bézier Curves (One Control Point)

The simpler curve. Uses one control point.

### SVG Syntax

```xml
<path d="M startX startY Q controlX controlY endX endY"/>
```

### Example

```xml
<path d="M 10 80 Q 95 10 180 80" stroke="black" fill="none"/>
```

```
          ○ (95, 10) Control Point
         ╱ ╲
        ╱   ╲
       ╱     ╲
      ╱       ╲
     ╱         ╲
    ╱           ╲
   ╱             ╲
  ╱ ── curve ──   ╲
 ╱                 ╲
● (10, 80)         ● (180, 80)
Start              End
```

The curve is pulled upward toward the control point.

### Mathematical Formula

A quadratic Bézier at parameter t (from 0 to 1):

```
B(t) = (1-t)² × P0 + 2(1-t)t × P1 + t² × P2

Where:
  P0 = Start point
  P1 = Control point
  P2 = End point
  t  = Progress along curve (0 = start, 1 = end)
```

### Computing Points on the Curve

```javascript
function quadraticBezier(t, p0, p1, p2) {
    const oneMinusT = 1 - t;
    return {
        x: oneMinusT * oneMinusT * p0.x + 
           2 * oneMinusT * t * p1.x + 
           t * t * p2.x,
        y: oneMinusT * oneMinusT * p0.y + 
           2 * oneMinusT * t * p1.y + 
           t * t * p2.y
    };
}

// Example: Point at t=0.5 (midpoint)
const mid = quadraticBezier(0.5, 
    {x: 10, y: 80},   // Start
    {x: 95, y: 10},   // Control
    {x: 180, y: 80}   // End
);
// Result: approximately {x: 95, y: 45}
```

---

## 5.4 Cubic Bézier Curves (Two Control Points)

The more flexible curve. Uses two control points.

### SVG Syntax

```xml
<path d="M startX startY C c1x c1y c2x c2y endX endY"/>
```

### Example

```xml
<path d="M 10 80 C 40 10 140 10 180 80" stroke="black" fill="none"/>
```

```
      ○ (40, 10)           ○ (140, 10)
       Control 1            Control 2
         ╲                    ╱
          ╲                  ╱
           ╲    curve      ╱
            ╲             ╱
             ╲           ╱
              ╲         ╱
               ╲       ╱
                ╲     ╱
● (10, 80)       ╲   ╱       ● (180, 80)
Start             ╲╱         End
```

### Why Two Control Points?

Two control points give you:
1. **Control at the start**: First control point shapes the departure from start
2. **Control at the end**: Second control point shapes the arrival at end
3. **S-curves**: Can bend in opposite directions
4. **More precise shaping**: Fine-tune exactly how the curve flows

### Mathematical Formula

A cubic Bézier at parameter t:

```
B(t) = (1-t)³ × P0 + 3(1-t)²t × P1 + 3(1-t)t² × P2 + t³ × P3

Where:
  P0 = Start point
  P1 = Control point 1 (near start)
  P2 = Control point 2 (near end)
  P3 = End point
```

### Computing Points on the Curve

```javascript
function cubicBezier(t, p0, p1, p2, p3) {
    const oneMinusT = 1 - t;
    const oneMinusT2 = oneMinusT * oneMinusT;
    const oneMinusT3 = oneMinusT2 * oneMinusT;
    const t2 = t * t;
    const t3 = t2 * t;
    
    return {
        x: oneMinusT3 * p0.x + 
           3 * oneMinusT2 * t * p1.x + 
           3 * oneMinusT * t2 * p2.x + 
           t3 * p3.x,
        y: oneMinusT3 * p0.y + 
           3 * oneMinusT2 * t * p1.y + 
           3 * oneMinusT * t2 * p2.y + 
           t3 * p3.y
    };
}
```

---

## 5.5 The Control Point Intuition

### Rule 1: Direction at Endpoints

The curve **leaves the start point** heading toward control point 1.
The curve **arrives at the end point** coming from control point 2.

```
P0 ──────► toward P1 (departure direction)
P3 ◄────── from P2 (arrival direction)
```

### Rule 2: Distance Affects Curvature

- **Control close to endpoint** → Tight curve, sharp bend
- **Control far from endpoint** → Gentle curve, gradual bend

```
Close control (sharp):     Far control (gentle):
    ○                           ○
    │                          ╱
    │                         ╱
    ●───                     ●─────────
```

### Rule 3: Control Points Form Tangent Lines

The line from start to control 1 is tangent to the curve at the start.
The line from control 2 to end is tangent to the curve at the end.

This is why curves connect smoothly when control points are aligned (see Section 5.6).

---

## 5.6 Smooth Connections

To connect two curves smoothly (no visible corner), the control points must be **collinear** (on the same line).

### The Rule

At a connection point between two curves:
- Control 2 of the first curve
- The connection point
- Control 1 of the second curve

...must all be on the same straight line.

```
                    ○ Control 2 of first curve
                   ╱
                  ╱
     First curve ╱
                ●───────────────○ Control 1 of second curve
       Connection point          
                        ╲
                         ╲ Second curve
```

### Example: Smooth S-Curve

```xml
<path d="M 10 50 
         C 30 10 60 10 100 50
         C 140 90 170 90 190 50" 
      stroke="black" fill="none"/>
```

At point (100, 50):
- Control 2 of first segment: (60, 10) — 40 units up and left
- Control 1 of second segment: (140, 90) — 40 units down and right

These are symmetrically opposite, creating smoothness.

---

## 5.7 The `S` Command: Smooth Cubic

SVG provides a shortcut for smooth connections:

```xml
<path d="M 10 50 C 30 10 60 10 100 50 S 170 90 190 50"/>
```

The `S` command automatically reflects the previous control point to ensure smoothness.

### How `S` Works

`S c2x c2y x y` is equivalent to `C c1x c1y c2x c2y x y` where:
- `c1` is the reflection of the previous `c2` through the previous endpoint

```
Previous c2 ○
             ╲
              ╲
               ●──────── S command starts here
              ╱         (c1 is automatically reflected)
             ╱
     Auto c1 ○
```

---

## 5.8 The `T` Command: Smooth Quadratic

Similarly for quadratic curves:

```xml
<path d="M 10 80 Q 50 10 100 80 T 190 80"/>
```

The `T` command reflects the previous control point automatically.

---

## 5.9 Computing Curve Bounds

Curves can extend beyond their endpoints! The bounding box must include the curve's extrema.

### Finding Extrema (Cubic Bézier)

The curve reaches extremes where its derivative equals zero:

```javascript
function cubicBezierBounds(p0, p1, p2, p3) {
    // Derivative coefficients for x
    const ax = -3*p0.x + 9*p1.x - 9*p2.x + 3*p3.x;
    const bx = 6*p0.x - 12*p1.x + 6*p2.x;
    const cx = 3*p1.x - 3*p0.x;
    
    // Same for y
    const ay = -3*p0.y + 9*p1.y - 9*p2.y + 3*p3.y;
    const by = 6*p0.y - 12*p1.y + 6*p2.y;
    const cy = 3*p1.y - 3*p0.y;
    
    // Find t values where derivative = 0
    const tValuesX = solveQuadratic(ax, bx, cx);
    const tValuesY = solveQuadratic(ay, by, cy);
    
    // Include t = 0 and t = 1 (endpoints)
    const tValues = [0, 1, ...tValuesX, ...tValuesY]
        .filter(t => t >= 0 && t <= 1);
    
    // Compute bounds from all critical points
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const t of tValues) {
        const pt = cubicBezier(t, p0, p1, p2, p3);
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
    }
    
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function solveQuadratic(a, b, c) {
    if (Math.abs(a) < 1e-10) {
        // Linear: bx + c = 0
        if (Math.abs(b) < 1e-10) return [];
        return [-c / b];
    }
    
    const discriminant = b*b - 4*a*c;
    if (discriminant < 0) return [];
    if (discriminant === 0) return [-b / (2*a)];
    
    const sqrtD = Math.sqrt(discriminant);
    return [(-b + sqrtD) / (2*a), (-b - sqrtD) / (2*a)];
}
```

---

## 5.10 Practical Recipe: Drawing Connector Curves

One of the most common uses of curves: connecting two boxes with a flowing line.

### The Problem

Connect point A to point B with a smooth curve. Both points might have preferred directions (e.g., "exit from right side", "enter from left side").

### The Solution: Control Point Placement

```javascript
function connectorCurve(startX, startY, endX, endY, startDir, endDir) {
    // Calculate control point distance (1/3 to 1/2 of total distance works well)
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const offset = dist * 0.4;  // 40% of distance
    
    let c1x, c1y, c2x, c2y;
    
    // Start control point based on exit direction
    switch (startDir) {
        case 'right': c1x = startX + offset; c1y = startY; break;
        case 'left':  c1x = startX - offset; c1y = startY; break;
        case 'down':  c1x = startX; c1y = startY + offset; break;
        case 'up':    c1x = startX; c1y = startY - offset; break;
    }
    
    // End control point based on entry direction
    switch (endDir) {
        case 'right': c2x = endX + offset; c2y = endY; break;
        case 'left':  c2x = endX - offset; c2y = endY; break;
        case 'down':  c2x = endX; c2y = endY + offset; break;
        case 'up':    c2x = endX; c2y = endY - offset; break;
    }
    
    return `M ${startX} ${startY} C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;
}

// Example: Horizontal flow (exit right, enter left)
connectorCurve(100, 50, 300, 150, 'right', 'left');
// Result: "M 100 50 C 180 50 220 150 300 150"
```

### Visual Result

```
    ●───────→ Control 1
   Start     (exit right)
        ╲
         ╲
          ╲
           ╲
    Control 2 ←─────●
    (enter left)    End
```

---

## 5.11 Decision Tree: Which Curve Type?

```
What do you need?
│
├─► Simple arc between two points
│   └─► Quadratic (Q) — one control point
│
├─► Precise control at both ends
│   └─► Cubic (C) — two control points
│
├─► Chain of smooth curves
│   ├─► From quadratics → use T for continuation
│   └─► From cubics → use S for continuation
│
├─► Circular arc
│   └─► Use A command (see Chapter 6)
│
└─► Very simple bend
    └─► Quadratic, control point midway
```

---

## 5.12 Control Point Recipes

### Recipe 1: U-Shape (Parallel Lines to Curve)

Connect two parallel horizontal lines with a curve:

```javascript
// Exit at (100, 50), enter at (200, 100)
const startY = 50, endY = 100;
const midY = (startY + endY) / 2;

// Control points at the vertical midpoint
const path = `M 100 50 C 100 ${midY} 200 ${midY} 200 100`;
```

### Recipe 2: S-Curve

Gentle wave between two points at same Y:

```javascript
const startX = 50, endX = 250, y = 100;
const dist = endX - startX;
const controlOffset = dist / 3;
const waveHeight = 40;

const path = `M ${startX} ${y} 
              C ${startX + controlOffset} ${y - waveHeight}
                ${endX - controlOffset} ${y + waveHeight}
                ${endX} ${y}`;
```

### Recipe 3: Quarter Circle Approximation

The magic number for approximating a quarter circle with a cubic Bézier is **0.552284749831**:

```javascript
const kappa = 0.552284749831;

function quarterCircle(cx, cy, r, startAngle) {
    // For a quarter circle starting at angle (in 90° increments)
    // startAngle: 0=right, 1=bottom, 2=left, 3=top
    
    const angles = [0, Math.PI/2, Math.PI, 3*Math.PI/2];
    const theta1 = angles[startAngle];
    const theta2 = angles[(startAngle + 1) % 4];
    
    const x1 = cx + r * Math.cos(theta1);
    const y1 = cy + r * Math.sin(theta1);
    const x4 = cx + r * Math.cos(theta2);
    const y4 = cy + r * Math.sin(theta2);
    
    // Control points
    const dx1 = -r * Math.sin(theta1) * kappa;
    const dy1 = r * Math.cos(theta1) * kappa;
    const dx4 = r * Math.sin(theta2) * kappa;
    const dy4 = -r * Math.cos(theta2) * kappa;
    
    return `M ${x1} ${y1} C ${x1+dx1} ${y1+dy1} ${x4+dx4} ${y4+dy4} ${x4} ${y4}`;
}
```

---

## 5.13 Curve Length Estimation

Curves don't have simple length formulas. Approximate by sampling:

```javascript
function curveLength(p0, p1, p2, p3, samples = 100) {
    let length = 0;
    let prevPoint = p0;
    
    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const point = cubicBezier(t, p0, p1, p2, p3);
        
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        length += Math.sqrt(dx*dx + dy*dy);
        
        prevPoint = point;
    }
    
    return length;
}
```

---

## 5.14 Formula Reference

### Quadratic Bézier

```
B(t) = (1-t)² × P0 + 2(1-t)t × P1 + t² × P2
```

### Cubic Bézier

```
B(t) = (1-t)³ × P0 + 3(1-t)²t × P1 + 3(1-t)t² × P2 + t³ × P3
```

### Derivative (Cubic)

```
B'(t) = 3(1-t)² × (P1-P0) + 6(1-t)t × (P2-P1) + 3t² × (P3-P2)
```

### Control Point Distance for Smoothness

```
For natural-looking curves: offset = totalDistance × 0.3 to 0.5
```

### Quarter Circle Approximation

```
Control offset from endpoint = radius × 0.552284749831
```

---

## 5.15 Chapter Checklist

- [ ] Draw a quadratic curve with the Q command
- [ ] Draw a cubic curve with the C command
- [ ] Place control points to create desired curvature
- [ ] Connect two curves smoothly (collinear controls)
- [ ] Use S and T for smooth continuations
- [ ] Calculate a point on a curve at parameter t
- [ ] Understand why curves can extend beyond endpoints

---

## 5.16 Key Takeaways

1. **Control points pull, they don't pass through**: The curve bends toward controls
2. **Quadratic = 1 control, Cubic = 2 controls**: More controls = more flexibility
3. **Tangent lines matter**: Control points define departure/arrival directions
4. **Smooth connections require collinear controls**: Three points in a line at the joint
5. **Distance affects tension**: Close controls = sharp, far controls = gentle
6. **Bounds require derivative analysis**: Curves can bulge beyond endpoints

---

*Next: [Chapter 6: Arcs and Circles](06-arcs-and-circles.md)*

```