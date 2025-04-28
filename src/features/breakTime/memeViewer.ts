import * as vscode from 'vscode';
import * as path from 'path';
import { State } from './breakTime';
import { getCommonStyles } from './utils';

export function getRandomMemes(folderPath: string, memeFiles: string[], count: number): vscode.Uri[] {
    const shuffled = [...memeFiles].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(file => vscode.Uri.file(path.join(folderPath, file)));
}

export function getMemeViewerPage(state: State, currentMoney: number, panel: vscode.WebviewPanel, memesFolderPath: string): string {
    const memeUri = panel.webview.asWebviewUri(state.selectedMemes[state.currentIndex]);
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
        <body>
            <div class="container meme-container">
                <div class="progress">Meme ${state.currentIndex + 1} of ${state.selectedMemes.length} | Money: ${currentMoney} units</div>
                <img src="${memeUri}" class="meme-image"/>
                <div class="button-group">
                    <button class="primary" onclick="nextMeme()">Next Meme</button>
                    <button onclick="closePanel()">Close</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function nextMeme() { vscode.postMessage({ command: 'nextMeme' }); }
                function closePanel() { vscode.postMessage({ command: 'close' }); }
            </script>
        </body>
        </html>
    `;
}

export function getMemeChoicePage(state: State, currentMoney: number): string {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
        <body>
            <div class="container">
                <h1>🎉 Meme Break is Done!</h1>
                <p>Current Money:<span class="money-value"> ${currentMoney} units</span></p>
                <p>You've viewed ${state.memeLimit} memes. What would you like to do?</p>
                <div class="button-group">
                    ${state.memeRound === 1 ? '<button class="primary" onclick="viewMoreMemes()">5 More Memes (50 units)</button>' : ''}
                    <button class="primary" onclick="closeMemes()">Close</button>
                </div>
                ${state.memeRound === 2 ? '<p>You had enough! Time to get back to work!</p>' : ''}
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function viewMoreMemes() { vscode.postMessage({ command: 'viewMoreMemes' }); }
                function closeMemes() { vscode.postMessage({ command: 'closeMemes' }); }
                window.addEventListener('message', event => {
                    const message = event.data;
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

export function getBreakLimitPage(state: State, currentMoney: number): string {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
        <body>
            <div class="container">
                <h1>⏰ Break Over</h1>
                <p>Current Money:<span class="money-value"> ${currentMoney} units</span></p>
                <p>You've viewed ${state.memeLimit * (state.memeRound === 2 ? 2 : 1)} memes. That's enough</p>
                <button onclick="closePanel()">Get Back To Work</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function closePanel() { vscode.postMessage({ command: 'close' }); }
            </script>
        </body>
        </html>
    `;
}