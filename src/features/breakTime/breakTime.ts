import * as vscode from 'vscode';
import os from 'os';
import * as path from 'path';
import { getRelaxationPage } from './relaxation';
import { getMemeViewerPage, getMemeChoicePage, getBreakLimitPage, getRandomMemes, cleanupMemes, getMemeLoadingPage } from './memeViewer';
import { fetchAndDisplayVideos, registerUser } from './socialBreak';
import { getCommonStyles } from './utils';

let currentPanel: vscode.WebviewPanel | undefined;
let isBreakActive = false;
let workIntervalStart: number | null = null;
let lastActiveTime: number = Date.now();
let continuousWorkSeconds: number = 0;

const MEME_DIR = path.join(process.cwd(), 'memeBreakMemes');

export function activateBreakTime(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const intervalMinutes = config.get<number>('intervalMinutes', 10);
    const snoozeMinutes = config.get<number>('snoozeMinutes', 5);
    const interval = intervalMinutes * 60 * 1000;

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

    const activityTimer = setInterval(() => {
        const now = Date.now();
        const username = os.userInfo().username.replace(/\s+/g, "");
        if (isBreakActive) {
            workIntervalStart = null;
            continuousWorkSeconds = 0;
            return;
        }
        if (now - lastActiveTime > 120 * 1000) {
            workIntervalStart = null;
            continuousWorkSeconds = 0;
        } else {
            if (!workIntervalStart) {
                workIntervalStart = now;
            }
            continuousWorkSeconds = (now - workIntervalStart) / 1000;
            if (continuousWorkSeconds >= 600) {
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

async function skipActivityCommand(context: vscode.ExtensionContext) {
    if (!currentPanel || !isBreakActive) {
        vscode.window.showInformationMessage('No active break to skip.');
        return;
    }

    const state: State | undefined = (currentPanel as any)._state;
    if (!state) {
        vscode.window.showInformationMessage('Error: Break state not found.');
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
                    state.subMode = undefined;
                    state.breakProgress = 4;
                    break;
            }
            break;
        case 'memeViewer':
        case 'memeChoice':
        case 'socialBreak':
        case 'appreciate':
            state.mode = 'choice';
            state.subMode = undefined;
            break;
        default:
            vscode.window.showInformationMessage('No activity to skip.');
            return;
    }

    await renderPage(currentPanel, state, context);
    vscode.window.showInformationMessage('Skipped current activity.');
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
    auraPoints -= points;
    context.globalState.update(`auraPoints_${username}`, auraPoints);
    if (auraPoints < 0) {
        vscode.window.showInformationMessage(`Aura Points are now negative (${auraPoints}). Work to earn more!`);
    }
    return auraPoints;
}

function deductBreakTimePoints(context: vscode.ExtensionContext, username: string, breakStartTime: number) {
    const breakDurationSeconds = (Date.now() - breakStartTime) / 1000;
    if (breakDurationSeconds > 300) {
        const extraMinutes = Math.floor((breakDurationSeconds - 300) / 600);
        if (extraMinutes > 0) {
            deductAuraPoints(context, username, extraMinutes * 100);
        }
    }
}

export interface State {
    mode: 'relaxation' | 'choice' | 'memeViewer' | 'socialBreak' | 'memeChoice' | 'appreciate' | 'breakLimit';
    subMode?: 'eyeIntro' | 'eyeTimer' | 'waterBreak' | 'stretchBreak';
    memeLimit: number;
    currentIndex: number;
    selectedMemes: vscode.Uri[];
    allMemes: vscode.Uri[];
    breakProgress: number;
    totalSteps: number;
    username: string;
    watchedVideos: Set<string>;
    gamePlayed: boolean;
    memeRound: number;
    breakStartTime: number;
    memesViewed: number;
    hasViewedMemes: boolean;
}

async function showBreakWebview(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const memeLimit = config.get<number>('memeLimit', 5);
    const username = os.userInfo().username.replace(/\s+/g, "");

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
                localResourceRoots: [vscode.Uri.file(MEME_DIR)]
            }
        );

        currentPanel.webview.onDidReceiveMessage(async message => {
            if (!currentPanel) { return; }
            const state: State = (currentPanel as any)._state;
            const auraPoints = context.globalState.get<number>(`auraPoints_${state.username}`, 0);
            const memeCost = config.get<number>('memeCost', 100);

            switch (message.command) {
                case 'startEyeTimer':
                    state.subMode = 'eyeTimer';
                    state.breakProgress = 1;
                    await renderPage(currentPanel, state, context);
                    break;

                case 'nextAfterEyeTimer':
                    state.subMode = 'waterBreak';
                    state.breakProgress = 2;
                    await renderPage(currentPanel, state, context);
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
                        setTimeout(async () => {
                            state.subMode = 'stretchBreak';
                            state.breakProgress = 3;
                            if (currentPanel) {
                                await renderPage(currentPanel, state, context);
                            }
                        }, 2000);
                    }
                    break;

                case 'finishStretch':
                    state.mode = 'choice';
                    state.breakProgress = 4;
                    await renderPage(currentPanel, state, context);
                    break;

                case 'startMemes':
                    if (state.hasViewedMemes) {
                        currentPanel.webview.postMessage({ command: 'showError', message: "C'mon, you just watched memes. No more memes until next break!" });
                        return;
                    }
                    try {
                        if (auraPoints >= memeCost) {
                            const updatedPoints = deductAuraPoints(context, state.username, memeCost);
                            currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: updatedPoints });
                            currentPanel.webview.postMessage({ command: 'showDeduction', amount: memeCost });
                            state.mode = 'memeViewer';
                            state.hasViewedMemes = true;
                            currentPanel.webview.html = getMemeLoadingPage();
                            if (!state.allMemes || state.allMemes.length === 0) {
                                state.allMemes = await getRandomMemes(10);
                            }
                            state.selectedMemes = state.allMemes.slice(0, 5);
                            state.currentIndex = 0;
                            state.memeRound = 1;
                            state.memesViewed = 0;
                            console.log(`Starting memes: round=${state.memeRound}, memesViewed=${state.memesViewed}, selectedMemes=${state.selectedMemes.length}`);
                            if (state.selectedMemes.length === 0) {
                                currentPanel.webview.postMessage({ command: 'showError', message: 'No memes available.' });
                                state.mode = 'choice';
                                await renderPage(currentPanel, state, context);
                            } else {
                                await renderPage(currentPanel, state, context);
                            }
                        } else {
                            currentPanel.webview.postMessage({ command: 'showError', message: `Not enough Aura Points! Need ${memeCost} points.` });
                        }
                    } catch (error) {
                        currentPanel.webview.postMessage({ command: 'showError', message: 'Failed to start meme viewer.' });
                        state.mode = 'choice';
                        await renderPage(currentPanel, state, context);
                    }
                    break;

                case 'nextMeme':
                    state.memesViewed += 1;
                    console.log(`Next meme: currentIndex=${state.currentIndex}, memesViewed=${state.memesViewed}, memeRound=${state.memeRound}, selectedMemes=${state.selectedMemes.length}`);
                    if (state.currentIndex + 1 < state.selectedMemes.length) {
                        state.currentIndex += 1;
                        await renderPage(currentPanel, state, context);
                    } else if (state.memeRound === 1 && state.memesViewed >= 5) {
                        console.log('Transitioning to memeChoice');
                        state.mode = 'memeChoice';
                        await renderPage(currentPanel, state, context);
                    } else {
                        console.log('Transitioning to breakLimit');
                        state.mode = 'breakLimit';
                        currentPanel.webview.html = getBreakLimitPage(state, auraPoints);
                    }
                    break;

                case 'viewMoreMemes':
                    console.log(`View more memes: memesViewed=${state.memesViewed}, auraPoints=${auraPoints}`);
                    try {
                        if (auraPoints >= memeCost && state.memesViewed < 10) {
                            const updatedPoints = deductAuraPoints(context, state.username, memeCost);
                            currentPanel.webview.postMessage({ command: 'updateAuraPoints', amount: updatedPoints });
                            currentPanel.webview.postMessage({ command: 'showDeduction', amount: memeCost });
                            state.mode = 'memeViewer';
                            currentPanel.webview.html = getMemeLoadingPage();
                            state.selectedMemes = state.allMemes.slice(5, 10);
                            state.currentIndex = 0;
                            state.memeRound = 2;
                            console.log(`Loading more memes: round=${state.memeRound}, selectedMemes=${state.selectedMemes.length}`);
                            if (state.selectedMemes.length === 0) {
                                currentPanel.webview.postMessage({ command: 'showError', message: 'No more memes available.' });
                                state.mode = 'choice';
                                await renderPage(currentPanel, state, context);
                            } else {
                                await renderPage(currentPanel, state, context);
                            }
                        } else if (state.memesViewed >= 10) {
                            console.log('Already viewed 10 memes, showing breakLimit');
                            state.mode = 'breakLimit';
                            currentPanel.webview.html = getBreakLimitPage(state, auraPoints);
                        } else {
                            currentPanel.webview.postMessage({ command: 'showError', message: `Not enough Aura Points! Need ${memeCost} points.` });
                        }
                    } catch (error) {
                        currentPanel.webview.postMessage({ command: 'showError', message: 'Failed to load more memes.' });
                        state.mode = 'choice';
                        await renderPage(currentPanel, state, context);
                    }
                    break;

                case 'closeMemes':
                    console.log('Closing memes, returning to choice');
                    state.mode = 'choice';
                    await renderPage(currentPanel, state, context);
                    break;

                case 'closeSocialBreak':
                    console.log('Closing social break, returning to choice');
                    state.mode = 'choice';
                    await renderPage(currentPanel, state, context);
                    break;

                case 'close':
                    deductBreakTimePoints(context, state.username, state.breakStartTime);
                    cleanupMemes();
                    currentPanel.dispose();
                    currentPanel = undefined;
                    isBreakActive = false;
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
                    await renderPage(currentPanel, state, context);
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
                    await renderPage(currentPanel, state, context);
                    break;
            }
        });

        currentPanel.onDidDispose(() => {
            if (state) {
                deductBreakTimePoints(context, state.username, state.breakStartTime);
                cleanupMemes();
            }
            currentPanel = undefined;
            isBreakActive = false;
        }, null, context.subscriptions);
    }

    const state: State = {
        mode: 'relaxation',
        subMode: 'eyeIntro',
        memeLimit,
        currentIndex: 0,
        selectedMemes: [],
        allMemes: [],
        breakProgress: 0,
        totalSteps: 4,
        username,
        watchedVideos: new Set(context.globalState.get<string[]>("watchedVideos", [])),
        gamePlayed: false,
        memeRound: 1,
        breakStartTime: Date.now(),
        memesViewed: 0,
        hasViewedMemes: false
    };

    (currentPanel as any)._state = state;
    if (currentPanel) {
        await renderPage(currentPanel, state, context);
    }
}

