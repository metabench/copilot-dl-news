```markdown
# Chapter 8: Collision Detection

*Knowing when shapes overlap before the user sees it.*

---

## 8.1 Why Collision Detection?

SVG layouts can have overlapping elements. This causes:
- **Unreadable text**: Labels covering each other
- **Hidden content**: Important elements obscured
- **Visual confusion**: Users can't understand the diagram

Collision detection lets you **find and fix** these problems programmatically.

---

## 8.2 Rectangle Intersection (The Core Algorithm)

Most collision detection in SVG uses **rectangle intersection** on bounding boxes.

### The Test

Two rectangles **do not overlap** if any of these are true:
- rect1's right edge is left of rect2's left edge
- rect2's right edge is left of rect1's left edge
- rect1's bottom edge is above rect2's top edge
- rect2's bottom edge is above rect1's top edge

### The Formula

```javascript
function rectanglesOverlap(r1, r2) {
    // If any of these are true, rectangles DON'T overlap
    if (r1.x + r1.width < r2.x) return false;  // r1 is left of r2
    if (r2.x + r2.width < r1.x) return false;  // r2 is left of r1
    if (r1.y + r1.height < r2.y) return false; // r1 is above r2
    if (r2.y + r2.height < r1.y) return false; // r2 is above r1
    
    // Otherwise, they overlap
    return true;
}
```

### Visual Explanation

```
NO OVERLAP (separated horizontally):
┌────┐
│ r1 │     ┌────┐
└────┘     │ r2 │
           └────┘
r1.right < r2.left ✓

NO OVERLAP (separated vertically):
┌────┐
│ r1 │
└────┘

┌────┐
│ r2 │
└────┘
r1.bottom < r2.top ✓

OVERLAP:
┌────┐
│ r1 ┼────┐
└────┼ r2 │
     └────┘
None of the separation conditions are true → OVERLAP!
```

---

## 8.3 Computing Overlap Amount

Not just "do they overlap?" but "how much?"

### Intersection Rectangle

```javascript
function getIntersection(r1, r2) {
    const x = Math.max(r1.x, r2.x);
    const y = Math.max(r1.y, r2.y);
    const right = Math.min(r1.x + r1.width, r2.x + r2.width);
    const bottom = Math.min(r1.y + r1.height, r2.y + r2.height);
    
    if (right > x && bottom > y) {
        return {
            x: x,
            y: y,
            width: right - x,
            height: bottom - y,
            area: (right - x) * (bottom - y)
        };
    }
    return null; // No intersection
}
```

### Example

```javascript
const r1 = { x: 0, y: 0, width: 100, height: 50 };
const r2 = { x: 80, y: 30, width: 100, height: 50 };

