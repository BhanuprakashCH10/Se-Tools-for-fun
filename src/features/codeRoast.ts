import * as vscode from 'vscode';
import axios from 'axios';

// Constants
const GEMINI_API_KEY = "AIzaSyBWX_ffYY-ijlomFKYb5q1fRgZ2hubEUac";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";
const roastDiagnostics = vscode.languages.createDiagnosticCollection("roast");

export function activateCodeRoast(context: vscode.ExtensionContext) {
    // Add roastDiagnostics to subscriptions for automatic disposal
    context.subscriptions.push(roastDiagnostics);

    // Register the roast command
    const roastCommand = vscode.commands.registerCommand('extension.roastCode', () => {
        confirmAndRoast();
    });
    context.subscriptions.push(roastCommand);

    // Register the remove roast command
    const removeRoastCommand = vscode.commands.registerCommand("extension.removeRoast", (uri: vscode.Uri) => {
        roastDiagnostics.delete(uri);
    });
    context.subscriptions.push(removeRoastCommand);

    // Register the code action provider for fixing roasts
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('*', new RoastFixProvider(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );
}

function confirmAndRoast() {
    vscode.window.showInformationMessage(
        "Are you sure you want me to do this? You will regret it... 🎭☠️😈😂",
        "No🙈", "Yes😼"
    ).then(selection => {
        if (selection === "No🙈") {
            vscode.window.showInformationMessage("You made a good choice 😏🫡.");
        } else if (selection === "Yes😼") {
            analyzeAndRoastCode();
        }
    });
}

async function analyzeAndRoastCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("No active code to analyze.");
        return;
    }

    const document = editor.document;
    const documentText = document.getText();
    const roastResponse = await getRoastFromGemini(documentText);

    if (roastResponse) {
        applyRoastDiagnostics(document, roastResponse);
    } else {
        vscode.window.showErrorMessage("Failed to get a roast from Gemini.");
    }
}

async function getRoastFromGemini(code: string): Promise<string[] | null> {
    try {
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{ role: "user", parts: [{ text: `Roast this code with sarcasm in sentences lines mostly (no of sentence depends on code ), and each roast should be a separate point and emojies too:\n\n${code}` }] }]
        }, {
            headers: { "Content-Type": "application/json" }
        });

        const roastText: string = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        return roastText.split("\n").filter(line => line.trim() !== "");
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            console.error("Error fetching roast:", error.response?.data || error.message);
            vscode.window.showErrorMessage(`API Error: ${error.response?.data?.error?.message || error.message}`);
        } else {
            console.error("Unknown error:", error);
            vscode.window.showErrorMessage("An unknown error occurred while fetching roast.");
        }
        return null;
    }
}

function applyRoastDiagnostics(document: vscode.TextDocument, roasts: string[]) {
    roastDiagnostics.clear();

    let diagnostics: vscode.Diagnostic[] = [];
    const documentText = document.getText().split("\n");
    const lastLineIndex = documentText.length - 1;
    const emojis = ["😂", "🔥", "🤦‍♂️", "🎭", "😵", "🐍", "🤡", "💀", "🧐", "👀"];

    for (let i = 0; i < roasts.length; i++) {
        let roast = roasts[i].replace(/^\d+\.\s*/, "");
        let emoji = emojis[i % emojis.length];
        roast = roast.replace(/\*\*(.*?)\*\*/g, "$1");

        const keywordMatch = roast.match(/`([^`]+)`/);
        let lineIndex = -1;

        if (keywordMatch) {
            const keyword = keywordMatch[1];
            lineIndex = documentText.findIndex(line => line.includes(keyword));
        }

        if (lineIndex === -1) {
            lineIndex = lastLineIndex;
        }

        const lineText = documentText[lineIndex];
        const endPosition = new vscode.Position(lineIndex, lineText.length);
        const range = new vscode.Range(endPosition, endPosition);

        const diagnostic = new vscode.Diagnostic(
            range,
            `${emoji} ${roast}`,
            vscode.DiagnosticSeverity.Information
        );
        diagnostic.code = "fixRoast";
        diagnostics.push(diagnostic);
    }

    roastDiagnostics.set(document.uri, diagnostics);
}

class RoastFixProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
        const fixActions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.code === "fixRoast") {
                const fix = new vscode.CodeAction("Fix It", vscode.CodeActionKind.QuickFix);
                fix.diagnostics = [diagnostic];
                fix.command = {
                    title: "Remove roast",
                    command: "extension.removeRoast",
                    arguments: [document.uri]
                };
                fixActions.push(fix);
            }
        }

        return fixActions;
    }
}