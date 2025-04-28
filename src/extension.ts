import * as vscode from 'vscode';
import { activateCodeRoast } from './features/codeRoast';
import { activateBreakTime } from './features/breakTime/breakTime';
import { activateCompilationTracker } from './features/compilationTracker';
import { Chatbot } from './features/chatbot';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "codebuddy" is now active!');
    activateCodeRoast(context);
    activateBreakTime(context);
    activateCompilationTracker(context);
    const chatbot = new Chatbot(context);
    const chatCommand = vscode.commands.registerCommand('extension.openChatbot', () => {
        chatbot.openChatPanel();
    });
    context.subscriptions.push(chatCommand);

}

export function deactivate() {
    // No specific cleanup needed since disposables are handled by context.subscriptions
}