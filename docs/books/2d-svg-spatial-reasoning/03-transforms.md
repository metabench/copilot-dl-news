# Chapter 3: Understanding Transforms

*How to move, rotate, and scale without changing coordinates.*

---

## 3.1 What Are Transforms?

A **transform** changes how an element is rendered without modifying its original coordinates.

```xml
<!-- Without transform: rectangle at (100, 50) -->
<rect x="100" y="50" width="200" height="100"/>

<!-- With transform: same rectangle, moved right 50 pixels -->
<rect x="100" y="50" width="200" height="100" transform="translate(50, 0)"/>
<!-- Visually appears at (150, 50) -->
```

### Why Use Transforms?

1. **Group movement**: Move many elements together
2. **Animation**: Transform attributes animate smoothly
3. **Reusable definitions**: Define once, place anywhere with transforms
4. **Cleaner math**: Keep original coordinates simple

---

## 3.2 The Five Transform Types

| Transform | Syntax | Effect |
|-----------|--------|--------|
| **translate** | `translate(tx, ty)` | Move by offset |
| **scale** | `scale(sx, sy)` | Resize from origin |
| **rotate** | `rotate(angle)` | Rotate around origin |
| **skewX** | `skewX(angle)` | Shear horizontally |
| **skewY** | `skewY(angle)` | Shear vertically |

Plus the general-purpose:
| **matrix** | `matrix(a,b,c,d,e,f)` | Any 2D affine transform |

---

## 3.3 Translate

The most common transform. Moves elements by an offset.

### Syntax

```xml
transform="translate(tx, ty)"
transform="translate(tx)"       <!-- ty defaults to 0 -->
```

### Formula

```
x' = x + tx
y' = y + ty
```

### Example

```xml
<rect x="0" y="0" width="50" height="30" transform="translate(100, 80)"/>
```

The rectangle is **defined** at (0, 0) but **appears** at (100, 80).

### ⚡ Key Insight

Translate is the safest transform because:
- It doesn't change size
- It doesn't change orientation
- Math is simple addition

---

## 3.4 Scale

Changes the size of elements by multiplying coordinates.

### Syntax

```xml
transform="scale(sx, sy)"
transform="scale(s)"            <!-- Same scale in both directions -->
```

### Formula

```
x' = x × sx
y' = y × sy
```

### ⚠️ Critical Warning: Scale Origin

**Scale happens from the origin (0, 0) of the coordinate system, NOT from the element's center!**

```xml
<!-- A 100×100 rect at (50, 50), scaled 2× -->
<rect x="50" y="50" width="100" height="100" transform="scale(2)"/>
```

**What happens**:
```
Original position: (50, 50) to (150, 150)
After scale(2):    (100, 100) to (300, 300)
```

The rectangle **moved** because the position was also scaled!

### Solution: Scale Around Element Center

To scale around an element's own center, combine transforms:

```xml
transform="translate(centerX, centerY) scale(factor) translate(-centerX, -centerY)"
```

**Step by step**:
1. Move origin to element center
2. Scale (now centered at element)
3. Move origin back

### Example: Scale 2× Around Center

For a 100×100 rect at (50, 50):
- Center: (100, 100)

```xml
<rect x="50" y="50" width="100" height="100"
      transform="translate(100, 100) scale(2) translate(-100, -100)"/>
```

---

## 3.5 Rotate

Rotates elements around a point.

### Syntax

```xml
transform="rotate(angle)"                  <!-- Around origin -->
transform="rotate(angle, cx, cy)"          <!-- Around point (cx, cy) -->
```

Angle is in **degrees**, clockwise (because Y-axis points down).

### Formula (Rotation Around Origin)

```
x' = x × cos(θ) - y × sin(θ)
y' = x × sin(θ) + y × cos(θ)
```

### ⚠️ Critical Warning: Rotation Origin

Like scale, rotation happens around (0, 0) by default!

```xml
<!-- Element far from origin will orbit around (0, 0) -->
<rect x="200" y="100" width="50" height="50" transform="rotate(45)"/>
```

### Solution: Rotate Around Element Center

Use the three-argument form:

```xml
<!-- Rotate 45° around point (225, 125) -->
<rect x="200" y="100" width="50" height="50" transform="rotate(45, 225, 125)"/>
```

Or use the translate-transform-translate pattern:

```xml
transform="translate(cx, cy) rotate(45) translate(-cx, -cy)"
```

---

