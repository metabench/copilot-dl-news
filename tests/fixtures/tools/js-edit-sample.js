export function alpha() {
  return 'alpha';
}

function beta() {
  const inner = () => 'beta';
  return inner();
}

export default function defaultHandler() {
  return beta();
}

const gamma = () => {
  return 'gamma';
};

const cartoon = { ren: 'Ren', stimpy: 'Stimpy' };
const { ren, stimpy: renAlias } = cartoon;
let [first, , third = 'fallback'] = ['a', 'b'];
var legacy = 42;

const face = '😀';

class MissionController {
  static status = 'ready';

  #secretLog() {
    return 'classified';
  }

  launch() {
    const pad = 'LC-39A';
    function countdown() {
      const sequence = ['3', '2', '1'];
      const merge = () => sequence.join('-');
      return merge();
    }
    return `${pad}-🚀-${countdown()}`;
  }

  log(message = '🚀 liftoff') {
    return message;
  }
}

export class LaunchSequence extends MissionController {
  execute() {
    return this.launch();
  }
}

function legacyCountdown() {
  return ['three', 'two', 'one'].join('-');
}

function handler() {
  return 'standalone-handler';
}

module.exports = function legacyEntry() {
  return legacyCountdown();
};

exports.worker = function worker() {
  return 'worker-ready';
};

module.exports.handler = function handler() {
  return exports.worker();
};

exports.utility = () => ({
  ping: () => 'pong'
});

module.exports.settings = {
  mode: 'legacy'
};

exports.version = 3;
