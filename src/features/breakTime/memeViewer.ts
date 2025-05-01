import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { getCommonStyles } from './utils';
import { State } from './breakTime';

const MEME_DIR = path.join(process.cwd(), 'memeBreakMemes');

export async function getRandomMemes(count: number): Promise<vscode.Uri[]> {
    try {
        if (fs.existsSync(MEME_DIR)) {
            fs.rmSync(MEME_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(MEME_DIR);
        vscode.window.showInformationMessage(`Using meme directory: ${MEME_DIR}`);

        try {
            fs.accessSync(MEME_DIR, fs.constants.W_OK);
        } catch (error) {
            vscode.window.showErrorMessage(`Meme directory not writable: ${MEME_DIR}, Error: ${error}`);
            return [];
        }

        const response = await axios.get('https://meme-api.com/gimme/10');
        const memes = response.data.memes || [];

        if (memes.length === 0) {
            vscode.window.showErrorMessage('No memes fetched from API.');
            return [];
        }

        const results: vscode.Uri[] = [];
        for (let i = 0; i < Math.min(count, memes.length); i++) {
            const meme = memes[i];
            const url = meme.url;
            const ext = url.split('.').pop()?.toLowerCase() || 'jpg';
            const filePath = path.join(MEME_DIR, `meme${i}.${ext}`);

            try {
                const imageResponse = await axios.get(url, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(imageResponse.data);
                fs.writeFileSync(filePath, buffer);

                if (fs.existsSync(filePath)) {
                    try {
                        fs.accessSync(filePath, fs.constants.R_OK);
                        const uri = vscode.Uri.file(filePath);
                        results.push(uri);
                        vscode.window.showInformationMessage(`Saved meme: ${filePath}`);
                    } catch (error) {
                        vscode.window.showWarningMessage(`File not readable: ${filePath}, Error: ${error}`);
                    }
                } else {
                    vscode.window.showWarningMessage(`Failed to save meme: ${filePath}`);
                }
            } catch (error) {
                vscode.window.showWarningMessage(`Failed to download meme ${i}: ${error}`);
            }
        }

        vscode.window.showInformationMessage(`Downloaded ${results.length} memes to ${MEME_DIR}`);
        return results;
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to fetch memes: ${message}`);
        return [];
    }
}

export function cleanupMemes() {
    if (fs.existsSync(MEME_DIR)) {
        fs.rmSync(MEME_DIR, { recursive: true, force: true });
        vscode.window.showInformationMessage(`Deleted meme directory: ${MEME_DIR}`);
    }
}

export function getMemeLoadingPage(): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                ${getCommonStyles()}
                .loading-container {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    text-align: center;
                }
                .loading-text {
                    font-size: 1.5em;
                    color: #333;
                    margin-bottom: 20px;
                }
                .spinner {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #3498db;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="loading-container">
                <div class="loading-text">Finding the best memes for you...</div>
                <div class="spinner"></div>
            </div>
        </body>
        </html>
    `;
}

export function getMemeViewerPage(state: State, auraPoints: number, panel: vscode.WebviewPanel): string {
    const memeUri = state.selectedMemes[state.currentIndex] || vscode.Uri.parse('https://via.placeholder.com/400x300?text=No+Meme+Available');
    const webviewUri = panel.webview.asWebviewUri(memeUri).toString();
    const isLastMeme = state.currentIndex + 1 === state.selectedMemes.length;
    const nextButtonDisabled = isLastMeme ? 'disabled' : '';

    console.log(`Meme index: ${state.currentIndex}, File URI: ${memeUri.toString()}, Webview URI: ${webviewUri}`);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: https: vscode-webview-resource:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
            <style>
                ${getCommonStyles()}
                .floating-reward {
                    position: fixed;
                    left: 50%;
                    top: 60px;
                    transform: translateX(-50%);
                    font-size: 2em;
                    color: #4caf50;
                    font-weight: bold;
                    opacity: 1;
                    pointer-events: none;
                    z-index: 9999;
                    animation: floatUpFade 4s ease-out forwards;
                }
                .floating-deduction {
                    position: fixed;
                    left: 50%;
                    top: 60px;
                    transform: translateX(-50%);
                    font-size: 2em;
                    color: #ff0000;
                    font-weight: bold;
                    opacity: 1;
                    pointer-events: none;
                    z-index: 9999;
                    animation: floatUpFade 4s ease-out forwards;
                }
                @keyframes floatUpFade {
                    0% { opacity: 1; top: 60px; }
                    80% { opacity: 1; }
                    100% { opacity: 0; top: 10px; }
                }
                .meme-container {
                    display: flex;
                    justify-content: center;
                    width: 100%;
                }
                img {
                    max-width: 100%;
                    max-height: 70vh;
                    object-fit: contain;
                    display: none;
                }
                img.loaded {
                    display: block;
                }
                .loading {
                    font-size: 1.2em;
                    color: #888;
                    text-align: center;
                    margin: 20px 0;
                }
                .error-message {
                    color: #ff0000;
                    text-align: center;
                    margin: 10px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>😂 Meme Break</h1>
                <p>Current Aura Points: <span class="aura-points-value">${auraPoints} points</span></p>
                <p>Meme ${state.currentIndex + 1} of 5</p>
                <div class="loading" id="loading">Loading meme...</div>
                <div class="meme-container">
                    <img src="${webviewUri}" alt="Meme" onload="onImageLoad()" onerror="onImageError()">
                </div>
                <div class="button-group">
                    <button class="primary" onclick="nextMeme()" ${nextButtonDisabled}>Next Meme</button>
                    <button onclick="closePanel()">Close</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function onImageLoad() {
                    console.log('Image loaded successfully: ${webviewUri}');
                    document.getElementById('loading').style.display = 'none';
                    document.querySelector('img').classList.add('loaded');
                }
                function onImageError() {
                    console.error('Failed to load image: ${webviewUri}');
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('error').textContent = 'Failed to load meme.';
                    document.getElementById('error').style.display = 'block';
                    document.querySelector('img').src = 'https://via.placeholder.com/400x300?text=Failed+to+Load+Meme';
                    document.querySelector('img').classList.add('loaded');
                }
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} Aura \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => rewardEl.remove(), 4000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} Aura \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => deductionEl.remove(), 4000);
                }
                function nextMeme() { vscode.postMessage({ command: 'nextMeme' }); }
                function closePanel() { vscode.postMessage({ command: 'closeMemes' }); }
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateAuraPoints') {
                        document.querySelectorAll('.aura-points-value').forEach(el => {
                            el.textContent = message.amount + ' points';
                        });
                    }
                    if (message.command === 'showReward') {
                        showFloatingReward(message.amount);
                    }
                    if (message.command === 'showDeduction') {
                        showFloatingDeduction(message.amount);
                    }
                    if (message.command === 'showError') {
                        const errorEl = document.getElementById('error');
                        errorEl.textContent = message.message;
                        errorEl.style.display = 'block';
                        setTimeout(() => errorEl.style.display = 'none', 3000);
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export function getMemeChoicePage(state: State, auraPoints: number): string {
    const memeCost = vscode.workspace.getConfiguration('memeBreak').get<number>('memeCost', 100);
    const viewMoreDisabled = state.memesViewed >= 5 || auraPoints < memeCost ? 'disabled' : '';

    console.log(`Rendering memeChoice: memesViewed=${state.memesViewed}, auraPoints=${auraPoints}, viewMoreDisabled=${viewMoreDisabled}`);

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                ${getCommonStyles()}
                .floating-reward, .floating-deduction {
                    position: fixed;
                    left: 50%;
                    top: 60px;
                    transform: translateX(-50%);
                    font-size: 2em;
                    font-weight: bold;
                    opacity: 1;
                    pointer-events: none;
                    z-index: 9999;
                    animation: floatUpFade 4s ease-out forwards;
                }
                .floating-reward { color: #4caf50; }
                .floating-deduction { color: #ff0000; }
                @keyframes floatUpFade {
                    0% { opacity: 1; top: 60px; }
                    80% { opacity: 1; }
                    100% { opacity: 0; top: 10px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>😂 More Memes?</h1>
                <p>Current Aura Points: <span class="aura-points-value">${auraPoints} points</span></p>
                <p>You've viewed 5 of 10 memes this break.</p>
                <div class="button-group">
                    <button class="primary" onclick="viewMoreMemes()" ${viewMoreDisabled}>View 5 More Memes (${memeCost} points)</button>
                    <button onclick="closePanel()">Close</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                console.log('Meme choice page loaded');
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} Aura \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => rewardEl.remove(), 4000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} Aura \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => deductionEl.remove(), 4000);
                }
                function viewMoreMemes() { vscode.postMessage({ command: 'viewMoreMemes' }); }
                function closePanel() { vscode.postMessage({ command: 'closeMemes' }); }
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateAuraPoints') {
                        document.querySelectorAll('.aura-points-value').forEach(el => {
                            el.textContent = message.amount + ' points';
                        });
                    }
                    if (message.command === 'showReward') {
                        showFloatingReward(message.amount);
                    }
                    if (message.command === 'showDeduction') {
                        showFloatingDeduction(message.amount);
                    }
                    if (message.command === 'showError') {
                        const errorEl = document.getElementById('error');
                        errorEl.textContent = message.message;
                        errorEl.style.display = 'block';
                        setTimeout(() => errorEl.style.display = 'none', 3000);
                    }
                });
            </script>
        </body>
        </html>
    `;
}

export function getBreakLimitPage(state: State, auraPoints: number): string {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                ${getCommonStyles()}
                .floating-reward, .floating-deduction {
                    position: fixed;
                    left: 50%;
                    top: 60px;
                    transform: translateX(-50%);
                    font-size: 2em;
                    font-weight: bold;
                    opacity: 1;
                    pointer-events: none;
                    z-index: 9999;
                    animation: floatUpFade 4s ease-out forwards;
                }
                .floating-reward { color: #4caf50; }
                .floating-deduction { color: #ff0000; }
                @keyframes floatUpFade {
                    0% { opacity: 1; top: 60px; }
                    80% { opacity: 1; }
                    100% { opacity: 0; top: 10px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚫 Meme Limit Reached</h1>
                <p>Current Aura Points: <span class="aura-points-value">${auraPoints} points</span></p>
                <p>You've used up your meme quota for this break!</p>
                <p>Great break! Get back to work to earn more Aura Points!</p>
                <div class="button-group">
                    <button onclick="closePanel()">Close</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} Aura \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => rewardEl.remove(), 4000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} Aura \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => deductionEl.remove(), 4000);
                }
                function closePanel() { vscode.postMessage({ command: 'closeMemes' }); }
                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateAuraPoints') {
                        document.querySelectorAll('.aura-points-value').forEach(el => {
                            el.textContent = message.amount + ' points';
                        });
                    }
                    if (message.command === 'showReward') {
                        showFloatingReward(message.amount);
                    }
                    if (message.command === 'showDeduction') {
                        showFloatingDeduction(message.amount);
                    }
                    if (message.command === 'showError') {
                        const errorEl = document.getElementById('error');
                        errorEl.textContent = message.message;
                        errorEl.style.display = 'block';
                        setTimeout(() => errorEl.style.display = 'none', 3000);
                    }
                });
            </script>
        </body>
        </html>
    `;
}