getIntersection(r1, r2);
// Result: { x: 80, y: 30, width: 20, height: 20, area: 400 }
```

---

## 8.4 Overlap Ratio

To assess **severity**, compare overlap area to element sizes:

```javascript
function overlapRatio(r1, r2) {
    const intersection = getIntersection(r1, r2);
    if (!intersection) return 0;
    
    const area1 = r1.width * r1.height;
    const area2 = r2.width * r2.height;
    const smallerArea = Math.min(area1, area2);
    
    return intersection.area / smallerArea;
}
```

### Severity Classification

```javascript
function classifySeverity(ratio, elementTypes) {
    if (ratio > 0.3) return 'high';     // >30% overlap
    if (ratio > 0.1) return 'medium';   // 10-30% overlap
    return 'low';                        // <10% overlap
}
```

### Context Matters

- **Text overlapping text**: Even 5% is bad (unreadable)
- **Shape overlapping shape**: May be intentional (layering)
- **Text overlapping shape**: Depends on design intent

---

## 8.5 Point in Rectangle Test

For hit testing: did the user click inside this element?

```javascript
function pointInRect(px, py, rect) {
    return px >= rect.x &&
           px <= rect.x + rect.width &&
           py >= rect.y &&
           py <= rect.y + rect.height;
}
```

### With Tolerance (Fuzzy Hit Testing)

```javascript
function pointNearRect(px, py, rect, tolerance = 5) {
    return px >= rect.x - tolerance &&
           px <= rect.x + rect.width + tolerance &&
           py >= rect.y - tolerance &&
           py <= rect.y + rect.height + tolerance;
}
```

---

## 8.6 Point in Circle Test

```javascript
function pointInCircle(px, py, cx, cy, r) {
    const dx = px - cx;
    const dy = py - cy;
    return (dx * dx + dy * dy) <= (r * r);
}
```

**Why squared?** Avoids the slow `Math.sqrt()` operation.

---

## 8.7 Circle-Circle Collision

Two circles overlap if the distance between centers is less than sum of radii:

```javascript
function circlesOverlap(c1, c2) {
    const dx = c2.cx - c1.cx;
    const dy = c2.cy - c1.cy;
    const distanceSquared = dx * dx + dy * dy;
    const radiiSum = c1.r + c2.r;
    
    return distanceSquared < (radiiSum * radiiSum);
}
```

---

## 8.8 Circle-Rectangle Collision

More complex: find the closest point on the rectangle to the circle's center.

```javascript
function circleRectOverlap(circle, rect) {
    // Find closest point on rectangle to circle center
    const closestX = Math.max(rect.x, Math.min(circle.cx, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.cy, rect.y + rect.height));
    
    // Calculate distance from closest point to circle center
    const dx = circle.cx - closestX;
    const dy = circle.cy - closestY;
    const distanceSquared = dx * dx + dy * dy;
    
    return distanceSquared < (circle.r * circle.r);
}
```

---

## 8.9 N×N Collision Detection

When checking many elements against each other:

### Naïve Approach (O(n²))

```javascript
function findAllCollisions(elements) {
    const collisions = [];
    
    for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
            if (rectanglesOverlap(elements[i].bbox, elements[j].bbox)) {
                collisions.push({
                    element1: elements[i],
                    element2: elements[j],
                    intersection: getIntersection(elements[i].bbox, elements[j].bbox)
                });
            }
        }
    }
    
    return collisions;
}
```

### Optimized: Spatial Hashing

For large element counts, divide space into grid cells:

```javascript
class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }
    
    _cellKey(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }
    
    insert(element) {
        const bbox = element.bbox;
        // Find all cells this element touches
        const minCX = Math.floor(bbox.x / this.cellSize);
        const maxCX = Math.floor((bbox.x + bbox.width) / this.cellSize);
        const minCY = Math.floor(bbox.y / this.cellSize);
        const maxCY = Math.floor((bbox.y + bbox.height) / this.cellSize);
        
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const key = `${cx},${cy}`;
                if (!this.grid.has(key)) {
                    this.grid.set(key, []);
                }
                this.grid.get(key).push(element);
            }
        }
    }
    
    getPotentialCollisions(element) {
        const bbox = element.bbox;
        const candidates = new Set();
        
        const minCX = Math.floor(bbox.x / this.cellSize);
        const maxCX = Math.floor((bbox.x + bbox.width) / this.cellSize);
        const minCY = Math.floor(bbox.y / this.cellSize);
        const maxCY = Math.floor((bbox.y + bbox.height) / this.cellSize);
        
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const other of cell) {
                        if (other !== element) {
                            candidates.add(other);
                        }
                    }
                }
            }
        }
        
        return Array.from(candidates);
    }
}
```

---

## 8.10 Collision Types in SVG

### Text-Text Collision

The worst kind—always a problem:

```javascript
function detectTextCollisions(textElements) {
    const collisions = [];
    
    for (let i = 0; i < textElements.length; i++) {
        for (let j = i + 1; j < textElements.length; j++) {
            const intersection = getIntersection(
                textElements[i].bbox,
                textElements[j].bbox
            );
            
            if (intersection && intersection.area > 0) {
                collisions.push({
                    type: 'text-text',
                    severity: 'high', // Always high for text
                    elements: [textElements[i], textElements[j]],
                    overlap: intersection
                });
            }
        }
    }
    
    return collisions;
}
```

### Element Overflow

Element extends outside its container:

```javascript
function detectOverflow(element, container) {
    const eBbox = element.bbox;
    const cBbox = container.bbox;
    
    const overflows = {
        left: eBbox.x < cBbox.x,
        right: eBbox.x + eBbox.width > cBbox.x + cBbox.width,
        top: eBbox.y < cBbox.y,
        bottom: eBbox.y + eBbox.height > cBbox.y + cBbox.height
    };
    
    return {
        overflows: Object.values(overflows).some(v => v),
        directions: overflows
    };
}
```

---

## 8.11 Collision Report Format

Standardized output for tools:

```javascript
const collisionReport = {
    timestamp: '2024-01-15T10:30:00Z',
    file: 'diagram.svg',
    summary: {
        total: 5,
        high: 2,
        medium: 1,
        low: 2
    },
    collisions: [
        {
            id: 1,
            type: 'text-overlap',
            severity: 'high',
            element1: {
                id: 'label-1',
                tagName: 'text',
                bbox: { x: 100, y: 50, width: 120, height: 16 }
            },
            element2: {
                id: 'label-2',
                tagName: 'text',
                bbox: { x: 180, y: 52, width: 100, height: 16 }
            },
            intersection: {
                x: 180, y: 52, width: 40, height: 14,
                area: 560,
                overlapRatio: 0.35
            },
            suggestion: 'Move element2 right by 45px'
        }
        // ... more collisions
    ]
};
```

---

## 8.12 Computing Separation Vectors

When elements collide, compute the minimum movement to separate them:

```javascript
function separationVector(r1, r2, padding = 5) {
    const intersection = getIntersection(r1, r2);
    if (!intersection) return null;
    
    // Calculate overlap in each direction
    const overlapLeft = (r1.x + r1.width) - r2.x;
    const overlapRight = (r2.x + r2.width) - r1.x;
    const overlapTop = (r1.y + r1.height) - r2.y;
    const overlapBottom = (r2.y + r2.height) - r1.y;
    
    // Find minimum separation (smallest movement)
    const options = [
        { dx: -(overlapLeft + padding), dy: 0, dir: 'left' },
        { dx: overlapRight + padding, dy: 0, dir: 'right' },
        { dx: 0, dy: -(overlapTop + padding), dir: 'up' },
        { dx: 0, dy: overlapBottom + padding, dir: 'down' }
    ];
    
    // Choose smallest movement
    options.sort((a, b) => 
        Math.abs(a.dx) + Math.abs(a.dy) - 
        Math.abs(b.dx) - Math.abs(b.dy)
    );
    
    return options[0];
}
```

### Example

```javascript
const label1 = { x: 100, y: 50, width: 80, height: 20 };
const label2 = { x: 160, y: 55, width: 70, height: 20 };

