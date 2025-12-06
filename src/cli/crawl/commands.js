const { printAvailabilitySummary } = require('./reporting');

const createCommandTable = ({
  service,
  context,
  sharedOverrides,
  logger,
  runOperation,
  runSequencePreset,
  runSequenceConfig,
  runPlaceCommand,
  buildAvailabilityPayload
}) => {
  const entries = [
    {
      command: 'availability',
      needsArgs: false,
      help: 'Show available operations and sequences',
      handler: async () => {
        const includeAll = context.hasFlag('--all');
        const includeOperations =
          includeAll ||
          context.hasFlag('--operations') ||
          (!context.hasFlag('--operations') && !context.hasFlag('--sequences'));
        const includeSequences =
          includeAll ||
          context.hasFlag('--sequences') ||
          (!context.hasFlag('--operations') && !context.hasFlag('--sequences'));
        const availability = service.getAvailability({ logger });
        const payload =
          buildAvailabilityPayload(
            availability,
            {
              showOperationsList: includeOperations,
              showSequencesList: includeSequences
            },
            includeAll
          ) || {};
        printAvailabilitySummary(payload, includeOperations, includeSequences, logger);
      }
    },
    {
      command: 'run-operation',
      needsArgs: true,
      help: 'Run a single operation: <operationName> <startUrl>',
      handler: () => runOperation(service, context, sharedOverrides, logger)
    },
    {
      command: 'run-sequence',
      needsArgs: true,
      help: 'Run a sequence preset: <sequenceName> <startUrl>',
      handler: () => runSequencePreset(service, context, sharedOverrides, logger)
    },
    {
      command: 'run-sequence-config',
      needsArgs: true,
      help: 'Run a sequence from config: <configName>',
      handler: () => runSequenceConfig(service, context, sharedOverrides, logger)
    },
    {
      command: 'place',
      needsArgs: true,
      help: 'Place workflows (guess/explore)',
      handler: () => runPlaceCommand(service, context, sharedOverrides, logger)
    }
  ];

  const commandHandlers = entries.reduce((acc, entry) => {
    acc[entry.command] = entry.handler;
    return acc;
  }, {});

  const commandHelp = entries.reduce((acc, entry) => {
    acc[entry.command] = { help: entry.help, needsArgs: entry.needsArgs };
    return acc;
  }, {});

  return { commandHandlers, commandHelp };
};

module.exports = {
  createCommandTable
};
