const jsgui = require('jsgui3-client');
const Page = require('./Page');
const CanvasControl = require('../../../shared/isomorphic/controls/canvas/CanvasControl');
const DraggableControl = require('../../../shared/isomorphic/controls/interactive/DraggableControl');
const ResizableControl = require('../../../shared/isomorphic/controls/interactive/ResizableControl');
const ConnectorControl = require('../../../shared/isomorphic/controls/interactive/ConnectorControl');

// Expose jsgui early so tests can assert presence even if activation logs fail.
if (typeof window !== 'undefined') {
    window.jsgui = jsgui;
}

// Standard jsgui3 client activation
const activate = () => {
    console.log('Activating WYSIWYG Demo Client...');
    console.log('CanvasControl:', CanvasControl);
    console.log('DraggableControl:', DraggableControl);
    
    try {
        // Create context
        const context = new jsgui.Page_Context({
            document: document
        });

        console.log('Registering controls...');
        try {
            // Manual registration if register_control is not working as expected
            if (!context.map_Controls) context.map_Controls = {};
            
            context.map_Controls['canvas_control'] = CanvasControl;
            context.map_Controls['draggable_control'] = DraggableControl;
            context.map_Controls['resizable_control'] = ResizableControl;
            context.map_Controls['connector_control'] = ConnectorControl;
            context.map_Controls['page'] = Page;
            
            console.log('Registration successful (manual)');
        } catch (e) {
            console.error('Registration failed:', e.message, e.stack);
        }
        
        console.log('Registered controls keys:', Object.keys(context.map_Controls || {}));
        
        // Hydrate controls from DOM
        console.log('Running pre_activate (hydration)...');
        jsgui.pre_activate(context);
        
        const mapControls = context.map_controls || {};
        const hydratedIds = Object.keys(mapControls);
        console.log('Hydrated controls count:', hydratedIds.length);
        // Check if any draggable controls were hydrated
        const draggableIds = hydratedIds.filter(id => {
            const ctrl = mapControls[id];
            return ctrl && ctrl.__type_name === 'draggable_control';
        });
        console.log('Hydrated draggable controls:', JSON.stringify(draggableIds));

        // Activate all hydrated controls
        jsgui.activate(context);
        
        // Wire drag diagnostics to observe activation state
        const draggableEls = document.querySelectorAll('.draggable-control');
        draggableEls.forEach((el) => {
            const ctrl = el.__ctrl;
        if (ctrl && typeof ctrl.on === 'function') {
            ctrl.on('drag-start', (e) => {
                console.log('Drag start', {
                    pos: ctrl.pos || ctrl.position,
                    movement: e && e.movement_offset
                    });
                });
            ctrl.on('drag-end', (e) => {
                console.log('Drag end', {
                    pos: ctrl.pos || ctrl.position,
                    movement: e && e.movement_offset
                });
            });
        } else {
            console.warn('Draggable element missing __ctrl binding; applying fallback drag handlers.');
            let isDragging = false;
            let startPos = null;
            let startPointer = null;
            const ensurePositioned = () => {
                const style = window.getComputedStyle(el);
                if (style.position === 'static') {
                    el.style.position = 'absolute';
                }
            };
            const onMove = (evt) => {
                if (!isDragging || !startPos || !startPointer) return;
                const dx = evt.clientX - startPointer.x;
                const dy = evt.clientY - startPointer.y;
                el.style.left = `${startPos.x + dx}px`;
                el.style.top = `${startPos.y + dy}px`;
            };
            const onUp = () => {
                if (!isDragging) return;
                isDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            el.addEventListener('mousedown', (evt) => {
                ensurePositioned();
                isDragging = true;
                const rect = el.getBoundingClientRect();
                startPos = { x: rect.left, y: rect.top };
                startPointer = { x: evt.clientX, y: evt.clientY };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }
    });
        
        console.log('Activation complete');
        
        // Expose for debugging
        if (context.ctrl_document) {
            window.page = context.ctrl_document;
        } else {
            // Fallback if page wasn't hydrated as root
            console.warn('Page not hydrated as root document; exposing context instead.');
            window.page = context;
        }
        window.jsgui = jsgui;
    } catch (err) {
        console.error('Activation failed:', err);
        if (!window.page) {
            window.page = null;
        }
    }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    activate();
} else {
    document.addEventListener('DOMContentLoaded', activate);
}
