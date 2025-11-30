const path = require('path');
const { runEventLab } = require('../../../tools/dev/jsgui3-event-lab');

(async () => {
  const summary = await runEventLab({
    control: 'ActivationHarnessControl',
    controlsPath: path.join(__dirname, '..', 'controls'),
    props: { message: 'Log Event' },
    dispatches: [
      { type: 'click', selector: '[data-role="primary-button"]' }
    ],
    simulateDetach: true,
    simulateReattach: true,
    writeJson: path.join(__dirname, 'ActivationHarnessControl.scenario.json')
  });

  console.log('ActivationHarness scenario summary:');
  console.log(JSON.stringify(summary, null, 2));
})();
