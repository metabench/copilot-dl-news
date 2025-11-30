const jsgui = require('../utils/getJsgui');
const { createColorSelectorControl } = require('../../ui/controls/helpers/colorSelectorFactory');

module.exports = createColorSelectorControl(jsgui, { identifier: 'lab_color_selector' });