## 3.6 Transform Chaining

Multiple transforms can be combined in one attribute:

```xml
transform="translate(100, 50) rotate(45) scale(1.5)"
```

### ⚠️ Order Matters! (Right to Left)

Transforms are applied **right to left** (innermost first):

```xml
transform="translate(100, 50) rotate(45) scale(1.5)"
<!--         3rd                2nd        1st       -->
```

**Execution order**:
1. Scale by 1.5
2. Rotate 45°
3. Translate by (100, 50)

### Example: Different Orders, Different Results

```xml
<!-- Order A: translate then rotate -->
<rect transform="rotate(45) translate(100, 0)"/>
<!-- Moves right 100, THEN rotates around origin → ends up diagonal from origin -->

<!-- Order B: rotate then translate -->
<rect transform="translate(100, 0) rotate(45)"/>
<!-- Rotates around origin THEN moves right 100 → ends up to the right, rotated -->
```

These produce **completely different positions!**

---

## 3.7 Nested Transforms (Groups)

When elements are nested in groups, transforms accumulate:

```xml
<g transform="translate(100, 50)">
    <g transform="translate(20, 30)">
        <rect x="0" y="0" width="50" height="40"/>
    </g>
</g>
```

**Computing absolute position**:
```
Level 1: translate(100, 50)
Level 2: translate(20, 30)
Element: x="0" y="0"

Absolute: (0,0) + (20,30) + (100,50) = (120, 80)
```

### Algorithm: Compute Absolute Position

```javascript
function getAbsolutePosition(element) {
    let x = parseFloat(element.getAttribute('x') || 0);
    let y = parseFloat(element.getAttribute('y') || 0);
    
    let node = element;
    while (node) {
        const transform = node.getAttribute('transform');
        if (transform) {
            const translate = parseTranslate(transform);
            x += translate.tx;
            y += translate.ty;
        }
        node = node.parentElement;
    }
    return { x, y };
}
```

---

## 3.8 The Matrix Transform

All transforms can be expressed as a 3×3 matrix:

```
| a  c  e |   | x |   | x' |
| b  d  f | × | y | = | y' |
| 0  0  1 |   | 1 |   | 1  |
```

Which computes:
```
x' = a×x + c×y + e
y' = b×x + d×y + f
```

### Matrix Equivalents

| Transform | Matrix (a,b,c,d,e,f) |
|-----------|---------------------|
| `translate(tx, ty)` | `matrix(1, 0, 0, 1, tx, ty)` |
| `scale(sx, sy)` | `matrix(sx, 0, 0, sy, 0, 0)` |
| `rotate(θ)` | `matrix(cos(θ), sin(θ), -sin(θ), cos(θ), 0, 0)` |
| `skewX(θ)` | `matrix(1, 0, tan(θ), 1, 0, 0)` |
| `skewY(θ)` | `matrix(1, tan(θ), 0, 1, 0, 0)` |

### Identity Matrix

The identity matrix (no change):
```xml
transform="matrix(1, 0, 0, 1, 0, 0)"
```

---

## 3.9 Composing Matrices

To combine two transforms, multiply their matrices:

```
M_combined = M_second × M_first
```

### Matrix Multiplication Formula

```
| a1 c1 e1 |   | a2 c2 e2 |   | a1×a2+c1×b2  a1×c2+c1×d2  a1×e2+c1×f2+e1 |
| b1 d1 f1 | × | b2 d2 f2 | = | b1×a2+d1×b2  b1×c2+d1×d2  b1×e2+d1×f2+f1 |
| 0  0  1  |   | 0  0  1  |   | 0            0            1              |
```

### JavaScript Implementation

```javascript
function multiplyMatrices(m1, m2) {
    return {
        a: m1.a * m2.a + m1.c * m2.b,
        b: m1.b * m2.a + m1.d * m2.b,
        c: m1.a * m2.c + m1.c * m2.d,
        d: m1.b * m2.c + m1.d * m2.d,
        e: m1.a * m2.e + m1.c * m2.f + m1.e,
        f: m1.b * m2.e + m1.d * m2.f + m1.f
    };
}
```

---

## 3.10 Practical Examples

### Example 1: Icon at Multiple Positions

Define once, use with transforms:

```xml
<defs>
    <g id="icon">
        <circle cx="10" cy="10" r="8"/>
        <line x1="10" y1="2" x2="10" y2="10"/>
    </g>
</defs>

<use href="#icon" transform="translate(50, 50)"/>
<use href="#icon" transform="translate(150, 50)"/>
<use href="#icon" transform="translate(250, 50)"/>
```

