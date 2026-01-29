#!/usr/bin/env node
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const RemoteServer = require('../core/RemoteServer');
const NodeDeployer = require('../core/NodeDeployer');
const path = require('path');
const fs = require('fs');

// Import NodeRegistry from src/distributed
const registryPath = path.join(__dirname, '../../../../src/distributed/NodeRegistry');
let NodeRegistry, getNodeRegistry;
try {
    const mod = require(registryPath);
    NodeRegistry = mod.NodeRegistry;
    getNodeRegistry = mod.getNodeRegistry;
} catch (e) {
    console.warn('NodeRegistry not available:', e.message);
}

// Simple config management (legacy)
const CONFIG_PATH = path.join(__dirname, '../../config.json');
let config = {};
if (fs.existsSync(CONFIG_PATH)) {
    try { config = JSON.parse(fs.readFileSync(CONFIG_PATH)); } catch (e) { }
}

const registry = getNodeRegistry ? getNodeRegistry() : null;

yargs(hideBin(process.argv))
    .command('add <name> <host> <user> <key>', 'Add a server (legacy)', {}, (argv) => {
        config[argv.name] = {
            host: argv.host,
            username: argv.user,
            privateKeyPath: argv.key
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        console.log(`Server ${argv.name} added.`);
    })
    .command('list', 'List servers (legacy)', {}, () => {
        console.table(config);
    })
    .command('deploy <server> <localDir> <remoteDir>', 'Deploy app', {}, async (argv) => {
        const serverConfig = config[argv.server];
        if (!serverConfig) return console.error('Server not found');

        const server = new RemoteServer(serverConfig);
        try {
            console.log(`Connecting to ${serverConfig.host}...`);
            await server.connect();
            console.log('Connected.');

            const result = await server.deploy(argv.localDir, argv.remoteDir);
            console.log(result);

            // Post-deploy: npm install?
            console.log('Running npm install...');
            const install = await server.exec(`cd ${argv.remoteDir} && npm install --production`);
            console.log(install.stdout);

        } catch (e) {
            console.error(e);
        } finally {
            server.disconnect();
        }
    })
    .command('cmd <server> <command>', 'Execute command', {}, async (argv) => {
        const serverConfig = config[argv.server];
        if (!serverConfig) return console.error('Server not found');

        const server = new RemoteServer(serverConfig);
        try {
            await server.connect();
            const res = await server.exec(argv.command);
            console.log(res.stdout);
            if (res.stderr) console.error(res.stderr);
        } catch (e) {
            console.error(e);
        } finally {
            server.disconnect();
        }
    })
    // ==================== NEW NODE REGISTRY COMMANDS ====================
    .command('nodes', 'Node registry management', (yargs) => {
        return yargs
            .command('list', 'List registered nodes', {}, () => {
                if (!registry) return console.error('NodeRegistry not available');
                const nodes = registry.listNodes();
                if (nodes.length === 0) {
                    console.log('No nodes registered.');
                } else {
                    console.table(nodes.map(n => ({
                        id: n.id,
                        host: n.host,
                        port: n.port,
                        enabled: n.enabled,
                        workerUrl: n.workerUrl,
                    })));
                }
            })
            .command('add <id> <host> <user> <keyPath>', 'Add a worker node', {
                port: { alias: 'p', type: 'number', default: 3120 },
                remoteDir: { alias: 'd', type: 'string', default: '~/crawler-worker' },
            }, (argv) => {
                if (!registry) return console.error('NodeRegistry not available');
                const node = registry.addNode({
                    id: argv.id,
                    host: argv.host,
                    port: argv.port,
                    username: argv.user,
                    privateKeyPath: argv.keyPath,
                    remoteDir: argv.remoteDir,
                });
                console.log(`Node added: ${node.id} -> ${node.workerUrl}`);
            })
            .command('remove <id>', 'Remove a worker node', {}, (argv) => {
                if (!registry) return console.error('NodeRegistry not available');
                const removed = registry.removeNode(argv.id);
                console.log(removed ? `Node ${argv.id} removed.` : `Node ${argv.id} not found.`);
            })
            .command('health', 'Check health of all nodes', {}, async () => {
                if (!registry) return console.error('NodeRegistry not available');
                const deployer = new NodeDeployer({ registry });
                const results = await deployer.checkAllHealth();
                console.table(results);
            })
            .demandCommand(1, 'Specify a nodes subcommand: list, add, remove, health');
    })
    .command('deploy-all <localDir>', 'Deploy to all registered nodes', {
        remoteDir: { alias: 'd', type: 'string', description: 'Override remote directory' },
        restart: { alias: 'r', type: 'boolean', default: true, description: 'Restart worker after deploy' },
        sequential: { alias: 's', type: 'boolean', default: false, description: 'Deploy sequentially' },
    }, async (argv) => {
        if (!registry) return console.error('NodeRegistry not available');

        const deployer = new NodeDeployer({ registry, logger: console.log });
        const result = await deployer.deployToAll(argv.localDir, {
            remoteDir: argv.remoteDir,
            restart: argv.restart,
            parallel: !argv.sequential,
        });

        console.log(`\nDeployment Summary: ${result.succeeded} succeeded, ${result.failed} failed`);
        if (!result.success) {
            process.exit(1);
        }
    })
    .demandCommand(1, 'Specify a command')
    .help()
    .parse();

