import * as vscode from 'vscode';
import { State } from './breakTime';
import { getCommonStyles, getProgressBar } from './utils';

export function getRelaxationContent(subMode?: string): string {
    switch (subMode) {
        case 'eyeIntro':
            return `
                <div class="container">
                    <h1>👀 Give Your Eyes a Break</h1>
                    <p>Your eyes work hard staring at screens all day. Take a short break!</p>
                    <div class="button-group">
                        <button class="primary" onclick="startEyeTimer()">Start 20s Eye Rest</button>
                    </div>
                    <script>
                        const vscode = acquireVsCodeApi();
                        function startEyeTimer() { vscode.postMessage({ command: 'startEyeTimer' }); }
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
                        <!-- Skip button removed -->
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
                        function next() {
                            clearInterval(interval);
                            vscode.postMessage({ command: 'nextAfterEyeTimer' });
                        }
                    </script>
                </div>
            `;
        case 'waterBreak':
            return `
                <style>
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
                </style>
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
                        window.addEventListener('message', event => {
                            const message = event.data;
                            if (message.command === 'showReward') {
                                const emoji = '✨';
                                const rewardEl = document.createElement('div');
                                rewardEl.textContent = \`+ \${message.amount} points \${emoji}\`;
                                rewardEl.className = 'floating-reward';
                                document.body.appendChild(rewardEl);
                                setTimeout(() => { rewardEl.remove(); }, 2000);
                            }
                            if (message.command === 'updateAuraPoints') {
                                document.querySelectorAll('.aura-points-value').forEach(el => {
                                    el.textContent = message.amount + ' points';
                                });
                            }
                        });
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
                        <!-- Skip button removed -->
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

export function getRelaxationPage(state: State, auraPoints: number): string {
    return `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><style>${getCommonStyles()}</style></head>
        <body>
            <div class="progress">Aura Points: <span class="aura-points-value">${auraPoints} points</span></div>
            ${getProgressBar(state.breakProgress, state.totalSteps)}
            ${getRelaxationContent(state.subMode)}
        </body>
        </html>
    `;
}