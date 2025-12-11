```markdown
# Chapter 7: Bounding Boxes

*The rectangle that contains everything.*

---

## 7.1 What Is a Bounding Box?

A **bounding box** is the smallest axis-aligned rectangle that completely contains a shape.

```
       ┌─────────────────┐
       │     ╱╲          │
       │    ╱  ╲         │
       │   ╱    ╲        │
       │  ╱      ╲       │  ← Bounding box
       │ ╱        ╲      │
       │╱──────────╲     │
       │            ╲    │
       │             ╲   │
       └─────────────────┘
```

No matter how complex or rotated the shape, the bounding box is always a simple, axis-aligned rectangle.

### Why Bounding Boxes Matter

1. **Collision detection**: Rectangle overlap is fast to compute
2. **Layout calculation**: Know how much space something needs
3. **Visibility testing**: Is this even on screen?
4. **Hit testing**: Did the click land on this element?
5. **Grouping**: What's the combined extent of multiple elements?

---

## 7.2 Bounding Box Properties

A bounding box has these properties:

```javascript
{
    x: number,       // Left edge
    y: number,       // Top edge
    width: number,   // Horizontal extent
    height: number   // Vertical extent
}
```

### Derived Properties

```javascript
left   = x
top    = y
right  = x + width
bottom = y + height

centerX = x + width / 2
centerY = y + height / 2

area = width × height
```

---

## 7.3 Computing Bounding Boxes

### Rectangle

Simplest case—the bounding box IS the rectangle:

```javascript
function rectBBox(x, y, width, height) {
    return { x, y, width, height };
}
```

### Circle

```javascript
function circleBBox(cx, cy, r) {
    return {
        x: cx - r,
        y: cy - r,
        width: 2 * r,
        height: 2 * r
    };
}
```

### Ellipse

```javascript
function ellipseBBox(cx, cy, rx, ry) {
    return {
        x: cx - rx,
        y: cy - ry,
        width: 2 * rx,
        height: 2 * ry
    };
}
```

### Line

```javascript
function lineBBox(x1, y1, x2, y2) {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1)
    };
}
```

### Polygon (Set of Points)

```javascript
function polygonBBox(points) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const [x, y] of points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
```

---

## 7.4 Combining Bounding Boxes

To find the bounding box of **multiple shapes**, compute the union of their individual bounding boxes:

```javascript
function unionBBox(boxes) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const box of boxes) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
    }
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
```

### Example

```javascript
const box1 = { x: 10, y: 20, width: 100, height: 50 };
const box2 = { x: 80, y: 60, width: 120, height: 40 };

unionBBox([box1, box2]);
// Result: { x: 10, y: 20, width: 190, height: 80 }
//         (from 10 to 200 in X, from 20 to 100 in Y)
```

---

## 7.5 Bounding Boxes After Transforms

### After Translation

Translation simply offsets the bounding box:

```javascript
function bboxAfterTranslate(box, tx, ty) {
    return {
        x: box.x + tx,
        y: box.y + ty,
        width: box.width,
        height: box.height
    };
}
```

### After Scaling

Scaling multiplies position AND size:

```javascript
function bboxAfterScale(box, sx, sy) {
    return {
        x: box.x * sx,
        y: box.y * sy,
        width: box.width * sx,
        height: box.height * sy
    };
}
```

### After Rotation (The Tricky Case)

When you rotate a rectangle, its **axis-aligned** bounding box grows:

```
Original:           After 45° rotation:
┌────────┐             ╱╲
│        │            ╱  ╲
│        │           ╱    ╲
└────────┘          ╱      ╲
                    ╲      ╱
                     ╲    ╱
                      ╲  ╱
                       ╲╱

Axis-aligned bounding box after rotation:
          ┌────────────┐
          │    ╱╲      │
          │   ╱  ╲     │
          │  ╱    ╲    │
          │ ╲      ╱   │
          │  ╲    ╱    │
          │   ╲  ╱     │
          │    ╲╱      │
          └────────────┘
