const { execSync } = require('child_process');
const fs = require('fs');

const REMOTE_HOST = 'oracle-worker';

const ALL_DEPLOYMENTS = [
    {
        name: 'shared',
        local: 'src/ui/server/shared',
        remote: 'apps/shared'
    },
    {
        name: 'docs-viewer',
        local: 'src/ui/server/docsViewer',
        remote: 'apps/docs-viewer',
        restart: true
    },
    {
        name: 'remote-crawler-v2',
        local: 'deploy/remote-crawler-v2',
        remote: 'apps/remote-crawler-v2'
    }
];

// ── Parse --only flag ───────────────────────────────────────
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : null;

const DEPLOYMENTS = only
    ? ALL_DEPLOYMENTS.filter(d => only.includes(d.name) || only.includes(d.name.replace('remote-crawler-v2', 'crawler')))
    : ALL_DEPLOYMENTS;

if (DEPLOYMENTS.length === 0) {
    console.error('No deployments matched --only filter.');
    console.error('Available: ' + ALL_DEPLOYMENTS.map(d => d.name).join(', '));
    process.exit(1);
}

console.log(`Deploying: ${DEPLOYMENTS.map(d => d.name).join(', ')}`);

function exec(cmd, timeoutMs = 60000) {
    console.log(`> ${cmd}`);
    return execSync(cmd, { stdio: 'inherit', timeout: timeoutMs });
}

try {
    const tarballs = [];

    // 1. Prepare Tarballs
    for (const dep of DEPLOYMENTS) {
        const tarName = `deploy_${dep.name}.tar.gz`;
        console.log(`📦 Packaging ${dep.local}...`);
        if (fs.existsSync(tarName)) fs.unlinkSync(tarName);

        execSync(`tar -czf ${tarName} --exclude=node_modules --exclude=data -C ${dep.local} .`);
        tarballs.push(tarName);
    }

    // 1b. Fix line endings for shell script
    console.log('🔧 Fixing line endings for remote-deploy.sh...');
    const shContent = fs.readFileSync('scripts/remote-deploy.sh', 'utf8');
    fs.writeFileSync('scripts/remote-deploy.sh', shContent.replace(/\r\n/g, '\n'), { encoding: 'utf8' });

    // 2. Upload
    console.log(`🚀 Uploading to ${REMOTE_HOST}...`);
    execSync(`scp -o ConnectTimeout=10 ${tarballs.join(' ')} scripts/remote-deploy.sh ${REMOTE_HOST}:~/`, { timeout: 120000 });

    // 3. Execution (via Helper Script)
    console.log('🔄 Executing remote script...');
    execSync(`ssh -o ConnectTimeout=10 ${REMOTE_HOST} "chmod +x remote-deploy.sh && bash remote-deploy.sh"`, { stdio: 'inherit', timeout: 300000 });

    console.log('✅ Deployment Script Finished.');

} catch (err) {
    console.error('❌ Deployment Failed');
    process.exit(1);
} finally {
    // Cleanup local tarballs
    for (const dep of DEPLOYMENTS) {
        const tarName = `deploy_${dep.name}.tar.gz`;
        if (fs.existsSync(tarName)) fs.unlinkSync(tarName);
    }
}
