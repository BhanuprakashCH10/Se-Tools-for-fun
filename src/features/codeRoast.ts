import * as vscode from 'vscode';
import axios from 'axios';

// Constants
const GEMINI_API_KEY = "AIzaSyDH7gI4lxFpj5tJob6PQ6tiqGped6fsiqw";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent";
const roastDiagnostics = vscode.languages.createDiagnosticCollection("roast");

export function activateCodeRoast(context: vscode.ExtensionContext) {
    console.log("[DEBUG] Extension activated");

    context.subscriptions.push(roastDiagnostics);

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.roastCode', () => {
            console.log("[DEBUG] Command 'roastCode' triggered");
            confirmAndRoast();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("extension.removeRoast", (uri: vscode.Uri) => {
            console.log("[DEBUG] Command 'removeRoast' triggered");
            roastDiagnostics.delete(uri);
        })
    );

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('*', new RoastFixProvider(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );

    vscode.tasks.onDidEndTaskProcess((event) => {
        const taskName = event.execution.task.name.toLowerCase();
        console.log(`[DEBUG] Task ended: ${taskName}, Exit code: ${event.exitCode}`);

        if (!isCommonBuildOrRunTask(taskName)) {
            console.log("[DEBUG] Task name not related to build/run. Skipping.");
            return;
        }

        const exitCode = event.exitCode;

        if (exitCode === 0) {
            console.log("[DEBUG] Task succeeded. Showing praise.");
            showPraiseOnSuccess();
        } else {
            console.log("[DEBUG] Task failed. Showing smart roast.");
            showSmartRoast(taskName);
        }
    });

    vscode.debug.onDidTerminateDebugSession((session) => {
        const name = session.name.toLowerCase();
        console.log(`[DEBUG] Debug session ended: ${name}`);

        if (isCommonRunConfig(name)) {
            console.log("[DEBUG] Common run config. Showing praise.");
            showPraiseOnSuccess();
        }
    });
    
}

function showSmartRoast(taskName: string) {
    console.log(`[DEBUG] Showing smart roast for task: ${taskName}`);

    const roastMessages: { [key: string]: string[] } = {
        segfault: [
            "Segmentation fault? More like brain segmentation. 🧠💥",
            "Congratulations, you broke the memory! 🧨",
            "You found the core dump. Now go find your will to debug. 💀"
        ],
        compile: [
            "Compilation failed. Just like your hopes. 😶",
            "Syntax error? That's just your typing crying out for help. 🥲",
            "The compiler is begging you to stop. 🤕"
        ],
        runtime: [
            "Runtime errors: the ghost that haunts your logic. 👻",
            "It ran... and then it died. Like your motivation. 🪦",
            "You made it past compilation just to trip on logic. 🧩"
        ],
        default: [
            "You failed. Again. I'm not even surprised. 🤡",
            "Some errors are accidental. Yours seem... consistent. 👀",
            "Even the debugger gave up. 😵‍💫"
        ]
    };

    let type = "default";
    if (taskName.includes("compile") || taskName.includes("build") || taskName.includes("javac") || taskName.includes("g++")) {
        type = "compile";
    } else if (taskName.includes("segfault") || taskName.includes("segmentation")) {
        type = "segfault";
    } else if (taskName.includes("run") || taskName.includes("execute") || taskName.includes("main")) {
        type = "runtime";
    }

    console.log(`[DEBUG] Roast type detected: ${type}`);
    const message = randomPick(roastMessages[type] || roastMessages.default);
    vscode.window.showWarningMessage(message);
}

function isCommonBuildOrRunTask(name: string): boolean {
    const result = [
        "build", "compile", "run", "launch",
        "python", "java", "node", "g++", "javac", "main", "execute"
    ].some(keyword => name.includes(keyword));
    console.log(`[DEBUG] isCommonBuildOrRunTask('${name}') = ${result}`);
    return result;
}

function isCommonRunConfig(name: string): boolean {
    const result = ["run", "launch", "python", "java", "node", "g++", "main"].some(k => name.includes(k));
    console.log(`[DEBUG] isCommonRunConfig('${name}') = ${result}`);
    return result;
}

function confirmAndRoast() {
    console.log("[DEBUG] Showing confirmation message");
    vscode.window.showInformationMessage(
        "Are you sure you want me to do this? You will regret it... 🎭☠️😈😂",
        "No🙈", "Yes😼"
    ).then(selection => {
        console.log(`[DEBUG] User selected: ${selection}`);
        if (selection === "No🙈") {
            vscode.window.showInformationMessage("You made a good choice 😏🫡.");
        } else if (selection === "Yes😼") {
            analyzeAndRoastCode();
        }
    });
}

async function analyzeAndRoastCode() {
    console.log("[DEBUG] analyzeAndRoastCode() called");

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage("No active code to analyze.");
        console.log("[DEBUG] No active editor");
        return;
    }

    const document = editor.document;
    const documentText = document.getText();
    console.log("[DEBUG] Sending code to Gemini");

    const roastResponse = await getRoastFromGemini(documentText);

    if (roastResponse) {
        console.log("[DEBUG] Roast response received");
        applyRoastDiagnostics(document, roastResponse);
    } else {
        console.log("[DEBUG] Roast response is null");
        vscode.window.showErrorMessage("Failed to get a roast from Gemini.");
    }
}

async function getRoastFromGemini(code: string): Promise<string[] | null> {
    console.log("[DEBUG] getRoastFromGemini() sending request...");
    try {
        const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            contents: [{
                role: "user",
                parts: [{ text: `Roast this code with sarcasm in sentences (lines mostly). Each roast should be a separate point and include emojis:\n\n${code}` }]
            }]
        }, {
            headers: { "Content-Type": "application/json" }
        });

        const roastText: string = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("[DEBUG] Roast received:", roastText);
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
    console.log("[DEBUG] Applying roast diagnostics");
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
    console.log("[DEBUG] Diagnostics set");
}

class RoastFixProvider implements vscode.CodeActionProvider {
    provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] | undefined {
        console.log("[DEBUG] provideCodeActions called");
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

function showRoastOnFailure() {
    const failures = [
        "Oops! That didn't go well. Maybe the code needs a hug? 🫠",
        "Still compiling? Don’t worry, even Rome wasn't built in one try. 🏗️",
        "You summoned errors like a true code conjurer. 🔮",
        "You're one in a million... but unfortunately, it's the buggy kind. 😅",
        "Failure builds character... or longer error logs. 🤡"
    ];
    vscode.window.showInformationMessage(randomPick(failures));
}

function showPraiseOnSuccess() {
    const praises = [
        "Look at you, compiling code like a pro! 😎",
        "You finally got it! Miracles do happen! 🌟",
        "Build succeeded. Alert the media. 🚀",
        "No errors. Did you copy this from StackOverflow? 😏",
        "The code gods are pleased... this time. 🧙‍♂️"
    ];
    vscode.window.showInformationMessage(randomPick(praises));
}

function randomPick(arr: string[]) {
    const pick = arr[Math.floor(Math.random() * arr.length)];
    console.log(`[DEBUG] randomPick: ${pick}`);
    return pick;
}
