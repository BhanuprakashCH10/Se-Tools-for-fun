import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import os from 'os';

let currentPanel: vscode.WebviewPanel | undefined;
let totalSongs: number = 0;
let userIds: string[] = [];
let videoCount: number = 0;

export function activateBreakTime(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('memeBreak');
    const intervalMinutes = config.get<number>('intervalMinutes', 10);
    const snoozeMinutes = config.get<number>('snoozeMinutes', 5);
    const memeLimit = config.get<number>('memeLimit', 5);
    const interval = intervalMinutes * 1000; // Fixed to minutes

    let breakTimer: NodeJS.Timeout | undefined;
    let isBreakActive = false;

    // Initialize money if not set
    const initialMoney = context.globalState.get<number>('money', 0);
    if (initialMoney === 0) {
        context.globalState.update('money', 0); // Start with 0 money
    }

    function startTimer() {
        if (isBreakActive) { return; }
        breakTimer = setInterval(() => {
            isBreakActive = true;
            vscode.window.showInformationMessage('Time for a mindful break!', 'Take Break', 'Snooze')
                .then(selection => {
                    isBreakActive = false;
                    if (selection === 'Take Break') {
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

interface State {
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
    memeRound: number; // Track the round of memes (1st set, 2nd set)
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

    await getVideoCount();
    await fetchAllUsers();

    const usersList: string[] = context.globalState.get("usersList", []);
    if (!usersList.includes(username)) {
        const success = await registerUser(username);
        if (success) {
            usersList.push(username);
            await context.globalState.update("usersList", usersList);
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
            const currentMoney = context.globalState.get<number>('money', 0);
            const setCost = 50; // Cost for a set of memes

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
                        state.subMode = 'stretchBreak';
                        state.breakProgress = 3;
                        renderPage(currentPanel, state, context, memesFolderPath, memeFiles);
                    }
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
                        renderBreakLimitPage(currentPanel, state, context);
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
                    await fetchAndDisplayVideos(currentPanel, state, context, username, memesFolderPath, memeFiles);
                    break;

                case 'playVideo':
                    state.watchedVideos.add(message.selectedId);
                    await context.globalState.update("watchedVideos", Array.from(state.watchedVideos));
                    break;

                case 'awardMoney':
                    const newMoney = currentMoney + message.amount;
                    await context.globalState.update('money', newMoney);
                    currentPanel.webview.postMessage({ command: 'updateMoney', amount: newMoney });
                    break;

                case 'refreshVideos':
                    await fetchAndDisplayVideos(currentPanel, state, context, username, memesFolderPath, memeFiles);
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
                    currentPanel.dispose();
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

function renderPage(panel: vscode.WebviewPanel | undefined, state: State, context: vscode.ExtensionContext, memesFolderPath: string, memeFiles: string[]) {
    if (!panel) { return; }
    const currentMoney = context.globalState.get<number>('money', 0);

    switch (state.mode) {
        case 'relaxation':
            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
                <body>
                    ${getProgressBar(state.breakProgress, state.totalSteps)}
                    ${getRelaxationContent(state.subMode)}
                </body>
                </html>
            `;
            break;
        case 'choice':
            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
                <body>
                    <div class="container">
                        <h1>🎉 Break Complete!</h1>
                        <p>Current Money: ${currentMoney} units</p>
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
                        function startMemes() { vscode.postMessage({ command: 'startMemes' }); }
                        function startSocialBreak() { vscode.postMessage({ command: 'startSocialBreak' }); }
                        function closePanel() { vscode.postMessage({ command: 'close' }); }
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
            break;
        case 'memeViewer':
            const memeUri = panel.webview.asWebviewUri(state.selectedMemes[state.currentIndex]);
            panel.webview.html = `
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
            break;
        case 'memeChoice':
            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
                <body>
                    <div class="container">
                        <h1>🎉 Meme Break is Done!</h1>
                        <p>Current Money: ${currentMoney} units</p>
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
            break;
        case 'socialBreak':
            // Handled in fetchAndDisplayVideos
            break;
    }
}

async function fetchAndDisplayVideos(panel: vscode.WebviewPanel, state: State, context: vscode.ExtensionContext, username: string, memesFolderPath: string, memeFiles: string[]) {
    const getMsgsApiURL = "https://qb1n4uw5b6.execute-api.ap-south-1.amazonaws.com/animal/getvideowithmsg";
    const jsonBody = { "userid": username };

    try {
        const response = await fetch(getMsgsApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify(jsonBody)
        });
        const result = await response.json() as { body?: string };
        let messageIds: { id: string; msg: string; lang: string }[] = [];

        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                messageIds = parsedBody.map(item => ({ id: item.messageid, msg: item.messagetext, lang: item.language }));
            }
        }

        if (messageIds.length <= videoCount) {
            vscode.window.showInformationMessage("No New Videos available.");
        } else {
            videoCount = messageIds.length;
        }

        panel.webview.html = getSocialBreakContent(messageIds, state.watchedVideos, username, totalSongs, state.gamePlayed);
    } catch (error) {
        vscode.window.showErrorMessage(`API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function getRelaxationContent(subMode?: string): string {
    switch (subMode) {
        case 'eyeIntro':
            return `
                <div class="container">
                    <h1>👀 Give Your Eyes a Break</h1>
                    <p>Your eyes work hard staring at screens all day. Take a short break!</p>
                    <div class="button-group">
                        <button class="primary" onclick="startEyeTimer()">Start 20s Eye Rest</button>
                        <button onclick="skip()">Skip</button>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function startEyeTimer() { vscode.postMessage({ command: 'startEyeTimer' }); }
                        function skip() { vscode.postMessage({ command: 'nextAfterEyeTimer' }); }
                    </script>
                </div>
            `;
        case 'eyeTimer':
            return `
                <div class="container">
                    <h1>👀 Close Your Eyes!</h1>
                    <div class="timer pulse" id="timer">20s</div>
                    <p id="randomMessage">Relax and let your eyes rest...</p>
                    <div class="button-group">
                        <button onclick="skip()">Skip</button>
                    </div>
                    <script>
                        const messages = [
                            "Why are you reading this? Close your eyes!",
                            "Seriously, stop peeking! 👀",
                            "Eyes closed means better rest!",
                            "You're missing the point! 😄"
                        ];
                        let seconds = 20;
                        const timerEl = document.getElementById('timer');
                        const msgEl = document.getElementById('randomMessage');
                        let msgIndex = 0;
                        const vscode = acquireVsCodeApi();
                        let interval = setInterval(() => {
                            seconds--;
                            timerEl.textContent = \`\${seconds}s\`;
                            if (seconds % 5 === 0 && seconds > 0) {
                                msgEl.textContent = messages[msgIndex % messages.length];
                                msgIndex++;
                            }
                            if (seconds <= 0) {
                                clearInterval(interval);
                                timerEl.textContent = "Good job! 👍";
                                timerEl.classList.remove('pulse');
                                document.querySelector('.button-group').innerHTML = '<button class="primary" onclick="next()">Next</button>';
                            }
                        }, 1000);
                        function skip() {
                            clearInterval(interval);
                            vscode.postMessage({ command: 'nextAfterEyeTimer' });
                        }
                        function next() {
                            clearInterval(interval);
                            vscode.postMessage({ command: 'nextAfterEyeTimer' });
                        }
                    </script>
                </div>
            `;
        case 'waterBreak':
            return `
                <div class="container">
                    <h1>💧 Hydration Station</h1>
                    <p>Time to hydrate! Drink at least 250 ml of water.</p>
                    <div class="input-group">
                        <input type="number" id="waterAmount" placeholder="Enter ml" min="250" step="50" class="water-input">
                        <span class="unit">ml</span>
                    </div>
                    <p id="error" class="error-message"></p>
                    <div class="button-group">
                        <button class="primary" onclick="submitWater()">Submit</button>
                        <button onclick="skip()">Skip</button>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function submitWater() {
                            const amount = parseInt(document.getElementById('waterAmount').value) || 0;
                            if (amount < 250) {
                                const errorEl = document.getElementById('error');
                                errorEl.textContent = 'Please drink at least 250 ml!';
                                errorEl.style.display = 'block';
                                setTimeout(() => errorEl.style.display = 'none', 3000);
                            } else {
                                vscode.postMessage({ command: 'submitWater', amount: amount });
                            }
                        }
                        function skip() { vscode.postMessage({ command: 'submitWater', amount: 250 }); }
                    </script>
                </div>
            `;
        case 'stretchBreak':
            return `
                <div class="container">
                    <h1>🚶 Stretch Time</h1>
                    <div id="timerContainer">
                        <button class="primary" onclick="startStretchTimer()">Start Stretch Timer</button>
                    </div>
                    <p id="stretchMessage">Get up and stretch your body!</p>
                    <div class="stretch-tips">
                        <div class="tip">💡 Reach for the ceiling!</div>
                        <div class="tip">💡 Roll your shoulders</div>
                        <div class="tip">💡 Twist your torso</div>
                    </div>
                    <div class="button-group">
                        <button onclick="skip()">Skip</button>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        let seconds = 20;
                        let interval;
                        function startStretchTimer() {
                            const timerContainer = document.getElementById('timerContainer');
                            timerContainer.innerHTML = '<div class="timer pulse" id="timer">20s</div>';
                            const timerEl = document.getElementById('timer');
                            interval = setInterval(() => {
                                seconds--;
                                timerEl.textContent = \`\${seconds}s\`;
                                if (seconds <= 0) {
                                    clearInterval(interval);
                                    timerEl.textContent = "Done! 👍";
                                    document.querySelector('.button-group').innerHTML = '<button class="primary" onclick="finish()">Done</button>';
                                }
                            }, 1000);
                        }
                        function skip() {
                            if (interval) clearInterval(interval);
                            vscode.postMessage({ command: 'finishStretch' });
                        }
                        function finish() {
                            if (interval) clearInterval(interval);
                            vscode.postMessage({ command: 'finishStretch' });
                        }
                    </script>
                </div>
            `;
        default:
            return '<div class="container"><h1>Error: Invalid subMode</h1></div>';
    }
}

function getRandomMemes(folderPath: string, memeFiles: string[], count: number): vscode.Uri[] {
    const shuffled = [...memeFiles].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count).map(file => vscode.Uri.file(path.join(folderPath, file)));
}

function getCommonStyles(): string {
    return `
        :root {
            --vscode-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            --vscode-button-bg: var(--vscode-button-background);
            --vscode-button-hover: var(--vscode-button-hoverBackground);
            --vscode-input-background: var(--vscode-editorWidget-background);
            --vscode-input-border: var(--vscode-editorWidget-border);
        }
        body {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            line-height: 1.6;
            animation: fadeIn 0.3s ease-in;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            text-align: center;
        }
        .meme-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 90vh;
        }
        h1 {
            color: var(--vscode-editor-foreground);
            margin-bottom: 1.5rem;
        }
        .timer {
            font-size: 2.5rem;
            margin: 2rem 0;
            color: var(--vscode-button-background);
            animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        .button-group {
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        button {
            background: var(--vscode-button-bg);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 0.8rem 1.5rem;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.95rem;
        }
        button:hover {
            background: var(--vscode-button-hover);
            transform: translateY(-1px);
            box-shadow: 0 3px 6px rgba(0,0,0,0.1);
        }
        button:active {
            transform: translateY(0);
            box-shadow: none;
        }
        .input-group {
            margin: 2rem auto;
            max-width: 300px;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .water-input {
            flex: 1;
            padding: 0.8rem;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-editor-foreground);
            font-size: 1rem;
        }
        .unit {
            color: var(--vscode-descriptionForeground);
        }
        .error-message {
            color: #ff4444;
            margin: 1rem 0;
            display: none;
        }
        .meme-image {
            max-width: 90%;
            max-height: 60vh;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            margin: 2rem 0;
            object-fit: contain;
        }
        .progress {
            color: var(--vscode-descriptionForeground);
            margin: 1rem 0;
            font-size: 0.9rem;
        }
        .stretch-tips {
            margin: 2rem 0;
            display: grid;
            gap: 1rem;
        }
        .tip {
            padding: 1rem;
            background: var(--vscode-editorWidget-background);
            border-radius: 6px;
            font-size: 0.95rem;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: var(--vscode-editorWidget-background);
            border-radius: 3px;
            margin: 2rem 0;
        }
        .progress-fill {
            height: 100%;
            background: var(--vscode-button-background);
            border-radius: 3px;
            transition: width 0.3s ease;
        }
    `;
}

function getProgressBar(currentStep: number, totalSteps: number): string {
    const width = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    return `<div class="progress-bar"><div class="progress-fill" style="width: ${width}%"></div></div>`;
}

function renderBreakLimitPage(panel: vscode.WebviewPanel | undefined, state: State, context: vscode.ExtensionContext) {
    if (!panel) { return; }
    const currentMoney = context.globalState.get<number>('money', 0);
    panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>$/* getCommonStyles() */</style></head>
        <body>
            <div class="container">
                <h1>⏰ Break Over</h1>
                <p>Current Money: ${currentMoney} units</p>
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

function getSocialBreakContent(messageIds: { id: string; msg: string; lang: string }[], watchedVideos: Set<string>, username: string, songsCount: number, gamePlayed: boolean): string {
    const values = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, -40000];
    const shuffledValues = values.sort(() => Math.random() - 0.5);

    const videoURL = "https://animateoutput.s3.ap-south-1.amazonaws.com/";
    const sendMsgApiURL = "https://9xbaecf7o2.execute-api.ap-south-1.amazonaws.com/prod/callanimal";

    const options = userIds.map((user) => `<li onclick="selectUser('${user}')">${user}</li>`).join("");
    const sortedMessageIds = Array.from(messageIds).sort((a, b) => b.id.localeCompare(a.id));
    const radioButtons = sortedMessageIds.map(({ id, msg, lang }) => {
        const isWatched = watchedVideos.has(id);
        return `
            <input type="radio" name="messageid" value="${msg} [${lang}]" id="${id}" msg="${msg}">
            <label for="${id}" style="color: ${isWatched ? 'grey' : 'white'}; font-weight: ${isWatched ? 'normal' : 'bold'};">${id}</label><br>
        `;
    }).join("");

    return `<!DOCTYPE html>
    <html>
    <head>
        <title>Social Break</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
            .header { position: absolute; top: 10px; right: 20px; font-size: 14px; color: lightgray; }
            .left-panel, .right-panel { padding: 4px; }
            .scrollable-list { flex-grow: 1; overflow-y: auto; }
            .left-panel { width: 20%; float: left; height: 75vh; border-right: 2px solid grey; display: flex; flex-direction: column; }
            .center-panel { width: 47%; position: relative; padding: 5px; border-right: 2px solid grey; display: flex; flex-direction: column; align-items: center; }
            .right-panel { width: 33%; position: relative; padding: 5px; display: flex; flex-direction: column; align-items: center; }
            select { width: 100px; margin-left: 10px; }
            .button-container { display: flex; gap: 10px; justify-content: left; background: black; padding: 8px; }
            .left-panel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; }
            .center-panel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; }
            #videoContainer { position: relative; width: 420px; height: 320px; border: 3px solid #007acc; border-radius: 8px; resize: both; overflow: hidden; background-color: black; }
            video { width: 100%; height: 100%; object-fit: contain; }
            #dragHandle { width: 100%; height: 20px; background: #007acc; cursor: move; text-align: center; color: white; font-weight: bold; }
            textarea { width: 95%; max-width: 420px; height: 60px; margin-top: 10px; border: 1px solid #007acc; border-radius: 8px; padding: 3px; background-color: #222; color: white; resize: none; }
            button:hover { background-color: #005f99; }
            .dropdown-container { position: relative; display: inline-block; border: 1px solid #007acc; }
            .dropdown-input { width: 180px; padding: 6px; border: 1px solid #007acc; border-radius: 5px; }
            .dropdown-list { position: absolute; width: 200px; max-height: 150px; overflow-y: auto; border: 1px solid #007acc; border-top: none; background: grey; display: none; z-index: 1000; list-style: none; padding: 0; margin: 0; }
            .dropdown-list li { padding: 2px; cursor: pointer; color: black; background: grey; }
            .dropdown-list li:hover { background: #f0f0f0; }
            .right-panel { display: flex; flex-direction: column; align-items: center; flex-grow: 1; padding: 10px; }
            .right-panel .grid-container { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 10px; padding: 10px; border: 2px solid grey; background-color: #f5f5f5; }
            .right-panel .button { width: 90px; height: 60px; background: linear-gradient(to top, #e0e0e0, #ffffff); color: #333; border: 3px solid #888; border-radius: 8px; box-shadow: inset 0px -5px 5px rgba(0, 0, 0, 0.2), inset 0px 5px 5px rgba(255, 255, 255, 0.7), 3px 3px 5px rgba(0, 0, 0, 0.3); cursor: pointer; font-size: 14px; font-weight: bold; text-align: center; position: relative; }
            .right-panel .button:hover { background: linear-gradient(to top, #d0d0d0, #ffffff); }
            .right-panel .green { background: green !important; font-weight: bold; color: white; }
            .right-panel .orange { background: orange !important; font-weight: bold; color: black; }
            .right-panel .red { background: red !important; font-weight: bold; color: white; }
            .right-panel .disabled { pointer-events: none; opacity: 0.5; }
            .right-panel .score-table { margin-top: 10px; border-collapse: collapse; width: 200px; text-align: center; border: 1px solid white; }
            .right-panel .score-table th { background: white; color: blue; font-weight: bold; }
            .right-panel .score-table th, .score-table td { border: 1px solid white; padding: 5px; font-size: 16px; }
            #add-rounded-sum { margin-top: 10px; display: none; background: linear-gradient(to top, #ffff00, #ffcc00); color: black; font-weight: bold; padding: 2px; border: 3px solid #ffaa00; border-radius: 8px; cursor: pointer; box-shadow: inset 0px -5px 5px rgba(255, 255, 0, 0.5), inset 0px 5px 5px rgba(255, 204, 0, 0.7), 3px 3px 5px rgba(255, 153, 0, 0.5); }
            #add-rounded-sum:hover { background: linear-gradient(to top, #ffcc00, #ffff00); }
            .right-panel .medal { display: none; width: 280px; height: 40px; background: gold; border-radius: 10%; text-align: center; font-size: 18px; font-weight: bold; line-height: 30px; color: black; margin-top: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); }
            .right-panel .reset-button { display: none; margin-top: 10px; padding: 6px; font-size: 16px; font-weight: bold; background: red; color: white; border: none; border-radius: 5px; cursor: pointer; }
            .right-panel .reset-button:hover { background: darkred; }
        </style>
    </head>
    <body>
        <div class="header"><strong>${username}</strong></div>
        <div class="left-panel">
            <h2>Select a Video</h2>
            <div class="scrollable-list">
                ${radioButtons}
            </div>
            <div class="button-container">
                <button onclick="playSelectedVideo()">Play</button>
                <button id="Refresh" onclick="refreshVideos()" style="background-color: #007acc;">Refresh</button>
            </div>
            <div class="button-container">
                <button onclick="playRandomSong()">Song</button>
                <button onclick="stopRandomSong()">Stop</button>
            </div>
        </div>
        <div class="center-panel">
            <h3></h3>
            <div id="videoContainer">
                <div id="dragHandle">Drag</div>
                <video id="videoPlayer" controls autoplay>
                    <source id="videoSource" src="" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
            <textarea id="messageBox" maxlength="150" placeholder="Enter your message (max 150 chars)"></textarea>
            <div class="button-container">
                <select id="languageSelect" onchange="updateLanguage()">
                    <option value="en">English</option>
                    <option value="gu">Gujarati</option>
                    <option value="hi">Hindi</option>
                    <option value="kn">Kannada</option>
                    <option value="ml">Malayalam</option>
                    <option value="mr">Marathi</option>
                    <option value="ta">Tamil</option>
                    <option value="te">Telugu</option>
                    <option value="or">Odia</option>
                </select>
                <div class="dropdown-container">
                    <input type="text" id="userSearch" class="dropdown-input" placeholder="Send to..." oninput="filterUsers()" onclick="toggleDropdown()">
                    <ul id="userDropdown" class="dropdown-list">${options}</ul>
                </div>
                <button onclick="submitMessage()">Send</button>
            </div>
        </div>
        <div class="right-panel">
            <h3></h3>
            <div class="grid-container" id="grid">
                ${shuffledValues.map((value, index) => `<button class="button" id="btn${index + 1}" data-value="${value}" onclick="userClick(${index + 1})">${index + 1}</button>`).join('')}
            </div>
            <div id="medal" class="medal"></div>
            <table class="score-table">
                <tr><th>User</th><th>Comp</th></tr>
                <tr><td id="user-score1">0</td><td id="comp-score1">0</td></tr>
                <tr><td id="user-score2">0</td><td id="comp-score2">0</td></tr>
                <tr><td id="user-score3">0</td><td id="comp-score3">0</td></tr>
                <tr><td id="user-score4">0</td><td id="comp-score4">0</td></tr>
                <tr><td id="user-total">0</td><td id="comp-total">0</td></tr>
            </table>
            <br>
            <button id="add-rounded-sum" style="margin-top: 10px; display: ${gamePlayed ? 'none' : 'none'}; color: #333;" onclick="addofferValueToUserTotal();">Add Rounded Sum</button>
            <button id="reset" class="reset-button" onclick="closePanel()">Close</button>
        </div>
        <script>
            let selectedUser = "";
            let songIndex = 0;
            const totalSongs = ${songsCount};
            let gamePlayed = ${gamePlayed};

            function toggleDropdown() { document.getElementById("userDropdown").style.display = "block"; }
            function selectUser(user) { document.getElementById("userSearch").value = user; document.getElementById("userDropdown").style.display = "none"; selectedUser = user; }
            function filterUsers() { let input = document.getElementById("userSearch").value.toLowerCase(); let items = document.querySelectorAll("#userDropdown li"); items.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(input) ? "block" : "none"; }); }
            document.addEventListener("click", function(event) { if (!event.target.closest(".dropdown-container")) { document.getElementById("userDropdown").style.display = "none"; } });

            function updateMessageColors(selectedId) {
                document.querySelectorAll('input[name="messageid"]').forEach(radio => {
                    const safeId = CSS.escape(radio.id);
                    const label = document.querySelector(\`label[for="\${safeId}"]\`);
                    if (label) {
                        if (radio.id === selectedId) { label.style.color = "grey"; }
                        else { label.style.color = radio.dataset.watched === "true" ? "grey" : "white"; label.style.fontWeight = radio.dataset.watched === "true" ? "normal" : "bold"; }
                    }
                });
            }

            function updateLanguage() { const selectedLanguage = document.getElementById("languageSelect").value; setIME(selectedLanguage); }
            function playRandomSong() {
                songIndex = songIndex < totalSongs ? songIndex + 1 : 1;
                let randUrl = "https://animateinput.s3.ap-south-1.amazonaws.com/randsong" + songIndex + ".mp4";
                const videoPlayer = document.getElementById('videoPlayer');
                const videoSource = document.getElementById('videoSource');
                videoSource.src = randUrl;
                videoPlayer.load();
                videoPlayer.playbackRate = 0.75;
                enablePiP();
            }
            function stopRandomSong() {
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer) { videoPlayer.pause(); videoPlayer.currentTime = 0; }
            }

            function playSelectedVideo() {
                const selected = document.querySelector('input[name="messageid"]:checked');
                if (selected) {
                    const videoUrl = '${videoURL}' + selected.id;
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');
                    videoSource.src = videoUrl;
                    videoPlayer.load();
                    videoPlayer.playbackRate = 0.75;
                    enablePiP();
                    updateMessageColors(selected.id);
                    const messageBox = document.getElementById("messageBox");
                    messageBox.placeholder = selected.getAttribute('msg');
                    vscode.postMessage({ command: 'playVideo', selectedId: selected.id });
                } else { vscode.postMessage({ command: 'noSelection' }); }
            }

            function refreshVideos() {
                const refreshButton = document.getElementById('Refresh');
                refreshButton.disabled = true;
                refreshButton.style.backgroundColor = '#808080';
                vscode.postMessage({ command: 'refreshVideos' });
                setTimeout(() => { refreshButton.disabled = false; refreshButton.style.backgroundColor = '#007acc'; }, 5000);
            }

            async function enablePiP() {
                const video = document.getElementById('videoPlayer');
                if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                    try { await video.requestPictureInPicture(); } catch (error) { console.error("PiP failed:", error); }
                }
            }

            function submitMessage() {
                const selected = document.querySelector('input[name="messageid"]:checked');
                if (!selectedUser) { vscode.postMessage({ command: 'emptySendToUser'}); alert("Please select a user to send message."); return; }
                const message = document.getElementById('messageBox').value.trim();
                if (message.length === 0) { vscode.postMessage({ command: 'emptyMessage'}); alert("Message cannot be empty."); return; }
                const selectedLanguage = document.getElementById('languageSelect').value;
                fetch('${sendMsgApiURL}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ "userid": '${username}', "message": message, "receiverid": selectedUser, "language": selectedLanguage, "animal": "cm" })
                })
                .then(response => response.json())
                .then(data => { console.log("Message submitted successfully!"); document.getElementById('messageBox').value = ""; })
                .catch(error => { console.error("Error submitting message:", error); alert("Failed to submit message."); });
            }

            const vscode = acquireVsCodeApi();
            const videoContainer = document.getElementById("videoContainer");
            const dragHandle = document.getElementById("dragHandle");
            let isDragging = false, offsetX = 0, offsetY = 0;

            dragHandle.addEventListener("mousedown", (e) => { isDragging = true; offsetX = e.clientX - videoContainer.offsetLeft; offsetY = e.clientY - videoContainer.offsetTop; });
            document.addEventListener("mousemove", (e) => { if (isDragging) { videoContainer.style.left = (e.clientX - offsetX) + "px"; videoContainer.style.top = (e.clientY - offsetY) + "px"; } });
            document.addEventListener("mouseup", () => { isDragging = false; });

            function setIME(language) {
                const messageBox = document.getElementById("messageBox");
                if (language === "ta") { messageBox.setAttribute("lang", "ta"); messageBox.placeholder = "உங்கள் செய்தியை உள்ளிடவும்"; }
                else if (language === "te") { messageBox.setAttribute("lang", "te"); messageBox.placeholder = "మీ సందేశాన్ని నమోదు చేయండి"; }
                else if (language === "ml") { messageBox.setAttribute("lang", "ml"); messageBox.placeholder = "നിങ്ങളുടെ സന്ദേശം നൽകുക"; }
                else if (language === "kn") { messageBox.setAttribute("lang", "kn"); messageBox.placeholder = "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ನಮೂದಿಸಿ"; }
                else if (language === "hi") { messageBox.setAttribute("lang", "hi"); messageBox.placeholder = "अपना संदेश दर्ज करें"; }
                else if (language === "mr") { messageBox.setAttribute("lang", "mr"); messageBox.placeholder = "तुमचा संदेश प्रविष्ट करा"; }
                else if (language === "gu") { messageBox.setAttribute("lang", "gu"); messageBox.placeholder = "તમારો સંદેશ દાખલ કરો"; }
                else if (language === "or") { messageBox.setAttribute("lang", "or"); messageBox.placeholder = "ତୁମର ବାର୍ତ୍ତା"; }
                else if (language === "en") { messageBox.setAttribute("lang", "en"); messageBox.placeholder = "Enter your message"; }
            }

            let buttonsDisabled = false;
            let offerAccepted = false;
            let userTotal = 0;
            let compTotal = 0;
            let offerValue = 0;
            let compClicks = 0;
            let userScores = [];
            let compScores = [];

            function userClick(index) {
                if (buttonsDisabled || offerAccepted || gamePlayed) return;
                let button = document.getElementById('btn' + index);
                let value = parseInt(button.getAttribute('data-value'));
                handleButtonClick(index, value, 'User');
                userTotal += value;
                userScores.push(value);
                updateScoreTable();
                buttonsDisabled = true;
                setTimeout(() => { autoClick(); }, 1000);
            }

            function handleButtonClick(index, value, source) {
                let button = document.getElementById('btn' + index);
                if (source === "User") { button.innerHTML = \`₹\${value}<br><span style="color: white;font-weight: bold;">\${source}</span>\`; }
                else { button.innerHTML = \`₹\${value}<br><span style="color: blue;font-weight: bold;">\${source}</span>\`; }
                button.classList.add(value > 20000 ? 'green' : value > 0 ? 'orange' : 'red');
                button.classList.add('disabled');
            }

            function autoClick() {
                let unclickedButtons = Array.from(document.querySelectorAll('.button:not(.disabled)'));
                if (unclickedButtons.length === 0) { buttonsDisabled = false; return; }
                let randomButton = unclickedButtons[Math.floor(Math.random() * unclickedButtons.length)];
                let index = randomButton.id.replace('btn', '');
                let value = parseInt(randomButton.getAttribute('data-value'));
                handleButtonClick(index, value, 'Comp');
                compClicks += 1;
                compTotal += value;
                compScores.push(value);
                updateScoreTable();
                if (!offerAccepted) {
                    calculateUnclickedSum();
                    setTimeout(() => { buttonsDisabled = false; checkRemainingButton(); }, 1000);
                }
            }

            function checkRemainingButton() {
                let unclickedButtons = Array.from(document.querySelectorAll('.button:not(.disabled)'));
                if (unclickedButtons.length === 1) {
                    let lastButton = unclickedButtons[0];
                    let index = lastButton.id.replace('btn', '');
                    let value = parseInt(lastButton.getAttribute('data-value'));
                    lastButton.innerHTML = \`₹\${value}<br><span style="color: black;font-weight: bold;">Bank</span>\`;
                    lastButton.classList.add(value > 20000 ? 'green' : value > 0 ? 'orange' : 'red');
                    lastButton.classList.add('disabled');
                    checkWinner();
                }
            }

            function updateScoreTable() {
                if (!offerAccepted) { userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString()); document.getElementById('user-total').innerText = '₹' + userTotal.toLocaleString(); }
                let userTotalCell = document.getElementById('user-total');
                compScores.forEach((val, i) => document.getElementById(\`comp-score\${i+1}\`).innerText = '₹' + val.toLocaleString());
                document.getElementById('comp-total').innerText = '₹' + compTotal.toLocaleString();
                let compTotalCell = document.getElementById('comp-total');
                compTotalCell.style.backgroundColor = compTotal < userTotal ? 'red' : 'green';
                userTotalCell.style.backgroundColor = userTotal < compTotal ? 'red' : 'green';
            }

            function calculateUnclickedSum() {
                let availableValues = [...document.querySelectorAll('.button:not(.disabled)')]
                    .map(button => parseInt(button.getAttribute('data-value')) || 0);
                let sum = availableValues.reduce((acc, val) => acc + val, 0) / 1.8;
                offerValue = Math.round(sum / 5000) * 5000;
                if (userTotal < compTotal) { offerValue = offerValue + Math.round((compTotal / 1.5) / 5000) * 5000; }
                if ((compTotal + offerValue) < userTotal) { offerValue = 0; }
                if (offerValue < 0) { offerValue = 0; }
                if (compClicks === 4) { offerValue = 0; }
                let button = document.getElementById('add-rounded-sum');
                if (offerValue !== 0 && !gamePlayed) {
                    button.innerText = \`Offer to Quit ₹\${offerValue.toLocaleString()}\`;
                    button.style.display = 'block';
                    button.setAttribute('data-value', offerValue);
                } else { button.style.display = 'none'; }
            }

            function addofferValueToUserTotal() {
                userTotal += offerValue;
                offerAccepted = true;
                let button = document.getElementById('add-rounded-sum');
                userScores.push(offerValue);
                userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString());
                document.getElementById('user-total').innerText = '₹' + userTotal.toLocaleString();
                let userTotalCell = document.getElementById('user-total');
                let compTotalCell = document.getElementById('comp-total');
                compTotalCell.style.backgroundColor = compTotal < userTotal ? 'red' : 'green';
                userTotalCell.style.backgroundColor = userTotal < compTotal ? 'red' : 'green';
                button.style.display = 'none';
                for (let i = compClicks; i < 4; i++) { setTimeout(() => { autoClick(); }, i * 1000); }
                setTimeout(() => { checkWinner(); }, (5 - compClicks) * 1500);
            }

            function checkWinner() {
                gamePlayed = true;
                let gameResult = userTotal > compTotal ? "You Won" : "It's a Time-pass Game...";
                document.getElementById('medal').innerText = gameResult;
                document.getElementById('medal').style.display = 'block';
                document.getElementById('reset').style.display = 'block';
                document.querySelectorAll('.button').forEach(button => button.classList.add('disabled'));

                if (gameResult === "You Won") {
                    vscode.postMessage({ command: 'awardMoney', amount: 100 }); // Award 100 units for winning
                }

                setTimeout(() => {vscode.postMessage({command: 'reset'});}, 5000);  
            }

            function closePanel() { vscode.postMessage({ command: 'close' }); }
        </script>
    </body>
    </html>`;
}

async function getVideoCount() {
    const url = "https://animateinput.s3.ap-south-1.amazonaws.com/videocount.txt";
    try {
        const response = await fetch(url);
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        const text = await response.text();
        const numberMatch = text.match(/\d+/);
        totalSongs = numberMatch ? parseInt(numberMatch[0], 10) : 0;
    } catch (error) {
        vscode.window.showErrorMessage(`Error fetching file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        totalSongs = 0;
    }
}

async function fetchAllUsers() {
    const getAllUsersApiURL = "https://w0jnm95oyc.execute-api.ap-south-1.amazonaws.com/animal/userlist";
    try {
        const response = await fetch(getAllUsersApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({})
        });
        const result = await response.json() as { body?: string };
        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                userIds = parsedBody.map(item => item.userid).filter(id => id);
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function registerUser(username: string): Promise<boolean> {
    try {
        const response = await fetch("https://raoh09sh65.execute-api.ap-south-1.amazonaws.com/prod/registeruser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "userid": username, "password": "", "username": "", "secquestion": "", "secanswer": "" })
        });
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        console.log(`User registered successfully: ${username}`);
        return true;
    } catch (error) {
        console.error("Error registering user:", error);
        return false;
    }
}

export function deactivate() {}