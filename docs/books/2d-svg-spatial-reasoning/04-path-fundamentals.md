```markdown
# Chapter 4: Path Fundamentals

*The `d` attribute: SVG's most powerful and most misunderstood feature.*

---

## 4.1 What Is a Path?

A **path** is SVG's universal shape. Any shape can be drawn with a path—lines, curves, complex polygons, even approximations of circles.

```xml
<path d="M 10 10 L 100 10 L 100 100 L 10 100 Z"/>
```

This draws a square. The `d` attribute contains a series of **commands** that tell the pen where to move.

### The Mental Model: Pen on Paper

Imagine holding a pen:
- **Move (M)**: Lift the pen and move to a new position (no mark)
- **Line (L)**: Draw a straight line to a position
- **Curve**: Draw a curved line
- **Close (Z)**: Draw a line back to where we started

---

## 4.2 Command Reference

### Basic Commands

| Command | Name | Parameters | Effect |
|---------|------|------------|--------|
| `M x y` | MoveTo | x, y | Move pen to (x, y), no line |
| `L x y` | LineTo | x, y | Draw line to (x, y) |
| `H x` | Horizontal Line | x | Draw horizontal line to x |
| `V y` | Vertical Line | y | Draw vertical line to y |
| `Z` | ClosePath | none | Draw line back to start |

### Curve Commands (covered in next chapter)

| Command | Name | Parameters |
|---------|------|------------|
| `Q cx cy x y` | Quadratic Bézier | control point, end point |
| `C c1x c1y c2x c2y x y` | Cubic Bézier | two control points, end point |
| `A rx ry angle large-arc sweep x y` | Arc | radii, flags, end point |

### Shorthand Commands

| Command | Name | Effect |
|---------|------|--------|
| `T x y` | Smooth Quadratic | Quadratic with reflected control |
| `S c2x c2y x y` | Smooth Cubic | Cubic with reflected first control |

---

## 4.3 Absolute vs Relative Commands

Every command has two forms:
- **Uppercase** = Absolute coordinates
- **Lowercase** = Relative to current position

### Example

```
M 10 10 L 100 10     // Absolute: move to (10,10), line to (100,10)
m 10 10 l 90 0       // Relative: move by (+10,+10), line by (+90,+0)
```

Both produce the same result if starting from (0,0).

### When to Use Each

| Situation | Use |
|-----------|-----|
| Fixed positions (layout) | Uppercase (absolute) |
| Patterns/repeated shapes | Lowercase (relative) |
| Hand-editing | Lowercase (easier to adjust) |
| Machine-generated | Uppercase (simpler math) |

---

## 4.4 Building Common Shapes

### Triangle

```xml
<path d="M 50 10 L 90 90 L 10 90 Z"/>
```

```
    (50,10)
       △
      / \
     /   \
    /     \
(10,90)───(90,90)
```

### Pentagon

```xml
<path d="M 50 0 L 97 35 L 79 91 L 21 91 L 3 35 Z"/>
```

### Arrow Pointing Right

```xml
<path d="M 0 20 L 60 20 L 60 0 L 100 40 L 60 80 L 60 60 L 0 60 Z"/>
```

```
      ┌────60,0
      │      \
0,20──60,20   \
│              100,40
0,60──60,60   /
      │      /
      └────60,80
```

---

## 4.5 Combining Subpaths

A path can contain multiple **subpaths**. Each `M` command starts a new subpath.

### Donut Shape (Ring)

```xml
<path d="M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z
         M 50 25 A 25 25 0 1 0 50 75 A 25 25 0 1 0 50 25 Z"
      fill-rule="evenodd"/>
```

The outer circle is drawn clockwise, the inner circle counter-clockwise. With `fill-rule="evenodd"`, the inner circle becomes a hole.

### Multiple Separate Shapes

```xml
<!-- Two separate rectangles in one path -->
<path d="M 10 10 L 50 10 L 50 40 L 10 40 Z
         M 70 10 L 110 10 L 110 40 L 70 40 Z"/>
```

---

## 4.6 Path Performance

Paths are more efficient than multiple elements:

```xml
<!-- Slower: 100 separate elements -->
<line x1="0" y1="0" x2="10" y2="0"/>
<line x1="0" y1="10" x2="10" y2="10"/>
<!-- ... 98 more lines ... -->

<!-- Faster: One path with 100 subpaths -->
<path d="M0,0 L10,0 M0,10 L10,10 ... "/>
```

### Rule of Thumb

- **< 10 shapes**: Individual elements (easier to style/animate)
- **> 50 shapes**: Combine into paths (better performance)
- **Grid lines, tick marks**: Always use paths

---

## 4.7 Parsing Path Data

To work with paths programmatically, you need to parse the `d` attribute.

### Algorithm: Tokenize Path

```javascript
function tokenizePath(d) {
    // Split on command letters, keeping the letter
    const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g);
    
    return tokens.map(token => {
        const command = token[0];
        const args = token.slice(1).trim().split(/[\s,]+/).map(Number);
        return { command, args };
    });
}
```

### Example

```javascript
tokenizePath("M 10 20 L 100 200 Z")
// Result:
[
    { command: 'M', args: [10, 20] },
    { command: 'L', args: [100, 200] },
    { command: 'Z', args: [] }
]
```

---

## 4.8 Building Paths Programmatically

### Path Builder Pattern

```javascript
class PathBuilder {
    constructor() {
        this.d = '';
    }
    
    moveTo(x, y) {
        this.d += `M ${x} ${y} `;
        return this;
    }
    
    lineTo(x, y) {
        this.d += `L ${x} ${y} `;
        return this;
    }
    
