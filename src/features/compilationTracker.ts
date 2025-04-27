import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Module-level variables
let tableheader = `<tr><th>Date</th><th>LOC</th><th>Errors</th><th>Avg (Err/LOC)</th><th>Momentum</th></tr>`;
let tableRows = "";
let analysedData = "";
let panel: vscode.WebviewPanel | undefined;

export function activateCompilationTracker(context: vscode.ExtensionContext) {
    // Create and show the status bar item
    let compileCode = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    compileCode.text = `$(play) Compile`;
    compileCode.tooltip = "Show coding efficiency through Compilation errors";
    compileCode.command = "extension.countCompilationDetails";
    compileCode.show();

    // Initialize or reveal the webview panel
    if (panel) {
        panel.reveal(vscode.ViewColumn.One);
    } else {
        panel = vscode.window.createWebviewPanel(
            'compilationHistory',
            'Compilation History',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
    }

    // Listen for debug session termination
    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession(async () => {
            let totalErrors = await storeCompilationDetails(context);
            if (totalErrors > 0) {
                displayCompilationHistory(context);
            }
        })
    );

    // Register command to count compilation details
    let disposable = vscode.commands.registerCommand('extension.countCompilationDetails', async () => {
        let totalErrors = await storeCompilationDetails(context);
        if (totalErrors > 0) {
            displayCompilationHistory(context);
        }
    });
    context.subscriptions.push(compileCode, disposable);

    // Register command to clear workspace state
    let clearDisposable = vscode.commands.registerCommand('extension.clearSpecificWorkspaceState', () => {
        context.workspaceState.update('compilationData', []);
        vscode.window.showInformationMessage(`Workspace state for 'compilationData' has been cleared.`);
    });
    context.subscriptions.push(clearDisposable);

    // Register command to retrieve compilation details
    let retrieveDisposable = vscode.commands.registerCommand('extension.retrieveLastCompilationDetails', () => {
        displayCompilationHistory(context);
    });
    context.subscriptions.push(retrieveDisposable);

    // Listen for build task completion
    context.subscriptions.push(
        vscode.tasks.onDidEndTask(async (event) => {
            if (event.execution.task.name === 'build') {
                const finishTime = new Date().toLocaleString();
                vscode.window.showInformationMessage(`Build completion time: ${finishTime}`);
            }
        })
    );

    // Handle webview disposal
    if (panel) {
        panel.onDidDispose(() => {
            panel = undefined;
        }, null, context.subscriptions);
    }
}

async function storeCompilationDetails(context: vscode.ExtensionContext): Promise<number> {
    let storedData = context.workspaceState.get('compilationData', []) as any[];
    if (!Array.isArray(storedData)) {
        storedData = [];
        context.workspaceState.update('compilationData', storedData);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showInformationMessage('No workspace found!');
        return 0;
    }

    const folderPath = workspaceFolders[0].uri.fsPath;
    const lineCount = await countLinesOfCode(folderPath);
    const errorCount = countCompilationErrors();

    if (errorCount === -1) {
        vscode.window.showInformationMessage('Yayy! No compilation errors found.');
        return storedData.length;
    }

    if (lineCount > 0) {
        const errorAvg = parseFloat(((errorCount / lineCount) * 100).toFixed(2));
        const compileDate = new Date().toLocaleString();
        let progress = storedData.length > 0
            ? (storedData[0].errorAvg > errorAvg ? '👍' : storedData[0].errorAvg === errorAvg ? '👍=👍' : '👎')
            : '😊';

        const newCompilationData = { lineCount, errorCount, errorAvg, compileDate, progress, newline: '\n' };
        if (storedData.length > 19) {storedData.pop();}
        storedData.unshift(newCompilationData);
        context.workspaceState.update('compilationData', storedData);
    }

    return storedData.length;
}

async function displayCompilationHistory(context: vscode.ExtensionContext) {
    const storedCompilationData = context.workspaceState.get('compilationData', []) as any[];
    if (storedCompilationData.length === 0) {
        vscode.window.showInformationMessage('No compilation data available.');
        return;
    }

    const detailsMessage = storedCompilationData
        .map(data => `${data.lineCount},${data.errorCount},${data.errorAvg},${data.compileDate},${data.progress},${data.newline}`)
        .join('\n');
    tableRows = "";
    analysedData = detailsMessage;
    await generateTableHtml();

    if (!panel) {
        panel = vscode.window.createWebviewPanel(
            'compilationHistory',
            'Compilation History',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        panel.onDidDispose(() => panel = undefined, null, context.subscriptions);
    }
    panel.webview.html = getWebviewContent();
    panel.reveal(vscode.ViewColumn.One);
}

async function generateTableHtml() {
    const rows = (analysedData ?? "").trim().split('\n').map(line => line.split(/,+/));
    tableRows = rows.map(row => {
        return `<tr><td>${row[3] || ''} ${row[4] || ''}</td><td>${row[0] || ''}</td><td>${row[1] || ''}</td><td>${row[2] || ''}</td><td>${row[5] || ''}</td></tr>`;
    }).join('');
}

function countCompilationErrors(): number {
    const diagnostics = vscode.languages.getDiagnostics();
    if (diagnostics.length === 0) {return -1;}

    let errorCount = 0;
    diagnostics.forEach(([, diagnosticArray]) => {
        errorCount += diagnosticArray.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
    });
    return errorCount;
}

async function countLinesOfCode(dirPath: string): Promise<number> {
    let totalLines = 0;
    const files = await readDir(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            totalLines += await countLinesOfCode(filePath);
        } else if (isCodeFile(filePath)) {
            totalLines += await countLinesInFile(filePath);
        }
    }
    return totalLines;
}

async function readDir(dirPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => err ? reject(err) : resolve(files));
    });
}

function isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.ts', '.html', '.css', '.cpp', '.java', '.py', '.dart', '.c'].includes(ext);
}

async function countLinesInFile(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let lines = 0;
        const stream = fs.createReadStream(filePath, 'utf8');
        stream.on('data', chunk => lines += chunk.toString('utf8').split('\n').length);
        stream.on('end', () => resolve(lines));
        stream.on('error', err => reject(err));
    });
}

function getWebviewContent(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compilation History</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
        .panel { width: 100%; padding: 1px; display: flex; flex-direction: column; align-items: center; }
        .date { font-size: 24px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid white; padding: 4px; text-align: center; }
        td { font-size: 16px; }
        th { font-size: 18px; color: green; background-color: black; }
    </style>
</head>
<body>
    <div class="panel">
        <h1>Compilation History</h1><br>
        <table>
            ${tableheader}
            ${tableRows}
        </table>
    </div>
</body>
</html>`;
}