import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';
import { getRelaxationPage } from './relaxation';
import { getMemeViewerPage, getMemeChoicePage, getBreakLimitPage, getRandomMemes } from './memeViewer';
import { fetchAndDisplayVideos, registerUser } from './socialBreak';
import { getCommonStyles } from './utils';

let currentPanel: vscode.WebviewPanel | undefined;
let isBreakActive = false;
let workIntervalStart: number | null = null;
let lastActiveTime: number = Date.now();
let continuousWorkSeconds: number = 0;

export function activateBreakTime(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const intervalMinutes = config.get<number>('intervalMinutes', 10);
    const snoozeMinutes = config.get<number>('snoozeMinutes', 5);
    const interval = intervalMinutes * 60 * 1000; // Convert to milliseconds

    let breakTimer: NodeJS.Timeout | undefined;

    function startTimer() {
        if (isBreakActive) { return; }
        breakTimer = setInterval(() => {
            const username = os.userInfo().username.replace(/\s+/g, "");
            const auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);
            if (auraPoints < 0) {
                vscode.window.showInformationMessage('Cannot take a break: You have Negative Aura. Work to earn more!');
                return;
            }
            isBreakActive = true;
            vscode.window.showInformationMessage('Time for a mindful break!', 'Take Break', 'Snooze')
                .then(selection => {
                    isBreakActive = false;
                    if (selection === 'Take Break') {
                        if (currentPanel) { currentPanel.dispose(); }
                        showBreakWebview(context);
                    } else if (selection === 'Snooze') {
                        if (breakTimer) { clearInterval(breakTimer); }
                        setTimeout(startTimer, snoozeMinutes * 60 * 1000);
                    }
                });
        }, interval);
    }

    startTimer();

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('memeBreak.takeBreak', () => {
            takeBreakCommand(context);
        }),
        vscode.commands.registerCommand('memeBreak.skipActivity', () => {
            skipActivityCommand(context);
        }),
        vscode.commands.registerCommand('memeBreak.checkAuraPoints', () => {
            checkAuraPointsCommand(context);
        }),
        vscode.commands.registerCommand('memeBreak.addAuraPoints', () => {
            addAuraPointsCommand(context);
        })
    );

    // Activity tracking for Aura Points
    const activityTimer = setInterval(() => {
        const now = Date.now();
        const username = os.userInfo().username.replace(/\s+/g, "");
        if (isBreakActive) {
            workIntervalStart = null;
            continuousWorkSeconds = 0;
            return;
        }
        if (now - lastActiveTime > 120 * 1000) { // Inactive for >2 minutes
            workIntervalStart = null;
            continuousWorkSeconds = 0;
        } else {
            if (!workIntervalStart) {
                workIntervalStart = now;
            }
            continuousWorkSeconds = (now - workIntervalStart) / 1000;
            if (continuousWorkSeconds >= 600) { // 10 minutes of continuous work
                let auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);
                auraPoints += 100;
                context.globalState.update(`auraPoints_${username}`, auraPoints);
                workIntervalStart = now;
                continuousWorkSeconds = 0;
                vscode.window.showInformationMessage(`Earned 100 Aura Points! Total: ${auraPoints}`);
            }
        }
    }, 10 * 1000);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(() => {
            lastActiveTime = Date.now();
        }),
        vscode.window.onDidChangeActiveTextEditor(() => {
            lastActiveTime = Date.now();
        })
    );

    context.subscriptions.push({
        dispose: () => {
            if (breakTimer) { clearInterval(breakTimer); }
            if (activityTimer) { clearInterval(activityTimer); }
            isBreakActive = false;
            if (currentPanel) { currentPanel.dispose(); }
        }
    });
}

function takeBreakCommand(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");
    const auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);

    if (isBreakActive) {
        vscode.window.showInformationMessage('A break is already active. Please complete or close it first.');
        return;
    }

    if (auraPoints < 0) {
        vscode.window.showInformationMessage('Cannot take a break: Aura Points are negative. Work to earn more!');
        return;
    }

    isBreakActive = true;
    showBreakWebview(context).finally(() => {
        isBreakActive = false;
    });
}