```

### Algorithm: Rotated Rectangle Bounding Box

```javascript
function bboxAfterRotation(box, angleDegrees, pivotX, pivotY) {
    const angleRad = angleDegrees * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Get the four corners of the original rectangle
    const corners = [
        { x: box.x, y: box.y },                           // Top-left
        { x: box.x + box.width, y: box.y },               // Top-right
        { x: box.x, y: box.y + box.height },              // Bottom-left
        { x: box.x + box.width, y: box.y + box.height }   // Bottom-right
    ];
    
    // Rotate each corner around the pivot
    const rotated = corners.map(c => {
        const dx = c.x - pivotX;
        const dy = c.y - pivotY;
        return {
            x: pivotX + dx * cos - dy * sin,
            y: pivotY + dx * sin + dy * cos
        };
    });
    
    // Find bounds of rotated corners
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    for (const p of rotated) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
    };
}
```

---

## 7.6 Local vs Screen Bounding Boxes

In SVG, there are two important bounding box concepts:

### Local Bounding Box (`getBBox()`)

The bounding box in the element's **own coordinate system**, ignoring all transforms.

```javascript
// In browser JavaScript
const element = document.getElementById('myShape');
const localBBox = element.getBBox();
// This ignores transforms!
```

### Screen Bounding Box (`getScreenCTM()` + transform)

The bounding box after all transforms are applied:

```javascript
function getAbsoluteBBox(element) {
    const svg = element.ownerSVGElement;
    const local = element.getBBox();
    const ctm = element.getScreenCTM();
    
    // Transform all four corners
    const corners = [
        { x: local.x, y: local.y },
        { x: local.x + local.width, y: local.y },
        { x: local.x, y: local.y + local.height },
        { x: local.x + local.width, y: local.y + local.height }
    ];
    
    const transformed = corners.map(c => {
        const pt = svg.createSVGPoint();
        pt.x = c.x;
        pt.y = c.y;
        return pt.matrixTransform(ctm);
    });
    
    // Find bounds
    const xs = transformed.map(p => p.x);
    const ys = transformed.map(p => p.y);
    
    return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    };
}
```

### ⚠️ Critical Difference

```xml
<g transform="translate(100, 50) rotate(45)">
    <rect id="myRect" x="0" y="0" width="100" height="50"/>
</g>
```

| Method | Result |
|--------|--------|
| `getBBox()` | `{x: 0, y: 0, width: 100, height: 50}` |
| Absolute bbox | Much larger box, at different position |

---

## 7.7 Text Bounding Boxes

Text is special because its size depends on:
- Font family
- Font size
- Actual characters
- Font loading status

### Accurate Text Bounds Require Rendering

```javascript
// In browser - accurate bounds
const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
textElement.textContent = 'Hello World';
svg.appendChild(textElement);
const bbox = textElement.getBBox();
svg.removeChild(textElement);
```

### Estimation Without Rendering

Rough estimate for typical fonts:

```javascript
function estimateTextBBox(x, y, text, fontSize) {
    // Rough heuristic: average character width ≈ 0.6 × fontSize
    // This varies significantly by font!
    const avgCharWidth = fontSize * 0.6;
    const estimatedWidth = text.length * avgCharWidth;
    
    // Height is approximately the font size
    // (baseline to top of capitals, descenders extend below)
    const estimatedHeight = fontSize;
    
    // Y is the baseline in SVG, so top of box is above it
    return {
        x: x,
        y: y - fontSize * 0.8,  // Approximate ascender height
        width: estimatedWidth,
        height: estimatedHeight
    };
}
```

### ⚠️ Warning

Text estimates are **very approximate**. "WWW" is much wider than "iii" at the same font size. For accurate layout, you must render and measure.

---

## 7.8 Padding Bounding Boxes

Often you want a bounding box with some margin around it:

```javascript
function padBBox(box, padding) {
    return {
        x: box.x - padding,
        y: box.y - padding,
        width: box.width + 2 * padding,
        height: box.height + 2 * padding
    };
}

