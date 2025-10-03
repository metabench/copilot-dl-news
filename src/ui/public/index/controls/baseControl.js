import { nanoid } from '../state/utils.js';
import { DataModel } from '../jsgui/dataModel.js';
import { createEventHub } from '../jsgui/events.js';

export function createControl({
  id = nanoid('control'),
  activate,
  update,
  deactivate,
  initialData,
  initialView
} = {}) {
  if (activate && typeof activate !== 'function') {
    throw new TypeError('activate must be a function');
  }
  if (update && typeof update !== 'function') {
    throw new TypeError('update must be a function');
  }
  if (deactivate && typeof deactivate !== 'function') {
    throw new TypeError('deactivate must be a function');
  }

  let isActive = false;
  const events = createEventHub();
  const dataModel = new DataModel(initialData);
  const viewModel = new DataModel(initialView);

  const control = {
    id,
    dataModel,
    viewModel,
    on: events.on,
    emit: events.emit,
    activate(context) {
      if (isActive) return;
      if (activate) activate({ control, context });
      isActive = true;
      events.emit('activate', { control, context });
    },
    update(context) {
      if (!isActive) {
        if (activate) activate({ control, context });
        isActive = true;
        events.emit('activate', { control, context });
      }
      if (update) update({ control, context });
      events.emit('update', { control, context });
    },
    deactivate(context) {
      if (!isActive) return;
      if (deactivate) deactivate({ control, context });
      isActive = false;
      events.emit('deactivate', { control, context });
    }
  };

  return control;
}
