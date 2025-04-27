import * as vscode from 'vscode';
import axios from 'axios';

interface Message {
    sender: 'user' | 'chatbot';
    content: string;
    timestamp: string;
}

export class Chatbot {
    private panel: vscode.WebviewPanel | undefined;
    private history: Message[] = [];
    private conversationId: string = Date.now().toString();
    private static readonly FALLBACK_API_KEY = 'AIzaSyBWX_ffYY-ijlomFKYb5q1fRgZ2hubEUac';

    constructor(private context: vscode.ExtensionContext) {}

    public openChatPanel() {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel(
                'chatbot',
                'Chat with Gemini',
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
            this.panel.webview.html = this.getWebviewContent();
            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    if (message.type === 'userMessage') {
                        const timestamp = new Date().toLocaleTimeString();
                        this.history.push({ sender: 'user', content: message.content, timestamp });
                        this.updateWebview();
                        await this.sendMessageToApi(message.content);
                    }else if (message.type === 'closeChat') {
                        this.panel?.dispose();
                    }
                },
                undefined,
                this.context.subscriptions
            );
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.history = [];
                this.conversationId = Date.now().toString();
            });
        } else {
            this.panel.reveal(vscode.ViewColumn.One);
            this.updateWebview();
        }
    }

    public promptRoast() {
        const timestamp = new Date().toLocaleTimeString();
        this.history.push({
            sender: 'chatbot',
            content: '__ROAST_PROMPT__',
            timestamp
        });
        this.updateWebview();
    }

    private async getApiKey(): Promise<string> {
        let apiKey = await this.context.secrets.get('geminiApiKey');
        if (!apiKey) {
            apiKey = Chatbot.FALLBACK_API_KEY;
        }
        if (!apiKey) {
            vscode.window.showErrorMessage('No API key provided. Please set FALLBACK_API_KEY or add in secrets.');
            throw new Error('API key not provided');
        }
        return apiKey;
    }

    private async sendMessageToApi(userMessage: string) {
        // Show loading indicator
        const timestamp = new Date().toLocaleTimeString();
        this.history.push({ sender: 'chatbot', content: '...', timestamp });
        this.updateWebview();

        const apiKey = await this.getApiKey();
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
                {
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: "You're a chill, sarcastic buddy who mocks dumb questions but still helps out. If I'm sad or stressed, cheer me up. Keep responses casual and use Markdown. Don't mock for parahgraphs, restrict to few lines" }]
                        },
                        ...this.history
                            .filter(msg => msg.sender !== 'chatbot' || msg.content !== '...')
                            .slice(-10)
                            .map(msg => ({
                                role: msg.sender === 'user' ? 'user' : 'model',
                                parts: [{ text: msg.content }]
                            })),
                        { role: 'user', parts: [{ text: userMessage }] }
                    ]
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            // Remove loading indicator
            this.history = this.history.filter(msg => !(msg.sender === 'chatbot' && msg.content === '...'));

            const chatbotResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
                || "Oops, I blanked out. Try again, genius!";
            const newTimestamp = new Date().toLocaleTimeString();
            this.history.push({ sender: 'chatbot', content: chatbotResponse, timestamp: newTimestamp });
            this.updateWebview();
        } catch (error) {
            // Remove loading indicator
            this.history = this.history.filter(msg => !(msg.sender === 'chatbot' && msg.content === '...'));
            const newTimestamp = new Date().toLocaleTimeString();
            this.history.push({ sender: 'chatbot', content: "*Yikes, something broke! Maybe the internet’s on a coffee break? Try again.*", timestamp: newTimestamp });
            this.updateWebview();
        }
    }

    private updateWebview() {
        if (this.panel) {
            this.panel.webview.postMessage({ type: 'updateHistory', history: this.history });
        }
    }

    private getWebviewContent(): string {
        // Copilot-like chat UI with avatars, header, and smooth scroll
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
            body {
            margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif;
            background: #181b20; color: #d4d4d4; height: 100vh; display: flex; flex-direction: column;
            max-width: 420px; /* Limit width */
            min-width: 320px;
            margin-left: auto; margin-right: auto;
            border-left: 1px solid #23272e;
            box-sizing: border-box;
            }
            header {
            background: #23272e; color: #fff; padding: 16px 24px; font-size: 1.2em; font-weight: 600;
            border-bottom: 1px solid #222;
            display: flex; align-items: center; gap: 10px;
            }
            header img {
            width: 28px; height: 28px; border-radius: 50%; background: #0b93f6;
            }
            #chat-history {
            flex: 1; padding: 24px 0 16px 0; overflow-y: auto; display: flex; flex-direction: column;
            gap: 8px;
            }
            .message-row {
            display: flex; align-items: flex-end; gap: 8px;
            margin: 0 24px;
            }
            .message-row.user { flex-direction: row-reverse; }
            .avatar {
            width: 32px; height: 32px; border-radius: 50%; background: #0b93f6; display: flex; align-items: center; justify-content: center;
            font-weight: bold; color: #fff; font-size: 1.1em;
            border: 2px solid #23272e;
            }
            .avatar.bot {
            background: #23272e;
            color: #0b93f6;
            border: 2px solid #0b93f6;
            }
            .bubble {
            max-width: 65vw;
            padding: 12px 16px;
            border-radius: 16px;
            font-size: 1em;
            line-height: 1.5;
            position: relative;
            box-shadow: 0 2px 8px #0002;
            word-break: break-word;
            transition: background 0.2s;
            }
            .user .bubble {
            background: #0b93f6;
            color: #fff;
            border-bottom-right-radius: 4px;
            align-self: flex-end;
            }
            .chatbot .bubble {
            background: #23272e;
            color: #e2e2e2;
            border-bottom-left-radius: 4px;
            align-self: flex-start;
            }
            .timestamp {
            font-size: 0.75em; color: #888; margin: 0 8px;
            align-self: flex-end;
            }
            footer {
            padding: 16px 24px; background: #1a1d22; display: flex; gap: 12px; border-top: 1px solid #222;
            }
            #user-input {
            flex: 1; padding: 10px 16px; border-radius: 20px; border: 1px solid #333;
            background: #23272e; color: #d4d4d4; outline: none; font-size: 1em;
            transition: border 0.2s;
            }
            #user-input:focus { border: 1.5px solid #0b93f6; }
            button {
            padding: 0 24px; border: none; border-radius: 20px; background: #0b93f6;
            color: white; cursor: pointer; font-size: 1em; font-weight: 500; transition: background 0.2s;
            }
            button:disabled { background: #444; cursor: not-allowed; }
            button:hover:not(:disabled) { background: #084d8c; }
            .loading-dot {
            display: inline-block; width: 8px; height: 8px; margin: 0 2px; background: #0b93f6; border-radius: 50%; animation: blink 1s infinite alternate;
            }
            .loading-dot:nth-child(2) { animation-delay: 0.2s; }
            .loading-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes blink {
            0% { opacity: 0.3; }
            100% { opacity: 1; }
            }
        </style>
        </head>
        <body>
        <header>
            <img src="https://cdn.jsdelivr.net/gh/microsoft/vscode-codicons@latest/src/icons/account.svg" alt="Bot" />
            Code Buddy
        </header>
        <div id="chat-history"></div>
        <footer>
            <input type="text" id="user-input" placeholder="Type your message..." autocomplete="off" />
            <button id="send-btn">Send</button>
        </footer>
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <script>
            const vscode = acquireVsCodeApi();
            const chatHistory = document.getElementById('chat-history');
            const input = document.getElementById('user-input');
            const sendBtn = document.getElementById('send-btn');

            window.addEventListener('message', event => {
                if (event.data.type === 'updateHistory') updateChatHistory(event.data.history);
            });

            function getAvatar(sender) {
                return sender === 'user'
                    ? '<div class="avatar">U</div>'
                    : '<div class="avatar bot">G</div>';
            }

            function updateChatHistory(history) {
                chatHistory.innerHTML = '';
                history.forEach(msg => {
                    const row = document.createElement('div');
                    row.className = 'message-row ' + msg.sender;
                    const avatar = document.createElement('div');
                    avatar.innerHTML = getAvatar(msg.sender);
                    const bubble = document.createElement('div');
                    bubble.className = 'bubble';
                    if (msg.content === '...') {
                        bubble.innerHTML = '<span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span>';
                    } else {
                        bubble.innerHTML = msg.sender === 'chatbot'
                            ? marked.parse(msg.content)
                            : marked.parseInline(msg.content);
                    }
                    const timestamp = document.createElement('div');
                    timestamp.className = 'timestamp';
                    timestamp.textContent = msg.timestamp;
                    row.appendChild(avatar);
                    row.appendChild(bubble);
                    row.appendChild(timestamp);
                    chatHistory.appendChild(row);
                });
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }

            sendBtn.addEventListener('click', sendMessage);
            input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

            function sendMessage() {
                const text = input.value.trim();
                if (!text) return;
                input.value = '';
                vscode.postMessage({ type: 'userMessage', content: text });
            }

            // Focus input on load
            setTimeout(() => input.focus(), 200);
        </script>
        </body>
        </html>`;
    }
}