function skipActivityCommand(context: vscode.ExtensionContext) {
    if (!currentPanel || !isBreakActive) {
        vscode.window.showInformationMessage('No active break to skip.');
        return;
    }

    const state: State | undefined = (currentPanel as any)._state;
    if (!state) {
        vscode.window.showInformationMessage('Error: Break state not found.');
        return;
    }

    const memesFolderPath = path.join(context.extensionPath, 'src', 'memes');
    let memeFiles: string[] = [];
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

    switch (state.mode) {
        case 'relaxation':
            switch (state.subMode) {
                case 'eyeIntro':
                    state.subMode = 'eyeTimer';
                    state.breakProgress = 1;
                    break;
                case 'eyeTimer':
                    state.subMode = 'waterBreak';
                    state.breakProgress = 2;
                    break;
                case 'waterBreak':
                    state.subMode = 'stretchBreak';
                    state.breakProgress = 3;
                    break;
                case 'stretchBreak':
                    state.mode = 'choice';
                    state.breakProgress = 4;
                    break;
            }
            renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
            vscode.window.showInformationMessage('Skipped current activity.');
            break;
        case 'memeViewer':
        case 'memeChoice':
        case 'socialBreak':
        case 'appreciate':
            state.mode = 'choice';
            renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
            vscode.window.showInformationMessage('Returned to choice page.');
            break;
        default:
            vscode.window.showInformationMessage('No activity to skip.');
    }
}

function checkAuraPointsCommand(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");
    const auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);
    vscode.window.showInformationMessage(`Your Aura Points: ${auraPoints}`);
}

function addAuraPointsCommand(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");
    let auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);
    auraPoints += 10000;
    context.globalState.update(`auraPoints_${username}`, auraPoints);
    vscode.window.showInformationMessage(`Added 10000 Aura Points! New total: ${auraPoints}`);
}

function deductAuraPoints(context: vscode.ExtensionContext, username: string, points: number) {
    let auraPoints = context.globalState.get<number>(`auraPoints_${username}`, 0);
    const isDeduction = points > 0;
    auraPoints -= points;
    context.globalState.update(`auraPoints_${username}`, auraPoints);
    if (auraPoints < 0) {
        vscode.window.showInformationMessage(`Aura Points are now negative (${auraPoints}). Work to earn more!`);
    }
    return auraPoints;
}

function deductBreakTimePoints(context: vscode.ExtensionContext, username: string, breakStartTime: number) {
    const breakDurationSeconds = (Date.now() - breakStartTime) / 1000;
    if (breakDurationSeconds > 300) { // After 5 minutes
        const extraMinutes = Math.floor((breakDurationSeconds - 300) / 600); // Every 10 minutes after 5
        if (extraMinutes > 0) {
            deductAuraPoints(context, username, extraMinutes * 100);
        }
    }
}

export interface State {
    mode: 'relaxation' | 'choice' | 'memeViewer' | 'socialBreak' | 'memeChoice' | 'appreciate';
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
    breakStartTime: number;
    memesViewed: number;
}

