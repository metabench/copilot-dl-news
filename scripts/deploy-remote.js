const { execSync } = require('child_process');
const fs = require('fs');

const REMOTE_HOST = 'oracle-worker';

const DEPLOYMENTS = [
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
    }
];

function exec(cmd) {
    console.log(`> ${cmd}`);
    return execSync(cmd, { stdio: 'inherit' });
}

try {
    const tarballs = [];

    // 1. Prepare Tarballs
    for (const dep of DEPLOYMENTS) {
        const tarName = `deploy_${dep.name}.tar.gz`;
        console.log(`📦 Packaging ${dep.local}...`);
        if (fs.existsSync(tarName)) fs.unlinkSync(tarName);

        execSync(`tar -czf ${tarName} --exclude=node_modules -C ${dep.local} .`);
        tarballs.push(tarName);
    }

    // 2. Upload
    console.log(`🚀 Uploading to ${REMOTE_HOST}...`);
    // Upload tarballs AND the helper script
    execSync(`scp ${tarballs.join(' ')} scripts/remote-deploy.sh ${REMOTE_HOST}:~/`);

    // 3. Execution (via Helper Script)
    console.log('🔄 Executing remote script...');
    // We give execution permission and run it
    execSync(`ssh ${REMOTE_HOST} "chmod +x remote-deploy.sh && bash remote-deploy.sh"`, { stdio: 'inherit' });

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
