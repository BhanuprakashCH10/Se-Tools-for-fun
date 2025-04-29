import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCommonStyles } from './utils';
import { State } from './breakTime';

export function getRandomMemes(memesFolderPath: string, memeFiles: string[], count: number): vscode.Uri[] {
    const shuffled = memeFiles.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length)).map(file => vscode.Uri.file(path.join(memesFolderPath, file)));
}

export function getMemeViewerPage(state: State, auraPoints: number, panel: vscode.WebviewPanel, memesFolderPath: string): string {
    const memeUri = panel.webview.asWebviewUri(state.selectedMemes[state.currentIndex]);
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}
        .floating-reward { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #4caf50; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        .floating-deduction { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #ff0000; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        @keyframes floatUpFade { 0% { opacity: 1; top: 60px; } 80% { opacity: 1; } 100% { opacity: 0; top: 10px; } }
        img { max-width: 100%; max-height: 70vh; object-fit: contain; }
        </style></head>
        <body>
            <div class="container">
                <h1>😂 Meme Break</h1>
                <p>Current Aura Points:<span class="aura-points-value"> ${auraPoints} points</span></p>
                <img src="${memeUri}" alt="Meme"/>
                <div class="button-group">
                    <button class="primary" onclick="nextMeme()">Next Meme</button>
                    <button onclick="closePanel()">Close</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} points \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} points \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => { deductionEl.remove(); }, 2000);
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
    const memeCost = vscode.workspace.getConfiguration('memeBreak').get<number>('memeCost', 50);
    const viewMoreDisabled = state.memesViewed >= 10 ? 'disabled' : '';
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}
        .floating-reward { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #4caf50; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        .floating-deduction { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #ff0000; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        @keyframes floatUpFade { 0% { opacity: 1; top: 60px; } 80% { opacity: 1; } 100% { opacity: 0; top: 10px; } }
        </style></head>
        <body>
            <div class="container">
                <h1>😄 More Memes?</h1>
                <p>Current Aura Points:<span class="aura-points-value"> ${auraPoints} points</span></p>
                <div class="button-group">
                    <button class="primary" onclick="viewMoreMemes()" ${viewMoreDisabled}>View More Memes (${memeCost} points)</button>
                    <button onclick="closePanel()">Close</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} points \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} points \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => { deductionEl.remove(); }, 2000);
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
        <head><meta charset="UTF-8"><style>${getCommonStyles()}
        .floating-reward { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #4caf50; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        .floating-deduction { position: fixed; left: 50%; top: 60px; transform: translateX(-50%); font-size: 2em; color: #ff0000; font-weight: bold; opacity: 1; pointer-events: none; z-index: 9999; animation: floatUpFade 2s ease-out forwards; }
        @keyframes floatUpFade { 0% { opacity: 1; top: 60px; } 80% { opacity: 1; } 100% { opacity: 0; top: 10px; } }
        </style></head>
        <body>
            <div class="container">
                <h1>🚫 Meme Limit Reached</h1>
                <p>Current Aura Points:<span class="aura-points-value"> ${auraPoints} points</span></p>
                <p>You've reached the meme limit for this break!</p>
                <button onclick="closePanel()">Close</button>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function showFloatingReward(amount) {
                    const emoji = '✨';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} points \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} points \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => { deductionEl.remove(); }, 2000);
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