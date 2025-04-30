import * as vscode from 'vscode';
import { activateCodeRoast } from './features/codeRoast';
import { activateBreakTime } from './features/breakTime/breakTime';
import { activateCompileErrors } from './features/compilationTracker';
import { activateAppreciate } from './features/appreciate';
import { Chatbot } from './features/chatbot';
import { activateTypingSpeed } from './features/typingSpeed/typingSpeed';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "codebuddy" is now active!');
    activateCodeRoast(context);
    activateBreakTime(context);
    activateCompileErrors(context);
    activateAppreciate(context);
    const chatbot = new Chatbot(context);
    activateTypingSpeed(context);
    const chatCommand = vscode.commands.registerCommand('extension.openChatbot', () => {
        chatbot.openChatPanel();
    });
    context.subscriptions.push(chatCommand);

}

export function deactivate() {
    // No specific cleanup needed since disposables are handled by context.subscriptions
}