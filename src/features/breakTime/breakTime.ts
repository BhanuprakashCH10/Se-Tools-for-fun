import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';
import { getRelaxationPage } from './relaxation';
import { getMemeViewerPage, getMemeChoicePage, getBreakLimitPage, getRandomMemes } from './memeViewer';
import { fetchAndDisplayVideos } from './socialBreak';
import { getCommonStyles } from './utils';

let currentPanel: vscode.WebviewPanel | undefined;

export function activateBreakTime(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const intervalMinutes = config.get<number>('intervalMinutes', 10);
    const snoozeMinutes = config.get<number>('snoozeMinutes', 5);
    const memeLimit = config.get<number>('memeLimit', 5);
    const interval = intervalMinutes * 1000;

    let breakTimer: NodeJS.Timeout | undefined;
    let isBreakActive = false;

    const initialMoney = context.globalState.get<number>('money', 100);
    if (initialMoney === 0) {
        context.globalState.update('money', 100);
    }

    function startTimer() {
        if (isBreakActive) { return; }
        breakTimer = setInterval(() => {
            isBreakActive = true;
            vscode.window.showInformationMessage('Time for a mindful break!', 'Take Break', 'Snooze')
                .then(selection => {
                    isBreakActive = false;
                    if (selection === 'Take Break') {
                        if (currentPanel) { currentPanel.dispose(); }
                        showBreakWebview(context, memeLimit);
                    } else if (selection === 'Snooze') {
                        if (breakTimer) { clearInterval(breakTimer); }
                        setTimeout(startTimer, snoozeMinutes * 1000);
                    }
                });
        }, interval);
    }

    startTimer();

    context.subscriptions.push({
        dispose: () => {
            if (breakTimer) { clearInterval(breakTimer); }
            isBreakActive = false;
            if (currentPanel) { currentPanel.dispose(); }
        }
    });
}

export interface State {
    mode: 'relaxation' | 'choice' | 'memeViewer' | 'socialBreak' | 'memeChoice';
    subMode?: 'eyeIntro' | 'eyeTimer' | 'waterBreak' | 'stretchBreak';
    memeLimit: number;
    currentIndex: number;
    selectedMemes: vscode.Uri[];
    breakProgress: number;
    totalSteps: number;
    username: string;
    watchedVideos: Set<string>;
    gamePlayed: boolean;
    memeRound: number;
}