async function showBreakWebview(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const memeLimit = config.get<number>('memeLimit', 5);
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

    const usersList: string[] = context.globalState.get("usersList", []);
    if (!usersList.includes(username)) {
        const success = await registerUser(username);
        if (success) {
            usersList.push(username);
            await context.globalState.update("usersList", usersList);
            await context.globalState.update(`auraPoints_${username}`, 0);
        }
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
            const state: State = (currentPanel as any)._state;
            const auraPoints = context.globalState.get<number>(`auraPoints_${state.username}`, 0);
            const memeCost = config.get<number>('memeCost', 50);

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
                        const reward = Math.floor(amount / 25);
                        const updatedPoints = deductAuraPoints(context, state.username, -reward);
                        currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: updatedPoints });
                        currentPanel.webview.postMessage({ command: 'showReward', amount: reward });
                        setTimeout(() => {
                            state.subMode = 'stretchBreak';
                            state.breakProgress = 3;
                            if (currentPanel) {
                                renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                            }
                        }, 2000);
                    }
                    break;

                case 'finishStretch':
                    state.mode = 'choice';
                    state.breakProgress = 4;
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'startMemes':
                    if (auraPoints >= memeCost) {
                        const updatedPoints = deductAuraPoints(context, state.username, memeCost);
                        currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: updatedPoints });
                        currentPanel.webview.postMessage({ command: 'showDeduction', amount: memeCost });
                        state.mode = 'memeViewer';
                        state.selectedMemes = getRandomMemes(memesFolderPath, memeFiles, state.memeLimit);
                        state.currentIndex = 0;
                        state.memeRound = 1;
                        state.memesViewed += state.memeLimit;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else {
                        currentPanel.webview.postMessage({ command: 'showError', message: `Not enough Aura Points to view memes! Need ${memeCost} points.` });
                    }
                    break;

                case 'nextMeme':
                    if (state.currentIndex + 1 < state.selectedMemes.length) {
                        state.currentIndex++;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else if (state.memeRound === 1 && state.memesViewed < 10) {
                        state.mode = 'memeChoice';
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else {
                        currentPanel.webview.html = getBreakLimitPage(state, auraPoints);
                    }
                    break;

                case 'viewMoreMemes':
                    if (auraPoints >= memeCost && state.memesViewed < 10) {
                        const updatedPoints = deductAuraPoints(context, state.username, memeCost);
                        currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: updatedPoints });
                        currentPanel.webview.postMessage({ command: 'showDeduction', amount: memeCost });
                        state.mode = 'memeViewer';
                        state.selectedMemes = getRandomMemes(memesFolderPath, memeFiles, state.memeLimit);
                        state.currentIndex = 0;
                        state.memeRound = 2;
                        state.memesViewed += state.memeLimit;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    } else if (state.memesViewed >= 10) {
                        currentPanel.webview.html = getBreakLimitPage(state, auraPoints);
                    } else {
                        currentPanel.webview.postMessage({ command: 'showError', message: `Not enough Aura Points to view more memes! Need ${memeCost} points.` });
                    }
                    break;

                case 'closeMemes':
                case 'close':
                    state.mode = 'choice';
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'startSocialBreak':
                    state.mode = 'socialBreak';
                    state.gamePlayed = false;
                    await fetchAndDisplayVideos(currentPanel, state, context, username);
                    break;

                case 'startAppreciate':
                    state.mode = 'appreciate';
                    vscode.commands.executeCommand('extension.Appreciate');
                    state.mode = 'choice';
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;

                case 'playVideo':
                    state.watchedVideos.add(message.selectedId);
                    await context.globalState.update("watchedVideos", Array.from(state.watchedVideos));
                    break;

                case 'awardPoints':
                    const newPoints = deductAuraPoints(context, state.username, -message.amount);
                    currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: newPoints });
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
                    state.mode = 'choice';
                    renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    break;
            }
        });

        currentPanel.onDidDispose(() => {
            if (state) {
                deductBreakTimePoints(context, state.username, state.breakStartTime);
            }
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
        memeRound: 1,
        breakStartTime: Date.now(),
        memesViewed: 0
    };

    (currentPanel as any)._state = state;
    if (currentPanel) {
        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
    }
}

function renderPage(panel: vscode.WebviewPanel, state: State, context: vscode.ExtensionContext, memesFolderPath: string, memeFiles: string[]) {
    const auraPoints = context.globalState.get<number>(`auraPoints_${state.username}`, 0);
    switch (state.mode) {
        case 'relaxation':
            panel.webview.html = getRelaxationPage(state, auraPoints);
            break;
        case 'choice':
            panel.webview.html = getChoicePage(state, auraPoints);
            break;
        case 'memeViewer':
            panel.webview.html = getMemeViewerPage(state, auraPoints, panel, memesFolderPath);
            break;
        case 'memeChoice':
            panel.webview.html = getMemeChoicePage(state, auraPoints);
            break;
        case 'socialBreak':
            // Handled in fetchAndDisplayVideos
            break;
        case 'appreciate':
            panel.webview.html = getChoicePage(state, auraPoints);
            break;
    }
}

function getChoicePage(state: State, auraPoints: number): string {
    const memeCost = vscode.workspace.getConfiguration('memeBreak').get<number>('memeCost', 50);
    const viewMemesDisabled = state.memesViewed >= 10 ? 'disabled' : '';
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
                <p>Current Aura Points:<span class="aura-points-value"> ${auraPoints} points</span></p>
                <p>Choose an activity:</p>
                <div class="button-group">
                    <button class="primary" onclick="startMemes()" ${viewMemesDisabled}>View Memes (${memeCost} points)</button>
                    <button class="primary" onclick="startSocialBreak()">Social Break</button>
                    <button class="primary" onclick="startAppreciate()">Appreciate Your Friends</button>
                    <button onclick="closePanel()">Back to Work</button>
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
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
                function showFloatingDeduction(amount) {
                    const emoji = '💸';
                    const deductionEl = document.createElement('div');
                    deductionEl.textContent = \`- \${amount} Aura \${emoji}\`;
                    deductionEl.className = 'floating-deduction';
                    document.body.appendChild(deductionEl);
                    setTimeout(() => { deductionEl.remove(); }, 2000);
                }
                function startMemes() { vscode.postMessage({ command: 'startMemes' }); }
                function startSocialBreak() { vscode.postMessage({ command: 'startSocialBreak' }); }
                function startAppreciate() { vscode.postMessage({ command: 'startAppreciate' }); }
                function closePanel() { vscode.postMessage({ command: 'close' }); }
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

export function deactivate() {}