### Example 2: Rotated Text Label

```xml
<text x="100" y="200" transform="rotate(-90, 100, 200)">Vertical Label</text>
<!-- Rotates -90° around the text anchor point -->
```

### Example 3: Mirror/Flip

Flip horizontally around x=200:
```xml
transform="translate(400, 0) scale(-1, 1)"
<!-- or -->
transform="matrix(-1, 0, 0, 1, 400, 0)"
```

---

## 3.11 Algorithm: Transform Point

Given a point and a transform, compute the resulting position:

```javascript
function transformPoint(x, y, transform) {
    // Parse transform string to get components
    // For translate(tx, ty):
    if (transform.startsWith('translate')) {
        const [tx, ty] = parseArgs(transform);
        return { x: x + tx, y: y + ty };
    }
    
    // For scale(sx, sy):
    if (transform.startsWith('scale')) {
        const [sx, sy = sx] = parseArgs(transform);
        return { x: x * sx, y: y * sy };
    }
    
    // For rotate(angle, cx, cy):
    if (transform.startsWith('rotate')) {
        const [angle, cx = 0, cy = 0] = parseArgs(transform);
        const rad = angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return {
            x: cos * (x - cx) - sin * (y - cy) + cx,
            y: sin * (x - cx) + cos * (y - cy) + cy
        };
    }
    
    // For matrix(a, b, c, d, e, f):
    if (transform.startsWith('matrix')) {
        const [a, b, c, d, e, f] = parseArgs(transform);
        return {
            x: a * x + c * y + e,
            y: b * x + d * y + f
        };
    }
}
```

---

## 3.12 Decision Tree: Choosing a Transform

```
Need to change element position?
├─► Yes, just move it → translate(tx, ty)
│
├─► Yes, resize it
│   ├─► From its center? → translate + scale + translate
│   └─► From origin? → scale(sx, sy)
│
├─► Yes, rotate it
│   ├─► Around its center? → rotate(angle, cx, cy)
│   └─► Around origin? → rotate(angle)
│
└─► Need complex movement? → matrix(a, b, c, d, e, f)
```

---

## 3.13 Common Mistakes

### Mistake 1: Forgetting Transform Order

```xml
<!-- WRONG: Expecting translate to happen first -->
transform="rotate(45) translate(100, 0)"
<!-- Actually: translate happens FIRST (rightmost) -->
```

### Mistake 2: Scale Moving Elements

```xml
<!-- WRONG: Expecting element to just get bigger in place -->
<rect x="100" y="100" width="50" height="50" transform="scale(2)"/>
<!-- Actually: Position also scales! Now at (200, 200) -->
```

### Mistake 3: Forgetting Transform Inheritance

```xml
<g transform="translate(50, 50)">
    <rect x="10" y="10" width="30" height="30"/>
    <!-- Rect is actually at (60, 60), not (10, 10)! -->
</g>
```

---

## 3.14 Formula Reference Card

### Translate
```
x' = x + tx
y' = y + ty
```

### Scale (from origin)
```
x' = x × sx
y' = y × sy
```

### Scale (from center cx, cy)
```
Use: translate(cx, cy) scale(s) translate(-cx, -cy)
```

### Rotate (around origin)
```
x' = x×cos(θ) - y×sin(θ)
y' = x×sin(θ) + y×cos(θ)
```

### Rotate (around point cx, cy)
```
rotate(angle, cx, cy)
-- or --
translate(cx, cy) rotate(angle) translate(-cx, -cy)
```

### Matrix
```
x' = ax + cy + e
y' = bx + dy + f
```

---

## 3.15 Chapter Checklist

- [ ] Apply translate to move elements
- [ ] Scale an element from its center (not origin)
- [ ] Rotate an element around its center
- [ ] Understand transform application order (right to left)
- [ ] Compute absolute position through nested group transforms
- [ ] Convert between named transforms and matrix form

---

## 3.16 Key Takeaways

1. **Translate** is the safest and most common transform
2. **Scale and rotate** default to origin—use center-based variants
3. Transforms apply **right to left** in chained transforms
4. Group transforms **accumulate** on children
5. All transforms are really **matrix operations**
6. Use **matrix** when you need to compose programmatically

---

*Next: [Chapter 4: Path Fundamentals](04-path-fundamentals.md)*