async function renderPage(panel: vscode.WebviewPanel, state: State, context: vscode.ExtensionContext) {
    const auraPoints = context.globalState.get<number>(`auraPoints_${state.username}`, 0);
    console.log(`Rendering page: mode=${state.mode}, subMode=${state.subMode}, memesViewed=${state.memesViewed}, memeRound=${state.memeRound}`);
    switch (state.mode) {
        case 'relaxation':
            panel.webview.html = getRelaxationPage(state, auraPoints);
            break;
        case 'choice':
            panel.webview.html = getChoicePage(state, auraPoints);
            break;
        case 'memeViewer':
            panel.webview.html = getMemeViewerPage(state, auraPoints, panel);
            break;
        case 'memeChoice':
            panel.webview.html = getMemeChoicePage(state, auraPoints);
            break;
        case 'breakLimit':
            panel.webview.html = getBreakLimitPage(state, auraPoints);
            break;
        case 'socialBreak':
            break;
        case 'appreciate':
            panel.webview.html = getChoicePage(state, auraPoints);
            break;
    }
}

function getChoicePage(state: State, auraPoints: number): string {
    const memeCost = vscode.workspace.getConfiguration('memeBreak').get<number>('memeCost', 100);
    const viewMemesDisabled = state.hasViewedMemes || auraPoints < memeCost ? 'disabled' : '';

    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>
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