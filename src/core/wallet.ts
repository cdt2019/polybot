import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger';
import { ethers } from 'ethers';

export async function loadPrivateKey() {

    // Initialize Executor
    let privateKey = process.env.PRIVATE_KEY;

    if (privateKey) {
        logger.info('Using PRIVATE_KEY from environment.');
        try {
            const wallet = new ethers.Wallet(privateKey);
            privateKey = wallet.privateKey;
            logger.info('Wallet address: ' + wallet.address);
        } catch (error) {
            logger.error('Failed to load wallet from PRIVATE_KEY of .env file:', error);
            process.exit(1);
        }
    } else {
        // Check for wallet.json
        const keystorePath = path.join(process.cwd(), 'wallet.json');
        if (fs.existsSync(keystorePath)) {
            logger.info('Found wallet.json. Decrypting...');

            // We need to ask for password. Since we are in an async function, we can use readline.
            const rl = await import('readline').then(m => m.createInterface({
                input: process.stdin,
                output: process.stdout
            }));

            const password = await new Promise<string>(resolve => {
                rl.question('Enter wallet password: ', (answer) => {
                    rl.close();
                    resolve(answer);
                });
            });

            try {
                const json = fs.readFileSync(keystorePath, 'utf8');
                const wallet = await ethers.Wallet.fromEncryptedJson(json, password);
                privateKey = wallet.privateKey;
                logger.info('Wallet address: ' + wallet.address);
            } catch (error) {
                logger.error('Failed to decrypt wallet:', error);
                process.exit(1);
            }
        }
    }

    if (!privateKey) {
        privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
        logger.warn('No private key found. Using dummy key (read-only mode).');
    }

    return privateKey;
}