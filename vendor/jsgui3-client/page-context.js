var jsgui = require('jsgui3-html');
const {
    Control,
    controls,
    deep_sig,
    each
} = jsgui;
const {
    Modal
} = controls;
var Client_Resource_Pool = require('./client-resource-pool');
const X = 0,
    Y = 1,
    H = 2,
    W = 3,
    R = 4,
    B = 5,
    TX = 6,
    TY = 7;
class Client_Page_Context extends jsgui.Page_Context {
    constructor(spec) {
        spec = spec || {};
        super(spec);
        const {
            map_controls,
            map_control_iids,
            next_iid
        } = this;
        this.document = spec.document || document;
        this.resource_pool = new Client_Resource_Pool({});
        this.__is_active = true;
        this.map_els = {};
        let ctrl_modal;

        this.mixins = jsgui.mixins;

        // Modal and overlay may be better implemented with mixins perhaps.

        Object.defineProperty(this, 'modal', {
            get() {
                if (ctrl_modal) {
                    return ctrl_modal;
                } else {
                    ctrl_modal = new Modal({
                        context: this,
                        class: 'modal'
                    });
                    const body = this.body();
                    if (body) {
                        body.add(ctrl_modal);
                    }
                    return ctrl_modal;
                }
            },
            enumerable: true
        });
        let ctrl_overlay;
        Object.defineProperty(this, 'overlay', {
            get() {
                if (ctrl_overlay) {
                    return ctrl_overlay;
                } else {
                    ctrl_overlay = new Control({
                        context: this,
                        class: 'overlay'
                    });
                    const body = this.body();
                    if (body) {
                        body.add(ctrl_overlay);
                        ctrl_overlay.activate();
                    }
                    ctrl_overlay.place = (ctrl, location) => {
                        const sloc = deep_sig(location);
                        let placement_abs_pos;
                        if (sloc === '[s,C]') {
                            const [str_description, ctrl_target] = location;
                            const target_bcr = ctrl_target.bcr();
                            const overlay_bcr = ctrl_overlay.bcr();
                            if (str_description === 'below') {
                                placement_abs_pos = [target_bcr[0][0], target_bcr[1][1]];
                                const overlay_size = overlay_bcr[1];
                                const body_size = body.bcr()[1];
                                const height_left_below_placement = body_size[1] - placement_abs_pos[1];
                                ctrl.pos = placement_abs_pos;
                                ctrl.dom.attributes.style.position = 'absolute';
                                ctrl.dom.attributes.style['max-height'] = height_left_below_placement + 'px';
                            } else {
                                console.trace();
                                throw 'NYI';
                            }
                        }
                        ctrl_overlay.add(ctrl);
                    }
                    return ctrl_overlay;
                }
            },
            enumerable: true
        });
        let frame_num = 0;
        let last_timestamp;
        let was_resized = false;
        this.map_controls_being_removed_in_frame = false;
        this.map_controls_being_added_in_frame = false;
        let map_ctrls_in_last_frame = {};
        let map_ctrls_in_this_frame;
        let count_dom_ctrls = 0;
        const num_data_points_per_ctrl = 32;

        // May want to simplify this in terms of API, make a page or two explaining it, and maybe make it disabled by default
        //.  or used on a lower level only by things that need it.

        // Could see about making use of this for detecing overlaps of siblings in a rectangle that extends from the left of a control.

        // This may be better integrated with some code more specific to geometries.
        //.  Could have some kinds of observers that watch the values that represent the geometries of various controls.



        

        this.on('activate', () => {
            //console.log('activated client page_context.... ***** map_controls', map_controls);
            each(map_controls, (ctrl, jsgui_id) => {
                if (ctrl.dom?.el) {
                    map_ctrls_in_last_frame[jsgui_id] = ctrl;
                    count_dom_ctrls++;
                }
            });
            let ta_last_frame;
            let ta_current_frame_stored;
            let ta_current_frame_for_user;
            let ta_user_frame_changes;
            let map_current_dom_ctrl_iids;
            let map_current_dom_ctrls_by_iid = {};
            const create_controls_number_props_ta = () => {
                const ta_length = num_data_points_per_ctrl * count_dom_ctrls;
                const res = new Float32Array(ta_length);
                const create_map_ctrls_iids = (map_dom_ctrls) => {
                    const keys = Object.keys(map_dom_ctrls);
                    const res = {};
                    each(keys, (jsgui_id, i) => {
                        res[jsgui_id] = i;
                        map_current_dom_ctrls_by_iid[i] = map_dom_ctrls[jsgui_id];
                    })
                    return res;
                }
                map_current_dom_ctrl_iids = create_map_ctrls_iids(map_ctrls_in_last_frame);
                const record_ctrls_info = (map_dom_ctrls, map_dom_ctrl_iids, ta) => {
                    each(map_dom_ctrls, (ctrl, jsgui_id) => {
                        const iid = map_dom_ctrl_iids[jsgui_id];
                        const el = ctrl.dom.el;
                        const bcr = el.getBoundingClientRect();
                        const start_pos = iid * num_data_points_per_ctrl;
                        let wpos = start_pos;
                        ta[wpos++] = bcr.left;
                        ta[wpos++] = bcr.top;
                        ta[wpos++] = bcr.width;
                        ta[wpos++] = bcr.height;
                        ta[wpos++] = bcr.right;
                        ta[wpos++] = bcr.bottom;

                        // t3dx: ta[6]
                        // t3dy: ta[7]
                        // t3dz: ta[8]
                    });
                }
                record_ctrls_info(map_ctrls_in_last_frame, map_current_dom_ctrl_iids, res);
                return res;
            }
            const assign_ctrls_ta_subarrays = (ta_current_frame_for_user, map_dom_controls, map_iids) => {
                each(map_dom_controls, (ctrl, jsgui_id) => {
                    const ctrl_iid = map_iids[jsgui_id];
                    const pos_start = ctrl_iid * num_data_points_per_ctrl;
                    const pos_end = pos_start + num_data_points_per_ctrl;
                    ctrl.ta = ta_current_frame_for_user.subarray(pos_start, pos_end);
                });
            }
            const frame_process = (timestamp) => {
                frame_num++;
                const find_control_numeric_values_changed = () => {
                    let i_ctrl = 0;
                    let pos = 0;
                    const l = ta_current_frame_for_user.length;
                    let has_change;
                    const ta_controls_which_have_changed_iids = new Int8Array(count_dom_ctrls);
                    ta_controls_which_have_changed_iids.fill(-1);
                    let tacwhci_wpos = 0;
                    while (pos < l) {
                        const change = ta_current_frame_for_user[pos] - ta_current_frame_stored[pos];
                        let ctrl_iid = Math.floor(pos / num_data_points_per_ctrl);
                        if (change !== 0) {
                            has_change = true;
                            ta_controls_which_have_changed_iids[tacwhci_wpos++] = ctrl_iid;
                        }
                        ta_user_frame_changes[pos] = change;
                        pos++;
                    }
                    if (has_change) {
                        let c = 0;
                        let l = ta_user_frame_changes.length;
                        let stop = false;
                        while (!stop && c < l) {
                            const ctrl_iid = ta_controls_which_have_changed_iids[c];
                            if (ctrl_iid === -1) {
                                stop = true;
                            } else {
                                const changed_ctrl = map_current_dom_ctrls_by_iid[ctrl_iid];
                                const ta_ctrl_changes = ta_user_frame_changes.subarray(ctrl_iid * num_data_points_per_ctrl, (ctrl_iid + 1) * num_data_points_per_ctrl);
                                const ctrl_ta = changed_ctrl.ta;
                                let i = 0,
                                    l = ctrl_ta.length;
                                let changed_transform = false;
                                for (i = 0; i < l; i++) {
                                    if (ta_ctrl_changes[i] !== 0) {
                                        const new_val = ctrl_ta[i];
                                        const X = 0,
                                            Y = 1,
                                            H = 2,
                                            W = 3,
                                            R = 4,
                                            B = 5,
                                            TX = 6,
                                            TY = 7;
                                        if (i === 1) {
                                        } else if (i === 2) {
                                        } else if (i === 3) {
                                        } else if (i === 4) {
                                        } else if (i === 5) {
                                        } else if (i === 6 || i === 7) {
                                            if (!changed_transform) {
                                                const tx = ctrl_ta[6];
                                                const ty = ctrl_ta[7];
                                                changed_ctrl.dom.attributes.style.transform = 'translate3d(' + tx + 'px, ' + ty + 'px, 0px)';
                                                changed_transform = true;
                                            }
                                        }
                                    }
                                }
                                let w_pos_ctrl = ctrl_iid * num_data_points_per_ctrl;
                                for (let i = 0; i < l; i++) {
                                    ta_current_frame_stored[w_pos_ctrl++] = ctrl_ta[i];
                                }
                            }
                            c++;
                        }
                    }
                }
                if (frame_num > 1) {
                    find_control_numeric_values_changed();
                } else {
                    assign_ctrls_ta_subarrays(ta_current_frame_for_user, map_ctrls_in_last_frame, map_current_dom_ctrl_iids);
                }
                let count_add = 0;
                let count_remove = 0;
                if (frame_num === 1) {} else {
                    map_ctrls_in_this_frame = {};
                }
                if (this.map_controls_being_removed_in_frame) {
                    //console.log('this.map_controls_being_removed_in_frame', this.map_controls_being_removed_in_frame);
                    each(map_ctrls_in_last_frame, (ctrl_in_last_frame, ctrl_id) => {
                        if (!this.map_controls_being_removed_in_frame[ctrl_id]) {
                            map_ctrls_in_this_frame[ctrl_id] = ctrl_in_last_frame;
                        }
                    });
                    count_remove += Object.keys(this.map_controls_being_removed_in_frame).length;
                    this.map_controls_being_removed_in_frame = false;
                } else {
                    map_ctrls_in_this_frame = map_ctrls_in_last_frame;
                }
                if (this.map_controls_being_added_in_frame) {
                    //console.log('this.map_controls_being_added_in_frame', this.map_controls_being_added_in_frame);
                    this.map_controls_being_added_in_frame = false;
                    each(this.map_controls_being_added_in_frame, (ctrl_added, ctrl_id) => {
                        map_ctrls_in_this_frame[ctrl_id] = ctrl_added;
                        count_add++;
                    })
                }
                this.raise('frame', {
                    number: frame_num,
                    timestamp: timestamp,
                    window_was_resized: was_resized,
                    count_ctrls_added: count_add,
                    count_ctrls_removed: count_remove,
                    map_dom_controls: map_ctrls_in_this_frame,
                    count_dom_ctrls: count_dom_ctrls,
                    ta_dom_controls_numeric_values: ta_current_frame_for_user,
                    map_dom_ctrl_iids: map_current_dom_ctrl_iids
                });
                last_timestamp = timestamp;
                window.requestAnimationFrame(frame_process);
                was_resized = false;
                map_ctrls_in_last_frame = map_ctrls_in_this_frame;
            }
            window.requestAnimationFrame(frame_process);
            window.addEventListener('resize', e => {
                was_resized = true;
                this.raise('window-resize', e);
            });
            //console.log('count_dom_ctrls', count_dom_ctrls);
            ta_current_frame_stored = create_controls_number_props_ta();
            //console.log('ta_current_frame_stored.length', ta_current_frame_stored.length);
            ta_current_frame_for_user = new Float32Array(ta_current_frame_stored.length);
            ta_user_frame_changes = new Float32Array(ta_current_frame_stored.length);
            ta_current_frame_for_user.set(ta_current_frame_stored);
        });



        const trial_fns_now_unused = () => {
            const create_dims_from_current_ctrls = this.create_dims_from_current_ctrls = () => {
                const {
                    next_iid
                } = this;
                const ctrl_length = 6;
                const ta_res = new Float32Array(next_iid * ctrl_length);
                let wpos = 0;
                each(map_controls, (ctrl, id) => {
                    const ctrl_iid = ctrl.iid;
                    wpos = ctrl_iid * ctrl_length;
                    if (ctrl.dom && ctrl.dom.el) {
                        const bcr = ctrl.dom.el.getBoundingClientRect();
                        ta_res[wpos++] = bcr.left;
                        ta_res[wpos++] = bcr.top;
                        ta_res[wpos++] = bcr.right;
                        ta_res[wpos++] = bcr.bottom;
                        ta_res[wpos++] = bcr.width;
                        ta_res[wpos++] = bcr.height;
                    }
                });
                return ta_res;
            }
        }
    }
    'get_ctrl_el' (ctrl) {
        return this.map_els[ctrl._id()];
    }
    'register_el' (el) {
        let jsgui_id = el.getAttribute('data-jsgui-id');
        if (jsgui_id) {
            this.map_els[jsgui_id] = el;
        }
    }
    'body' () {
        var doc = this.document;
        var bod = doc.body;
        if (!this._body) {
            var existing_jsgui_id = bod.getAttribute('data-jsgui-id');
            if (!existing_jsgui_id) {
                var ctrl_body = new jsgui.body({
                    'el': document.body,
                    'context': this
                });
                ctrl_body.dom.el.setAttribute('jsgui-id', ctrl_body._id());
                this.register_control(ctrl_body);
                this._body = ctrl_body;
            } else {
                if (this.map_controls[existing_jsgui_id]) {
                    this._body = this.map_controls[existing_jsgui_id];
                }
            }
        } else {
        }
        return this._body;
    }
}
Client_Page_Context.css = `
body .modal {
    position: absolute;
    left: 0px;
    top: 0px;
}
body .overlay {
    position: absolute;
    left: 0px;
    top: 0px;
}
`;
module.exports = Client_Page_Context;