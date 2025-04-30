import * as vscode from 'vscode';
import { createWebviewPanel } from './webview';
import { showHistoryPanel } from './graphView';
import { getKeyboardHeatmapHtml, getKeyboardHeatmapStyle, getKeyboardHeatmapScript } from './keyboardHeatmap';

interface TypingSpeedState {
    keystrokeCount: number;
    startTime: number;
    panel: vscode.WebviewPanel | null;
    lastTypedTime: number;
    currentWPM: number;
    history: { timestamp: number; wpm: number }[];
    keyPressData: Record<string, number>;
    lastFullUpdateTime: number | undefined;
}

export class TypingSpeedFeature {
    private state: TypingSpeedState = {
        keystrokeCount: 0,
        startTime: Date.now(),
        panel: null,
        lastTypedTime: Date.now(),
        currentWPM: 0,
        history: [],
        keyPressData: {},
        lastFullUpdateTime: undefined
    };

    private statusBarItem: vscode.StatusBarItem;

    constructor(private context: vscode.ExtensionContext) {
        // Load saved state
        const savedHistory = context.globalState.get<{ timestamp: number; wpm: number }[]>('typingSpeedHistory');
        if (savedHistory) {
            this.state.history = savedHistory;
        }
        const savedKeyPressData = context.globalState.get<Record<string, number>>('keyPressData');
        if (savedKeyPressData) {
            this.state.keyPressData = savedKeyPressData;
        }

        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'typingSpeedTracker.togglePanel';
        this.statusBarItem.show();
        this.context.subscriptions.push(this.statusBarItem);

        // Register commands
        this.context.subscriptions.push(
            vscode.commands.registerCommand('typingSpeedTracker.togglePanel', () => {
                this.toggleVisualizerPanel();
            }),
            vscode.commands.registerCommand('typingSpeedTracker.resetStats', () => {
                this.resetStats();
                vscode.window.showInformationMessage('Typing speed statistics reset');
            })
        );

        // Set up event listeners
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const now = Date.now();
                const idleTimeInSeconds = (now - this.state.lastTypedTime) / 1000;
                const idleThreshold = this.getConfiguration().idleTimeThreshold;

                if (idleTimeInSeconds > idleThreshold) {
                    this.state.startTime = now;
                    this.state.keystrokeCount = 0;
                    this.resetWPMDisplay();
                }

                const pressedKeys = this.getKeysFromTextDocumentChangeEvent(event);
                pressedKeys.forEach(key => {
                    this.state.keyPressData[key] = (this.state.keyPressData[key] || 0) + 1;
                });

                if (this.state.panel && this.state.panel.visible && pressedKeys.length > 0) {
                    this.state.panel.webview.postMessage({
                        command: 'updateKeyHeat',
                        keys: pressedKeys
                    });

                    if (this.state.lastFullUpdateTime === undefined || now - this.state.lastFullUpdateTime > 5000) {
                        this.state.panel.webview.postMessage({
                            command: 'initKeyboardHeatmap',
                            keyPressData: this.state.keyPressData
                        });
                        this.state.lastFullUpdateTime = now;
                    }
                }

                for (const change of event.contentChanges) {
                    this.state.keystrokeCount += change.text.length;
                }

                this.state.lastTypedTime = now;
            })
        );

        // Set up periodic updates
        const updateInterval = setInterval(() => {
            this.updateTypingSpeed();
        }, 2000);
        this.context.subscriptions.push({ dispose: () => clearInterval(updateInterval) });

        // Initialize the visualizer panel
        this.createVisualizerPanel();
    }

    private getConfiguration() {
        const config = vscode.workspace.getConfiguration('typingSpeedTracker');
        return {
            idleTimeThreshold: config.get<number>('idleTimeThreshold') || 5,
            saveHistory: config.get<boolean>('saveHistory') || true,
            historyMaxEntries: config.get<number>('historyMaxEntries') || 500,
            historyGrouping: config.get<string>('historyGrouping') || 'hour'
        };
    }

    private getKeysFromTextDocumentChangeEvent(event: vscode.TextDocumentChangeEvent): string[] {
        const keys = [];
        for (const change of event.contentChanges) {
            if (change.text.length === 1) {
                keys.push(change.text.toLowerCase());
            } else if (change.text === '') {
                keys.push('backspace');
            } else if (change.text.includes('\n')) {
                keys.push('enter');
            } else if (change.text === '\t') {
                keys.push('tab');
            } else if (change.text === ' ') {
                keys.push('space');
            }
        }
        return keys;
    }

    private createVisualizerPanel() {
        const panel = createWebviewPanel(this.context, message => {
            if (message.command === 'ready') {
                this.postWPMToWebview();
                setTimeout(() => {
                    if (this.state.panel) {
                        this.state.panel.webview.postMessage({
                            command: 'initKeyboardHeatmap',
                            keyPressData: this.state.keyPressData
                        });
                    }
                }, 500);
            } else if (message.command === 'resetStats') {
                this.resetStats();
            } else if (message.command === 'heatmapReady') {
                if (this.state.panel && this.state.panel.visible) {
                    this.state.panel.webview.postMessage({
                        command: 'initKeyboardHeatmap',
                        keyPressData: this.state.keyPressData
                    });
                    this.state.lastFullUpdateTime = Date.now();
                }
            } else if (message.command === 'showHistory') {
                showHistoryPanel(this.context, message.history);
            }
        });
        this.state.panel = panel;
        panel.onDidDispose(() => {
            this.state.panel = null;
        }, null, this.context.subscriptions);
    }

    private toggleVisualizerPanel() {
        if (this.state.panel) {
            this.state.panel.dispose();
            this.state.panel = null;
        } else {
            this.createVisualizerPanel();
        }
    }

    private updateTypingSpeed() {
        const now = Date.now();
        const inactiveFor = (now - this.state.lastTypedTime) / 1000;
        let wpm = 0;
        if (inactiveFor < 2) {
            const elapsedMinutes = (now - this.state.startTime) / 60000;
            const wordsTyped = this.state.keystrokeCount / 5;
            wpm = Math.round(wordsTyped / elapsedMinutes);
        }

        this.state.currentWPM = wpm;

        if (wpm > 0 && (this.state.history.length === 0 || this.state.history[this.state.history.length - 1].wpm !== wpm)) {
            this.state.history.push({ timestamp: now, wpm });
            const maxEntries = this.getConfiguration().historyMaxEntries;
            if (this.state.history.length > maxEntries) {
                this.state.history = this.state.history.slice(-maxEntries);
            }
            if (this.getConfiguration().saveHistory) {
                this.context.globalState.update('typingSpeedHistory', this.state.history);
                this.context.globalState.update('keyPressData', this.state.keyPressData);
            }
        }

        const quote = this.getQuote(wpm);
        this.statusBarItem.text = `⚡ Typing Speed: ${wpm} WPM — ${quote}`;
        this.postWPMToWebview();
    }

    private postWPMToWebview() {
        if (this.state.panel) {
            this.state.panel.webview.postMessage({
                command: 'update',
                wpm: this.state.currentWPM,
                quote: this.getQuote(this.state.currentWPM),
                animationFile: this.getAnimationFile(this.state.currentWPM),
                color: this.getWPMColor(this.state.currentWPM),
                history: this.state.history
            });
        }
    }

    private resetStats() {
        this.state.keystrokeCount = 0;
        this.state.startTime = Date.now();
        this.state.currentWPM = 0;
        this.state.history = [];
        this.state.keyPressData = {};
        this.state.lastFullUpdateTime = undefined;
        if (this.getConfiguration().saveHistory) {
            this.context.globalState.update('typingSpeedHistory', []);
            this.context.globalState.update('keyPressData', {});
        }
        this.updateTypingSpeed();
        if (this.state.panel) {
            this.state.panel.webview.postMessage({
                command: 'reset',
                clearHistory: true,
                clearKeyHeatmap: true
            });
        }
    }

    private resetWPMDisplay() {
        if (this.state.panel) {
            this.state.panel.webview.postMessage({
                command: 'reset',
                clearHistory: false,
                clearKeyHeatmap: false
            });
        }
    }

    private getAnimationFile(wpm: number): string {
        if (wpm < 10) return 'slow1.json';
        else if (wpm < 20) return 'slow2.json';
        else if (wpm < 30) return 'medium1.json';
        else if (wpm < 40) return 'medium2.json';
        else if (wpm < 50) return 'fast1.json';
        else return 'fast2.json';
    }

    private getQuote(wpm: number): string {
        if (wpm < 10) return '🐢 Slow and steady wins the race...';
        else if (wpm < 20) return '🌱 Warming up... keep those keys moving!';
        else if (wpm < 35) return '🚶 Steady and focused — you\'re getting there!';
        else if (wpm < 50) return '🏃 Nice flow! You\'re typing like a pro.';
        else if (wpm < 65) return '⚡ Speedy fingers! Keep up the great momentum!';
        else return '🚀 Typing master unlocked! You\'re on fire!';
    }

    private getWPMColor(wpm: number): string {
        if (wpm < 10) return 'linear-gradient(45deg, #FF7F50, #FF6347)';
        else if (wpm < 20) return 'linear-gradient(45deg, #FF6347, #FFD700)';
        else if (wpm < 35) return 'linear-gradient(45deg, #FFD700, #32CD32)';
        else if (wpm < 50) return 'linear-gradient(45deg, #32CD32, #00BFFF)';
        else if (wpm < 65) return 'linear-gradient(45deg, #00BFFF, #8A2BE2)';
        else return 'linear-gradient(45deg, #8A2BE2, #FF1493)';
    }
}
export function activateTypingSpeed(context: vscode.ExtensionContext) {
    new TypingSpeedFeature(context);
}