async function showBreakWebview(context: vscode.ExtensionContext, memeLimit: number) {
    const memesFolderPath = path.join(context.extensionPath, 'src', 'memes');
    let memeFiles: string[] = [];
    const username = os.userInfo().username.replace(/\s+/g, "");

    try {
        memeFiles = fs.readdirSync(memesFolderPath).filter(file => {
            const ext = path.extname(file).toLowerCase();
            const fullPath = path.join(memesFolderPath, file);
            return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext) && fs.statSync(fullPath).isFile();
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load memes folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
    }

    if (memeFiles.length === 0) {
        vscode.window.showInformationMessage('No memes found in src/memes.');
        return;
    }

    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            'mindfulBreak',
            'Mindful Break',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(memesFolderPath)]
            }
        );

        currentPanel.webview.onDidReceiveMessage(async message => {
            if (!currentPanel) { return; }
            const currentMoney = context.globalState.get<number>('money', 0);
            const setCost = 50;

            switch (message.command) {
                case 'startEyeTimer':
                    state.subMode = 'eyeTimer';
                    state.breakProgress = 1;
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'nextAfterEyeTimer':
                    state.subMode = 'waterBreak';
                    state.breakProgress = 2;
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'submitWater':
                    const amount = parseInt(message.amount);
                    if (isNaN(amount) || amount < 250) {
                        currentPanel.webview.postMessage({ command: 'showError', message: 'Minimum 250 ml required!' });
                    } else {
                        const reward = Math.floor(amount / 25); // 10 units for every 250 ml
                        const updatedMoney = currentMoney + reward;
                        await context.globalState.update('money', updatedMoney);
                        currentPanel.webview.postMessage({ command: 'updateMoney', amount: updatedMoney });
                        // Show reward immediately
                        currentPanel.webview.postMessage({ command: 'showReward', amount: reward });
                        // Transition after 2 seconds (animation duration)
                        setTimeout(() => {
                            state.subMode = 'stretchBreak';
                            state.breakProgress = 3;
                            if(currentPanel) {
                            renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                            }
                        }, 2000);
                    }
                    break;
                case 'skipWater':
                    state.subMode = 'stretchBreak';
                    state.breakProgress = 3;
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;
                case 'finishStretch':
                    state.mode = 'choice';
                    state.breakProgress = 4;
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'startMemes':
                    if (currentMoney >= setCost) {
                        await context.globalState.update('money', currentMoney - setCost);
                        state.mode = 'memeViewer';
                        state.selectedMemes = getRandomMemes(memesFolderPath, memeFiles, state.memeLimit);
                        state.currentIndex = 0;
                        state.memeRound = 1;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else {
                        currentPanel.webview.postMessage({ command: 'showError', message: 'Not enough money to view memes! Need 50 units.' });
                    }
                    break;

                case 'nextMeme':
                    if (state.currentIndex + 1 < state.selectedMemes.length) {
                        state.currentIndex++;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else if (state.memeRound === 1) {
                        state.mode = 'memeChoice';
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else {
                        currentPanel.webview.html = getBreakLimitPage(state, currentMoney);
                    }
                    break;

                case 'viewMoreMemes':
                    if (currentMoney >= setCost) {
                        await context.globalState.update('money', currentMoney - setCost);
                        state.mode = 'memeViewer';
                        state.selectedMemes = getRandomMemes(memesFolderPath, memeFiles, state.memeLimit);
                        state.currentIndex = 0;
                        state.memeRound = 2;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else {
                        currentPanel.webview.postMessage({ command: 'showError', message: 'Not enough money to view more memes! Need 50 units.' });
                    }
                    break;

                case 'closeMemes':
                    currentPanel.dispose();
                    break;

                case 'startSocialBreak':
                    state.mode = 'socialBreak';
                    state.gamePlayed = false;
                    await fetchAndDisplayVideos(currentPanel, state, context, username);
                    break;

                case 'playVideo':
                    state.watchedVideos.add(message.selectedId);
                    await context.globalState.update("watchedVideos", Array.from(state.watchedVideos));
                    break;

                case 'awardMoney':
                    const newMoney = currentMoney + message.amount;
                    await context.globalState.update('money', newMoney);
                    currentPanel.webview.postMessage({ command: 'updateMoney', amount: newMoney });
                    setTimeout(() => {
                        currentPanel?.webview.postMessage({ command: 'showReward', amount: message.amount });
                    }, 1000);
                    break;

                case 'refreshVideos':
                    await fetchAndDisplayVideos(currentPanel, state, context, username);
                    break;

                case 'noSelection':
                    vscode.window.showInformationMessage("Please select a Video to Play");
                    break;

                case 'emptySendToUser':
                    vscode.window.showInformationMessage("Please select a user to send message.");
                    break;

                case 'emptyMessage':
                    vscode.window.showInformationMessage("Please enter a message to Send.");
                    break;

                case 'reset':
                    if (currentPanel) { currentPanel.reveal(vscode.ViewColumn.One); }
                    else{ currentPanel = vscode.window.createWebviewPanel( 'mindfulBreak', 'Mindful Break', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(memesFolderPath)] } ); }
                    if (currentPanel) { await fetchAndDisplayVideos(currentPanel, state, context, username); }
                    break;

                case 'close':
                    currentPanel.dispose();
                    break;
            }
        });

        currentPanel.onDidDispose(() => {
            currentPanel = undefined;
        }, null, context.subscriptions);
    }

    const state: State = {
        mode: 'relaxation',
        subMode: 'eyeIntro',
        memeLimit,
        currentIndex: 0,
        selectedMemes: [],
        breakProgress: 0,
        totalSteps: 4,
        username,
        watchedVideos: new Set(context.globalState.get<string[]>("watchedVideos", [])),
        gamePlayed: false,
        memeRound: 1
    };

    if (currentPanel) {
        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
    }
}

function renderPage(panel: vscode.WebviewPanel, state: State, context: vscode.ExtensionContext, memesFolderPath: string, memeFiles: string[]) {
    const currentMoney = context.globalState.get<number>('money', 0);
    switch (state.mode) {
        case 'relaxation':
            panel.webview.html = getRelaxationPage(state);
            break;
        case 'choice':
            panel.webview.html = getChoicePage(state, currentMoney);
            break;
        case 'memeViewer':
            panel.webview.html = getMemeViewerPage(state, currentMoney, panel, memesFolderPath);
            break;
        case 'memeChoice':
            panel.webview.html = getMemeChoicePage(state, currentMoney);
            break;
        case 'socialBreak':
            // Handled in fetchAndDisplayVideos
            break;
    }
}

function getChoicePage(state: State, currentMoney: number): string {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}
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
            animation: floatUpFade 2s ease-out forwards;
        }
        @keyframes floatUpFade {
            0% { opacity: 1; top: 60px; }
            80% { opacity: 1; }
            100% { opacity: 0; top: 10px; }
        }
        </style></head>
        <body>
            <div class="container">
                <h1>🎉 Break Complete!</h1>
                <p>Current Money:<span class="money-value"> ${currentMoney} units</span></p>
                <p>Choose an activity:</p>
                <div class="button-group">
                    <button class="primary" onclick="startMemes()">View Memes (50 units)</button>
                    <button class="primary" onclick="startSocialBreak()">Social Break</button>
                    <button onclick="closePanel()">Back to Work</button>
                </div>
                <p id="error" class="error-message"></p>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                function showFloatingReward(amount) {
                    const emoji = '💰';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${amount} units \${emoji} \`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
                
                function startMemes() { vscode.postMessage({ command: 'startMemes' }); }
                function startSocialBreak() { vscode.postMessage({ command: 'startSocialBreak' }); }
                function closePanel() { vscode.postMessage({ command: 'close' }); }
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.command === 'updateMoney') {
                        document.querySelectorAll('.money-value').forEach(el => {
                            el.textContent = message.amount + ' units';
                        });
                    }
                    if (message.command === 'showReward') {
                        showFloatingReward(message.amount);
                        
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

export function deactivate() {}