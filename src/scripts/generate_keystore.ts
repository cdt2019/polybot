import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';

dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    try {
        console.log('=== Generate Encrypted Keystore ===');

        console.log('Select input method:');
        console.log('1. Private Key');
        console.log('2. Mnemonic Phrase (Seed Words)');
        const choice = await askQuestion('Enter choice (1 or 2): ');

        let wallet: ethers.Wallet;

        if (choice === '2') {
            const mnemonic = await askQuestion('Enter Mnemonic Phrase: ');
            if (!ethers.utils.isValidMnemonic(mnemonic)) {
                console.error('Invalid Mnemonic Phrase');
                process.exit(1);
            }
            // Derive wallet from mnemonic (default path: m/44'/60'/0'/0/0)
            wallet = ethers.Wallet.fromMnemonic(mnemonic);
            console.log(`Derived Address: ${wallet.address}`);
        } else {
            let privateKey = process.env.PRIVATE_KEY;
            if (!privateKey) {
                privateKey = await askQuestion('Enter Private Key (or set in .env): ');
            } else {
                console.log('Using Private Key from .env');
            }

            if (!privateKey || !privateKey.startsWith('0x')) {
                console.error('Invalid Private Key. Must start with 0x');
                process.exit(1);
            }
            wallet = new ethers.Wallet(privateKey);
            console.log(`Address: ${wallet.address}`);
        }

        const password = await askQuestion('Enter Password to encrypt keystore: ');
        if (!password) {
            console.error('Password cannot be empty');
            process.exit(1);
        }

        const confirmPassword = await askQuestion('Confirm Password: ');
        if (password !== confirmPassword) {
            console.error('Passwords do not match');
            process.exit(1);
        }

        console.log('Encrypting... This may take a moment.');
        const json = await wallet.encrypt(password);

        const outputPath = path.join(process.cwd(), 'wallet.json');
        fs.writeFileSync(outputPath, json);

        console.log(`Keystore saved to: ${outputPath}`);
        console.log('You can now remove PRIVATE_KEY from your .env file.');

    } catch (error) {
        console.error('Error generating keystore:', error);
    } finally {
        rl.close();
    }
}

main();
