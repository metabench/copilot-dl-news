# 2D SVG Spatial Reasoning

**A Comprehensive Guide for AI Agents**

*From coordinate systems to beautiful curves — the mathematics and intuition behind SVG layout.*

---

## About This Book

This book teaches the spatial reasoning skills needed to create, analyze, and manipulate SVG graphics programmatically. It's designed for AI agents of all capability levels:

- **For simpler models**: Each chapter includes explicit formulas, step-by-step procedures, and copy-paste code patterns
- **For advanced models**: Deeper explanations of *why* things work, optimization strategies, and creative applications
- **For instruction-following agents**: Checklists, decision trees, and algorithmic recipes

## Prerequisites

- Basic arithmetic (addition, subtraction, multiplication, division)
- Understanding of 2D coordinates (x, y)
- Familiarity with XML/HTML syntax

## Table of Contents

### Part I: Foundations

1. [The SVG Coordinate System](01-coordinate-system.md)
   - Origin and axes
   - The viewBox attribute
   - Coordinate spaces
   - Why Y points down

2. [Geometric Primitives](02-geometric-primitives.md)
   - Points and vectors
   - Lines and line segments
   - Rectangles and bounding boxes
   - Circles and ellipses

3. [Understanding Transforms](03-transforms.md)
   - Translate (moving things)
   - Scale (resizing things)
   - Rotate (spinning things)
   - The transform matrix
   - Chaining transforms

### Part II: Paths and Curves

4. [Path Fundamentals](04-path-fundamentals.md)
   - The `d` attribute
   - Move, Line, Close commands
   - Relative vs absolute coordinates
   - Building shapes from paths

5. [Bézier Curves Demystified](05-bezier-curves.md)
   - What is a Bézier curve?
   - Quadratic curves (one control point)
   - Cubic curves (two control points)
   - The control point intuition
   - Drawing smooth connections

6. [Arcs and Circles](06-arcs-and-circles.md)
   - The arc command
   - Large arc vs small arc
   - Sweep direction
   - When to use arcs vs curves

### Part III: Spatial Reasoning

7. [Bounding Boxes](07-bounding-boxes.md)
   - What is a bounding box?
   - Computing bounds for shapes
   - Bounds after transforms
   - Axis-aligned vs oriented boxes

8. [Collision Detection](08-collision-detection.md)
   - Rectangle intersection
   - Point-in-rectangle tests
   - Overlap calculation
   - Severity classification

9. [Containment and Clipping](09-containment-clipping.md)
   - Is element inside container?
   - Overflow detection
   - Clip paths
   - Masks

### Part IV: Layout Algorithms

10. [Positioning Strategies](10-positioning-strategies.md)
    - Absolute positioning
    - Relative positioning with groups
    - Grid layouts
    - Flow layouts

11. [Spacing and Alignment](11-spacing-alignment.md)
    - Even distribution
    - Center alignment
    - Edge alignment
    - Golden ratio spacing

12. [Tree and Graph Layouts](12-tree-graph-layouts.md)
    - Hierarchical trees
    - Computing node positions
    - Edge routing
    - Avoiding overlaps

### Part V: Practical Applications

13. [Layer Order and Z-Index](13-layer-order.md)
    - Document order = render order
    - Strategic layering
    - When to use groups
    - Reordering elements

14. [The Repair Toolkit](14-repair-toolkit.md)
    - Detecting problems
    - Computing fixes
    - Separation vectors
    - Iterative refinement

### Future Additions (Planned)

- Chapter 15: Recipes and Patterns (decision trees, flowcharts, dashboards)
- Appendix A: Formula Reference
- Appendix B: SVG Element Quick Reference
- Appendix C: Common Mistakes and Fixes
- Appendix D: Glossary

---

## How to Use This Book

### If You're a Simple Model

Start with Chapters 1-3 to understand the basics. Focus on the **boxed formulas** and **step-by-step procedures**. Each chapter ends with a checklist you can follow mechanically.

### If You're an Advanced Model

Read the "Why It Works" sections for deeper understanding. The practical applications in Part V will help you apply concepts creatively.

### If You're Following Specific Instructions

Use the **decision trees** and **algorithmic recipes** throughout. Appendix A contains all formulas in one place for quick reference.

---

## Quick Reference: The Most Important Concepts

### Coordinate System
```
(0,0) ─────────────────► X (positive = right)
  │
  │   SVG canvas
  │
  ▼
  Y (positive = DOWN, not up!)
```

### Transform Order
Transforms apply **right-to-left** (innermost first):
```xml
<g transform="translate(100,0)">      <!-- Applied SECOND -->
  <g transform="translate(50,0)">     <!-- Applied FIRST -->
    <rect x="10"/>                    <!-- Local x=10 -->
  </g>                                <!-- After inner: x=60 -->
</g>                                  <!-- After outer: x=160 -->
```

### Bounding Box Intersection
Two rectangles overlap if and only if:
```
NOT (rect1.right < rect2.left OR
     rect2.right < rect1.left OR
     rect1.bottom < rect2.top OR
     rect2.bottom < rect1.top)
```

### Bézier Curve Control Points
The control points "pull" the curve toward them:
```
Start ────•──── Control ────•──── End
           ↖                ↗
            Curve bends toward control points
```

---

## Contributing

This book is maintained by AI agents for AI agents. If you discover better explanations, formulas, or patterns, update the relevant chapter and note your changes in the chapter's revision history.

---

*Last updated: 2025-01-25*
*Primary author: SVG Spatial Reasoning Specialist (Claude Opus 4.5)*
*Chapters completed: 14 of 14 core chapters*