separationVector(label1, label2);
// Result: { dx: 25, dy: 0, dir: 'right' }
// Move label2 right by 25px to separate
```

---

## 8.13 Collision Detection Decision Tree

```
Have a list of elements?
│
├─► Few elements (< 50)
│   └─► Use naïve O(n²) comparison
│
├─► Many elements (> 50)
│   └─► Use spatial hashing for efficiency
│
For each potential collision:
│
├─► Get bounding boxes
│   └─► Use getBBox() or computed bounds
│
├─► Test for overlap
│   └─► rectanglesOverlap(r1, r2)
│
├─► If overlapping, compute severity
│   └─► overlapRatio() + context
│
└─► Generate fix suggestion
    └─► separationVector() + apply to later element
```

---

## 8.14 Algorithm: Full Collision Check

```javascript
function fullCollisionCheck(svgElements) {
    const results = {
        collisions: [],
        overflows: [],
        summary: { high: 0, medium: 0, low: 0 }
    };
    
    // 1. Compute bounding boxes
    const boxes = svgElements.map(el => ({
        element: el,
        bbox: computeBBox(el)
    }));
    
    // 2. Check all pairs
    for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
            const intersection = getIntersection(boxes[i].bbox, boxes[j].bbox);
            
            if (intersection) {
                const ratio = overlapRatio(boxes[i].bbox, boxes[j].bbox);
                const severity = classifySeverity(ratio, 
                    [boxes[i].element.tagName, boxes[j].element.tagName]);
                
                results.collisions.push({
                    elements: [boxes[i].element, boxes[j].element],
                    intersection,
                    ratio,
                    severity,
                    fix: separationVector(boxes[i].bbox, boxes[j].bbox)
                });
                
                results.summary[severity]++;
            }
        }
    }
    
    // 3. Check containment (if parent relationships defined)
    for (const box of boxes) {
        if (box.element.parent) {
            const parentBox = computeBBox(box.element.parent);
            const overflow = detectOverflow(box, { bbox: parentBox });
            if (overflow.overflows) {
                results.overflows.push({
                    element: box.element,
                    parent: box.element.parent,
                    directions: overflow.directions
                });
            }
        }
    }
    
    return results;
}
```

---

## 8.15 Formula Reference

### Rectangle Overlap Test
```
overlap = NOT (r1.right < r2.left OR 
               r2.right < r1.left OR 
               r1.bottom < r2.top OR 
               r2.bottom < r1.top)
```

### Intersection Rectangle
```
x = max(r1.x, r2.x)
y = max(r1.y, r2.y)
width = min(r1.right, r2.right) - x
height = min(r1.bottom, r2.bottom) - y
```

### Overlap Ratio
```
ratio = intersectionArea / min(area1, area2)
```

### Circle Overlap
```
overlap = (distance between centers)² < (r1 + r2)²
```

### Point in Rectangle
```
inside = (px >= x) AND (px <= x+width) AND (py >= y) AND (py <= y+height)
```

---

## 8.16 Chapter Checklist

- [ ] Test if two rectangles overlap
- [ ] Compute the intersection rectangle
- [ ] Calculate overlap ratio for severity
- [ ] Test if point is inside rectangle
- [ ] Test if point is inside circle
- [ ] Compute separation vector to fix collision
- [ ] Understand when to use spatial hashing

---

## 8.17 Key Takeaways

1. **Rectangle overlap is the core test**: Simplify all shapes to bboxes
2. **Overlap ratio determines severity**: >30% is high, <10% is low
3. **Text collisions are always serious**: Even small overlaps are unreadable
4. **Separation vectors guide fixes**: Move by the minimum amount
5. **Move the later element**: Convention for which element to adjust
6. **Spatial hashing helps scale**: O(n²) becomes expensive above ~50 elements

---

*Next: [Chapter 9: Containment and Clipping](09-containment-clipping.md)*

```