    horizontalTo(x) {
        this.d += `H ${x} `;
        return this;
    }
    
    verticalTo(y) {
        this.d += `V ${y} `;
        return this;
    }
    
    close() {
        this.d += 'Z ';
        return this;
    }
    
    toString() {
        return this.d.trim();
    }
}

// Usage:
const path = new PathBuilder()
    .moveTo(10, 10)
    .lineTo(100, 10)
    .lineTo(100, 100)
    .lineTo(10, 100)
    .close()
    .toString();
// Result: "M 10 10 L 100 10 L 100 100 L 10 100 Z"
```

---

## 4.9 Converting Shapes to Paths

### Rectangle to Path

```javascript
function rectToPath(x, y, width, height, rx = 0, ry = 0) {
    if (rx === 0 && ry === 0) {
        // Simple rectangle (no rounded corners)
        return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
    }
    
    // Rounded rectangle
    return `
        M ${x + rx} ${y}
        H ${x + width - rx}
        Q ${x + width} ${y} ${x + width} ${y + ry}
        V ${y + height - ry}
        Q ${x + width} ${y + height} ${x + width - rx} ${y + height}
        H ${x + rx}
        Q ${x} ${y + height} ${x} ${y + height - ry}
        V ${y + ry}
        Q ${x} ${y} ${x + rx} ${y}
        Z
    `.replace(/\s+/g, ' ').trim();
}
```

### Circle to Path (Approximation with Arcs)

```javascript
function circleToPath(cx, cy, r) {
    // Two semicircular arcs
    return `
        M ${cx - r} ${cy}
        A ${r} ${r} 0 1 1 ${cx + r} ${cy}
        A ${r} ${r} 0 1 1 ${cx - r} ${cy}
        Z
    `.replace(/\s+/g, ' ').trim();
}
```

### Polygon to Path

```javascript
function polygonToPath(points) {
    // points = [[x1,y1], [x2,y2], ...]
    if (points.length === 0) return '';
    
    let d = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i][0]} ${points[i][1]}`;
    }
    d += ' Z';
    return d;
}
```

---

## 4.10 Path Bounding Box

To compute the bounding box of a path, you need to track all coordinates.

### Simple Algorithm (Lines Only)

```javascript
function pathBounds(d) {
    const tokens = tokenizePath(d);
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let curX = 0, curY = 0;
    
    for (const { command, args } of tokens) {
        switch (command) {
            case 'M':
            case 'L':
                curX = args[0];
                curY = args[1];
                break;
            case 'm':
            case 'l':
                curX += args[0];
                curY += args[1];
                break;
            case 'H':
                curX = args[0];
                break;
            case 'h':
                curX += args[0];
                break;
            case 'V':
                curY = args[0];
                break;
            case 'v':
                curY += args[0];
                break;
            case 'Z':
            case 'z':
                // Returns to start, handled separately
                continue;
        }
        
        minX = Math.min(minX, curX);
        minY = Math.min(minY, curY);
        maxX = Math.max(maxX, curX);
        maxY = Math.max(maxY, curY);
    }
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
```

### ⚠️ Warning: Curves Require More

For paths with curves, the bounding box may extend beyond the endpoints. Curve bounds require finding the curve's extrema (covered in Chapter 5).

---

## 4.11 Decision Tree: Which Path Command?

```
What do you need to draw?
│
├─► Straight line
│   └─► Use L (or H for horizontal, V for vertical)
│
├─► Smooth curve
│   ├─► One control point? → Q (quadratic)
│   └─► Two control points? → C (cubic)
│
├─► Circular arc
│   └─► Use A
│
├─► Return to start
│   └─► Use Z
│
└─► Jump to new position (no line)
    └─► Use M
```

---

## 4.12 Practical Examples

### Example 1: Chevron/Arrow

```xml
<path d="M 10 30 L 50 10 L 90 30" stroke="#333" fill="none" stroke-width="3"/>
```

### Example 2: Checkmark

```xml
<path d="M 10 50 L 35 75 L 90 20" stroke="green" fill="none" stroke-width="5"/>
```

### Example 3: Cross (×)

```xml
<path d="M 10 10 L 90 90 M 90 10 L 10 90" stroke="red" stroke-width="5"/>
```

### Example 4: Plus (+)

```xml
<path d="M 50 10 V 90 M 10 50 H 90" stroke="blue" stroke-width="3"/>
```

---

## 4.13 Formula Reference

### Path Data Grammar (Simplified)

```
path-data    = moveto command*
moveto       = "M" | "m" coordinate-pair
command      = lineto | horizontal | vertical | curve | arc | closepath
lineto       = "L" | "l" coordinate-pair
horizontal   = "H" | "h" number
vertical     = "V" | "v" number
closepath    = "Z" | "z"
```

### Coordinate Pair Formats

```
x,y        // Comma separated
x y        // Space separated
x,y,x,y    // Multiple pairs (for curves)
```

---

## 4.14 Chapter Checklist

- [ ] Write a path for a triangle
- [ ] Convert between absolute and relative commands
- [ ] Parse a path string into command objects
- [ ] Build a path programmatically
- [ ] Convert a rectangle to a path
- [ ] Calculate bounds for a straight-line path

---

## 4.15 Key Takeaways

1. **Paths are universal**: Any shape can be a path
2. **M moves, L draws**: The two most common commands
3. **Uppercase = absolute**, lowercase = relative
4. **Z closes the path**: Draws line back to start
5. **Paths can have multiple subpaths**: Each M starts a new one
6. **Combine shapes for performance**: One path with many subpaths is faster than many elements

---

*Next: [Chapter 5: Bézier Curves Demystified](05-bezier-curves.md)*

```