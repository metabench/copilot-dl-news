const jsgui = require('jsgui3-html');
const { Control, Standard_Web_Page } = jsgui;
const CanvasControl = require('../shared/isomorphic/controls/canvas/CanvasControl');
const DraggableControl = require('../shared/isomorphic/controls/interactive/DraggableControl');
const ResizableControl = require('../shared/isomorphic/controls/interactive/ResizableControl');
const ConnectorControl = require('../shared/isomorphic/controls/interactive/ConnectorControl');

class Page extends Standard_Web_Page {
    constructor(spec) {
        super(spec);
        this.__type_name = 'page';
        this.title = 'WYSIWYG Demo';
    }
    
    compose() {
        super.compose();
        
        // Set title explicitly
        if (this.head && this.head.title) {
            this.head.title.add('WYSIWYG Demo');
        }
        
        // Add client script
        const script = new Control({
            context: this.context,
            tagName: 'script'
        });
        script.dom.attributes.src = '/js/bundle.js';
        script.dom.attributes.defer = true;
        this.head.add(script);
        
        const canvas = new CanvasControl({
            context: this.context,
            width: 1000,
            height: 800,
            showGrid: true,
            snapToGrid: true
        });
        // Ensure canvas internal structure is built before adding elements
        canvas.compose();
        
        // Add to body if available, otherwise add to self (fallback)
        if (this.body) {
            this.body.add(canvas);
        } else {
            this.add(canvas);
        }
        
        // 1. Draggable Box
        const box1 = new DraggableControl({
            context: this.context,
            dragMode: 'within-parent', // Use absolute positioning compatible with Canvas
            constrainToParent: true
        });
        box1.style.width = '100px';
        box1.style.height = '100px';
        box1.style.backgroundColor = '#e3f2fd';
        box1.style.border = '1px solid #2196f3';
        box1.style.display = 'flex';
        box1.style.alignItems = 'center';
        box1.style.justifyContent = 'center';
        box1.add('Draggable');
        
        // Add to canvas (sets initial left/top)
        canvas.addElement(box1, 100, 100);
        
        // 2. Resizable Box
        const box2 = new ResizableControl({
            context: this.context,
            minWidth: 50,
            minHeight: 50
        });
        box2.style.width = '150px';
        box2.style.height = '150px';
        box2.style.backgroundColor = '#e8f5e9';
        box2.style.border = '1px solid #4caf50';
        box2.style.display = 'flex';
        box2.style.alignItems = 'center';
        box2.style.justifyContent = 'center';
        box2.add('Resizable');
        
        // Add to canvas
        canvas.addElement(box2, 400, 100);
        
        // 3. Draggable AND Resizable Box
        // Wrap Resizable in Draggable? Or Draggable in Resizable?
        // Usually Draggable(Resizable(Content))
        
        const box3 = new DraggableControl({
            context: this.context,
            dragMode: 'within-parent'
        });
        // We need the draggable to be the outer container
        // But ResizableControl expects to be the container of content
        // If we put Resizable inside Draggable, resizing the inner box won't resize the outer draggable container automatically unless we sync them.
        
        // Alternative: ResizableControl IS Draggable.
        // Or: ResizableControl has a 'drag-handle' that triggers drag on itself.
        
        // For now, let's just test them separately to verify the controls.
        
        // 4. Connector
        const connector = new ConnectorControl({
            context: this.context,
            source: box1,
            target: box2,
            type: 'curved',
            color: '#f44336',
            width: 3
        });
        canvas.addConnector(connector);
        
        // 5. Another Connector (Straight)
        const box3_dummy = new DraggableControl({
            context: this.context,
            dragMode: 'within-parent'
        });
        box3_dummy.style.width = '80px';
        box3_dummy.style.height = '80px';
        box3_dummy.style.backgroundColor = '#fff3e0';
        box3_dummy.style.border = '1px solid #ff9800';
        box3_dummy.add('Target');
        canvas.addElement(box3_dummy, 250, 400);
        
        const connector2 = new ConnectorControl({
            context: this.context,
            source: box1,
            target: box3_dummy,
            type: 'straight',
            color: '#9c27b0',
            width: 2,
            tagName: 'path' // Explicitly set tag
        });
        canvas.addConnector(connector2);
    }
}

module.exports = Page;
