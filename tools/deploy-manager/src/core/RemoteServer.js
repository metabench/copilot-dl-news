const { spawn, exec: localExec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(localExec);

class RemoteServer {
    constructor(config) {
        this.host = config.host;
        this.username = config.username;
        this.privateKeyPath = config.privateKeyPath;
    }

    // No persistent connection needed for spawn, but we kept API compatible
    connect() {
        return Promise.resolve(this);
    }

    disconnect() {
        // No-op
    }

    exec(command) {
        return new Promise((resolve, reject) => {
            // ssh -i key user@host "command"
            const args = [
                '-i', this.privateKeyPath,
                '-o', 'StrictHostKeyChecking=no',
                `${this.username}@${this.host}`,
                command
            ];

            const child = spawn('ssh', args);

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', d => stdout += d);
            child.stderr.on('data', d => stderr += d);

            child.on('close', (code) => {
                // If code is non-zero, we still resolve to return stdout/stderr, caller handles error logic
                resolve({ stdout, stderr, code });
            });

            child.on('error', reject);
        });
    }

    async deploy(localDir, remoteDir) {
        // 1. Tar local
        const tarName = 'deploy_bundle.tar.gz';
        const tarPath = path.join(process.cwd(), tarName);
        console.log(`Archiving ${localDir}...`);

        // Use local tar (assuming availability)
        // Note: Windows tar might require full path or different flags, testing via CLI will verify.
        await execPromise(`tar -czf "${tarPath}" -C "${localDir}" .`);

        // 2. Upload via SCP
        console.log('Uploading...');
        await this.scp(tarPath, `/tmp/${tarName}`);

        // 3. Extract Remote
        console.log('Extracting remote...');
        await this.exec(`mkdir -p ${remoteDir}`);
        await this.exec(`tar -xzf /tmp/${tarName} -C ${remoteDir}`);

        // Cleanup
        if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
        await this.exec(`rm /tmp/${tarName}`);

        return `Deployed to ${remoteDir}`;
    }

    scp(localPath, remotePath) {
        return new Promise((resolve, reject) => {
            const args = [
                '-i', this.privateKeyPath,
                '-o', 'StrictHostKeyChecking=no',
                localPath,
                `${this.username}@${this.host}:${remotePath}`
            ];

            const child = spawn('scp', args);

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`SCP failed with code ${code}`));
            });

            child.on('error', reject);
        });
    }
}

module.exports = RemoteServer;