// Asymmetric padding
function padBBoxSides(box, top, right, bottom, left) {
    return {
        x: box.x - left,
        y: box.y - top,
        width: box.width + left + right,
        height: box.height + top + bottom
    };
}
```

---

## 7.9 Centered Bounding Box

Sometimes you have a center point and size:

```javascript
function bboxFromCenter(centerX, centerY, width, height) {
    return {
        x: centerX - width / 2,
        y: centerY - height / 2,
        width: width,
        height: height
    };
}
```

---

## 7.10 Bounding Box Utilities

### Check if Point is Inside

```javascript
function pointInBBox(px, py, box) {
    return px >= box.x && 
           px <= box.x + box.width &&
           py >= box.y && 
           py <= box.y + box.height;
}
```

### Check if Box Contains Another Box

```javascript
function bboxContains(outer, inner) {
    return inner.x >= outer.x &&
           inner.y >= outer.y &&
           inner.x + inner.width <= outer.x + outer.width &&
           inner.y + inner.height <= outer.y + outer.height;
}
```

### Get Intersection of Two Boxes

```javascript
function bboxIntersection(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    if (x2 > x1 && y2 > y1) {
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }
    return null; // No intersection
}
```

### Check if Two Boxes Overlap

```javascript
function bboxesOverlap(box1, box2) {
    return !(box1.x + box1.width < box2.x ||
             box2.x + box2.width < box1.x ||
             box1.y + box1.height < box2.y ||
             box2.y + box2.height < box1.y);
}
```

---

## 7.11 Oriented Bounding Boxes

An **oriented bounding box** (OBB) is aligned with the object, not the axes. It's tighter for rotated objects.

```
Axis-aligned (AABB):        Oriented (OBB):
┌──────────────────┐           ╱╲
│      ╱╲          │          ╱  ╲
│     ╱  ╲         │         ╱    ╲
│    ╱    ╲        │        ╱      ╲
│   ╱      ╲       │        ╲      ╱
│  ╱        ╲      │         ╲    ╱
│ ╱          ╲     │          ╲  ╱
│╱            ╲    │           ╲╱
└──────────────────┘
    (lots of empty space)     (tight fit)
```

### When to Use Each

| Type | Use When |
|------|----------|
| AABB | Fast collision detection, simple layouts |
| OBB | Tighter fits, rotated elements, precision needed |

OBB math is more complex (requires tracking rotation angle and using rotated intersection tests), so most SVG work uses AABBs.

---

## 7.12 Decision Tree: Which Bounding Box Method?

```
What do you need to know?
│
├─► Simple element size (ignoring transforms)
│   └─► Use getBBox() or shape-specific formula
│
├─► Actual position on screen (after transforms)
│   └─► Use getScreenCTM() with corner transformation
│
├─► Combined bounds of multiple elements
│   └─► Compute individual boxes, then union
│
├─► Text size
│   └─► Must render to measure accurately
│
└─► Bounds after rotation
    └─► Transform corners, then find min/max
```

---

## 7.13 Formula Reference

### Rectangle Bounds
```
left = x, right = x + width
top = y, bottom = y + height
```

### Circle Bounds
```
left = cx - r, right = cx + r
top = cy - r, bottom = cy + r
```

### Union of Two Boxes
```
x = min(box1.x, box2.x)
y = min(box1.y, box2.y)
right = max(box1.x + box1.width, box2.x + box2.width)
bottom = max(box1.y + box1.height, box2.y + box2.height)
width = right - x
height = bottom - y
```

### Point in Box Test
```
isInside = (px >= x) AND (px <= x + width) AND (py >= y) AND (py <= y + height)
```

### Boxes Overlap Test
```
overlap = NOT (right1 < left2 OR right2 < left1 OR bottom1 < top2 OR bottom2 < top1)
```

---

## 7.14 Chapter Checklist

- [ ] Compute bounding box of a circle
- [ ] Compute bounding box of a polygon
- [ ] Combine multiple bounding boxes into one
- [ ] Transform a bounding box after translation
- [ ] Transform a bounding box after rotation
- [ ] Test if a point is inside a bounding box
- [ ] Test if two bounding boxes overlap

---

## 7.15 Key Takeaways

1. **Bounding boxes simplify complex shapes**: Any shape → simple rectangle
2. **AABB is axis-aligned**: Horizontal and vertical edges only
3. **Transforms change the bbox**: Especially rotation—it grows!
4. **Local vs Screen**: `getBBox()` ignores transforms, screen bbox includes them
5. **Text is hard**: Must render to measure accurately
6. **Union combines boxes**: Smallest rectangle containing all input boxes

---

*Next: [Chapter 8: Collision Detection](08-collision-detection.md)*

```