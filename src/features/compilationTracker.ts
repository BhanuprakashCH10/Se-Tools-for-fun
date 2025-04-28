import vscode from 'vscode';
import os from 'os';

import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let senderId: string | undefined;
let receiverIds: string[] = [];
let totalGreetings: number = 0;


let panel: vscode.WebviewPanel | undefined;
let totalCodeSmell: string | undefined = "";
let checkboxHtml: string | undefined = "";
let tableheader = `<tr><th>FileName</th><th>Line #</th><th>Observations</th></tr>`;
let tableRows: string | undefined = "";
let rulesets: string | undefined = "";
let savedSelections: string[] | undefined = undefined;
let processingStatus: string | undefined = "";

let currentPanel: vscode.WebviewPanel | undefined;
let videoCount = 0;
let totalSongs: number;
let songIndex: number;
let userIds: string[] = [];

let tableheader_CE = `<tr><th>Date</th><th>LOC</th><th>Errors</th><th>Avg (Err/LOC)</th><th>Momentum</th></tr>`;
let tableRows_CE: string | undefined = "";
let analysedData_CE: string | undefined = "";
let panel_CE: vscode.WebviewPanel | undefined;
let panel_GT: vscode.WebviewPanel | undefined;

export function activateCompileErrors(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");
    senderId = username;

    let javaCodeSmellAnalyzer = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    javaCodeSmellAnalyzer.text = `$(play) Codesmell`;
    javaCodeSmellAnalyzer.tooltip = "Analyze Java Code Smell";
    javaCodeSmellAnalyzer.command = "extension.analyzeJavaCodeSmell";
    javaCodeSmellAnalyzer.show();
  

    let compileCode = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    compileCode.text = `$(play) Compile`;
    compileCode.tooltip = "Show coding efficiency through Compilation errors";
    compileCode.command = "extension.countCompilationDetails";
    compileCode.show();


    // detect the termination of degub/compilation 
    vscode.debug.onDidTerminateDebugSession( async (session) => {

        let totalErrors = await storeCompilationDetails(context);
        if (totalErrors > 0) {

            displayCompilationHistory(context);
        }


    });

    // Register the command to count lines of code and compilation errors
    let disposable = vscode.commands.registerCommand('extension.countCompilationDetails', async  () => {

        if (panel_CE) {
            panel_CE.reveal(vscode.ViewColumn.One);       
        }
        else{
            panel_CE = vscode.window.createWebviewPanel('Compilation-Errors', 'Compilation-Errors', vscode.ViewColumn.One, { enableScripts: true });
        }

            let totalErrors = await storeCompilationDetails(context);
            if (totalErrors > 0) {
                displayCompilationHistory(context);
            }

    });

    context.subscriptions.push(compileCode, disposable);

	// Register the command to clear the workspaceState for compilationData
	let clearDisposable = vscode.commands.registerCommand('extension.clearSpecificWorkspaceState', () => {
        // Clear a specific workspaceState key
        context.workspaceState.update('compilationData', []); 
      //  storedData = [];
      //  storedData.length = 0;

        vscode.window.showInformationMessage(`Workspace state for 'compilationData' has been cleared.`);
    });

	context.subscriptions.push(clearDisposable);

    // Register the command to retrieve and display the last 20 compilation details
    let retrieveDisposable = vscode.commands.registerCommand('extension.retrieveLastCompilationDetails', () => {

        displayCompilationHistory(context);

    });

    context.subscriptions.push(retrieveDisposable);

    // Event listener for when a debugging session ends
    const buildTaskListener = vscode.tasks.onDidEndTask(async (event) => {
        if (event.execution.task.name === 'build') { // Check if it's a build task (you can customize task name)
            const finishTime = new Date().toLocaleString(); // Get the current date and time
            vscode.window.showInformationMessage(`Build completion time : ${finishTime}`);
        }
    });

    context.subscriptions.push(buildTaskListener);


    let checkboxinput = vscode.commands.registerCommand('extension.analyzeJavaCodeSmell', () => {
        // If panel already exists, reveal it and return
        if (panel) {
            panel.reveal(vscode.ViewColumn.One);       
        }
        else{
            panel = vscode.window.createWebviewPanel(
                'Code-Smell', 'Code-Smell', vscode.ViewColumn.One, { enableScripts: true });
        }  
        rulesets = getPMDOptions(context);
        generateTableHtml_JCS(context, "");
    
        // Handle messages from the WebView
        panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'run') {
                    tableRows = "";
                    const workspaceState = context.workspaceState;
                    workspaceState.update('selectedOptions', message.selected);
                    const selectedWithValues = message.selected.map((key: string) => `${key},`);
                    rulesets = getPMDOptions(context);
                    totalCodeSmell = "";
                    showCodeSmell(context);
                }
            },
            undefined,
            context.subscriptions
        );
            // Handle webview disposal (when closed)
            panel.onDidDispose(() => {
                panel = undefined; // Reset the reference
            }, null, context.subscriptions);
        });
    
        context.subscriptions.push(javaCodeSmellAnalyzer, checkboxinput);



}

  async function showCodeSmell(context: vscode.ExtensionContext){

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showInformationMessage('No workspace found!');
        return 0;
    }        
    const folderPath = workspaceFolders[0].uri.fsPath;

    await callAllFiles(context, folderPath);  

}


async function callAllFiles(context: vscode.ExtensionContext, dirPath: string) {
    let totalLines = 0;

    //processingStatus = "Processing Started...";
    //vscode.window.showInformationMessage(processingStatus);
    tableRows = "";


    rulesets = getPMDOptions(context);
    if (rulesets.length < 1){
        tableRows = "";
        generateTableHtml_JCS(context, "");
        processingStatus = "No options selected";
        vscode.window.showInformationMessage(processingStatus);
        return;
    }

    // Recursively read the directory and its files
    const files = await readDir(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);

        // If it's a directory, call the function recursively
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            await callAllFiles(context, filePath);
        } 
        else if (isCodeFile(filePath)) {
            await CheckCodeSmell(context, filePath);
        }
    }

}

async function CheckCodeSmell(context: vscode.ExtensionContext, filePath: string) {

    const pmdPath = 'pmd'; 


    let outputtext = "";
    let issues: string[] = [];
    const command = `${pmdPath} check -d ${filePath} -R ${rulesets} -f text`;
   // vscode.window.showInformationMessage(command);
        exec(command, (error, outputtext, stderr) => {
            if (error) {
                if (!stderr.includes ('[WARN]')) {
                vscode.window.showErrorMessage(`Unable to detect Code Smell. PMD not found. Please install PMD from https://pmd.github.io/ and configure PATH variable.`);
                return;
                }
            }
            if (outputtext.length > 0)
            {
              //  totalCodeSmell = totalCodeSmell + outputtext;
                totalCodeSmell = outputtext;
                processingStatus = "Code Smell detection process Completed.";        
                vscode.window.showInformationMessage(processingStatus);        
                if(totalCodeSmell.length > 0){

                    generateTableHtml_JCS(context, filePath);
                    const lines = totalCodeSmell.split('\n');
                    // Set the HTML content for the Webview

                }
                issues =  totalCodeSmell.split('\n');             
            }
            if (issues.length === 0) {
                processingStatus = "Code Smell detection process Completed.";
                tableRows = "";
                generateTableHtml_JCS(context, "");
                vscode.window.showInformationMessage(processingStatus);
            } 
        });
            
 }

async function generateTableHtml_JCS(context: vscode.ExtensionContext, filepath: string) {
    const rows = (totalCodeSmell ?? "").trim().split('\n').map(line => line.split(/:+/)); // Splits by :
    tableRows = tableRows + rows.map(row => {
        let col1 = row.length > 0 ? row[0] : "";
        let col2 = row.length > 2 ? row[1] : "";
        let col3 = row.length > 2 ? row[2] : "";
        let col4 = row.length > 2 ? row[3] : "";
        let col5 = row.length > 2 ? row[4] : "";
        if((col1.length > 0) && (col5.length === 0))
        {
            col5 = col1;
            col1 = filepath;
        }

        return `<tr><td>${col1}${col2}</td><td>${col3}</td><td>${col5}</td></tr>`;
    }).join('');

    if (panel) {                        
        panel.reveal(vscode.ViewColumn.One);      
    } else {
        panel = vscode.window.createWebviewPanel('Code-Smell', 'Code-Smell', vscode.ViewColumn.One, { enableScripts: true });
    }
    panel.webview.html = getWebviewContent_JCS(context);
}

// Define checkboxes with corresponding values
const optionValues: { [key: string]: string } = {
    "Best Practices": "category/java/bestpractices.xml",
    "Code Style": "category/java/codestyle.xml",
    "Design": "category/java/design.xml",
    "Documentation": "category/java/documentation.xml",
    "Default": "rulesets/java/quickstart.xml",
    "Error Prone": "category/java/errorprone.xml",
    "Multithread":  "category/java/multithreading.xml",
    "Performance": "category/java/performance.xml",
    "Security": "category/java/security.xml"

};

function getPMDOptions(context: vscode.ExtensionContext): string {
    const workspaceState = context.workspaceState;
    savedSelections = workspaceState.get<string[]>('selectedOptions', []);
    const selectedWithValues = savedSelections.map((key: string) => `${optionValues[key] || 'Unknown Value'},`);

    checkboxHtml = Object.keys(optionValues).map(option => {
        const checked = (savedSelections || []).includes(option) ? 'checked' : '';
        return `<label><input type="checkbox" value="${option}" ${checked}> ${option}</label><br>`;
    }).join('');

    return selectedWithValues.join('');
}

function getWebviewContent_JCS(context: vscode.ExtensionContext){
    return `<!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
            .left-panel, .right-panel { padding: 4px; }
            .left-panel { width: 15%; float: left; height: 73vh; border-right: 1px solid grey; display: flex; flex-direction: column; }
            .right-panel { width: 85%; position: relative; padding: 1px; display: flex; flex-direction: column; align-items: center; }
            .checkboxes { padding: 10px; }
            .checkbox-group { margin-bottom: 15px; }
            button { padding: 8px 15px; background: #007acc; color: white; border: none; cursor: pointer; }
            button:hover { background: #005f99; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid white; padding: 6px; text-align: left; }
            th { font-size: 20px; color: green; background-color: black; } /* Yellow text on black background */
        </style>
    </head>
    <body>
        <div class="left-panel">
            <div class="checkboxes">
                <h3>Select Options:</h3>
                <div class="checkbox-group">${checkboxHtml}</div>
                <button onclick="invokeCodeSmellCheck()">Analyse Code</button>
            </div>
        </div>
        <div class="right-panel">
                <h3>Code Smell Analysis</h3>
                <table>
                <tr><th>${tableheader}</th></tr>
                ${tableRows}
                </table>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            function invokeCodeSmellCheck(){
                const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
                const selectedValues = Array.from(checkboxes).map(cb => cb.value);
                vscode.postMessage({ command: 'run', selected: selectedValues});
            }
        </script>
    </body>
    </html>`;
}

/*
async function readDir(dirPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}
    */

function isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.ts', '.html', '.css', '.cpp', '.java', '.py', '.dart', '.c'].includes(ext);
}


interface CompilationDetails {
    lineCount: number;
    errorCount: number;
    errorAvg: number;
    compileDate: string;
    progress: string;
    newline: string;
}

async function generateTableHtml(context: vscode.ExtensionContext) {

    const rows = (analysedData_CE ?? "").trim().split('\n').map(line => line.split(/,+/)); // Splits by :
    tableRows_CE = tableRows_CE + rows.map(row => {
        let col1 = row.length > 0 ? row[0] : "";
        let col2 = row.length > 2 ? row[1] : "";
        let col3 = row.length > 2 ? row[2] : "";
        let col4 = row.length > 2 ? row[3] : "";
        let col5 = row.length > 2 ? row[4] : "";
        let col6 = row.length > 2 ? row[5] : "";
        return `<tr><td>${col4} ${col5}</td><td>${col1}</td><td>${col2}</td><td>${col3}</td><td>${col6}</td></tr>`;
    }).join('');

  //  panel_CE.webview.html = getWebviewContent_CE(context);
}

async function storeCompilationDetails(context: vscode.ExtensionContext): Promise<number> {
    let storedData: CompilationDetails[] = context.workspaceState.get<CompilationDetails[]>('compilationData', []) || [];

    if (!Array.isArray(storedData)) {
        context.workspaceState.update('compilationData', []); // Initialize as an empty array if undefined or incorrect type
    }

	const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showInformationMessage('No workspace found!');
            return 0;
        }

        const folderPath = workspaceFolders[0].uri.fsPath;

        const lineCount = await countLinesOfCode(folderPath);

        // Step 2: Count compilation errors in the workspace
        const errorCount = countCompilationErrors();
        let progress = "";

        if(errorCount !== -1){

            let errorAvg = (errorCount/lineCount) * 100;
            errorAvg = parseFloat(errorAvg.toFixed(2));

            // Step 3: Get the current date and time of compilation
            const compileDate = new Date().toLocaleString();

            if (storedData.length > 0){
                if (Number(JSON.stringify(storedData[0].errorAvg)) > errorAvg){
                    progress = "👍";
                }
                else if (Number(JSON.stringify(storedData[0].errorAvg)) === errorAvg){
                    progress = "👍=👍";
                }
                else{
                    progress = "👎";
                }
            }
            else{
                progress = "😊";
            }

            if (lineCount > 0) {
                // Step 4: Create the new compilation data entry
                const newCompilationData: CompilationDetails = {
                    lineCount,
                    errorCount,
                    errorAvg,
                    compileDate,
                    progress,
                    newline: "\n"
                };
    

                if (storedData.length > 19) {
                    storedData.pop(); // Remove the first (oldest) entry if we have more than 20
                }
                // Step 5: Add the new entry to the stored data (keeping only the last 20 entries)
                // Push new value to the front of the array (stack behavior)
                context.workspaceState.update('compilationData', []); 
                await context.workspaceState.update('compilationData', undefined);
                await context.workspaceState.update('storedSelections', undefined);
                await context.workspaceState.update('lastSaved', undefined);
                storedData.unshift(newCompilationData);
               // vscode.window.showInformationMessage(JSON.stringify(storedData));
    
                // Store the updated compilation data back into workspaceState
                context.workspaceState.update('compilationData', storedData);
            }   
   
        }
        else {
            vscode.window.showInformationMessage(`Vscode is Busy. Please rerun after vscode is ready`);
        }

        return storedData.length;

}

async function displayCompilationHistory(context: vscode.ExtensionContext) {


    const storedCompilationData = context.workspaceState.get<CompilationDetails[]>('compilationData', []);
    if (storedCompilationData.length === 0) {
        vscode.window.showInformationMessage('No compilation data available.');
        return;
    }

    
    // Show the last 20 compilation details (or all if fewer than 20)
    let detailsMessage = storedCompilationData
        .map((data, index) => `${data.lineCount}, ${data.errorCount}, ${data.errorAvg}, ${data.compileDate}, ${data.progress}, ${data.newline}`)
        .join("\n");
    
    tableRows_CE = "";
    analysedData_CE = detailsMessage;
    generateTableHtml(context);

   // vscode.window.showInformationMessage(`Last Compilation Details:\n${detailsMessage}`);

    // Create a new Webview panel_CE
    if (panel_CE) {
        panel_CE.reveal(vscode.ViewColumn.One);       
    }
    else{
        panel_CE = vscode.window.createWebviewPanel(
            'Compilation-Errors', 'Compilation-Errors', vscode.ViewColumn.One, { enableScripts: true });
    }

    // Set the HTML content for the Webview
    panel_CE.webview.html = getWebviewContent_CE(detailsMessage);

    // Optionally, you can listen to Webview events, like on close or on message
         // Handle webview disposal (when closed)
         panel_CE.onDidDispose(() => {
            panel_CE = undefined; // Reset the reference
        }, null, context.subscriptions);
    /*
    vscode.window.showInformationMessage(`Last Compilation Details:\n${detailsMessage}`, 'OK').then((selection) => {
        if (selection === 'OK') {
            // The "OK" button was clicked, the message will be closed automatically
            console.log("OK button clicked");
        }
    });
    */


}


// Function to count the compilation errors in the workspace
function countCompilationErrors(): number {

    let diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
    // Listen for when an editor becomes active and then check diagnostics


    //    if (vscode.window.activeTextEditor) {
           diagnostics = vscode.languages.getDiagnostics();   
           if(diagnostics.length > 0){
                let errorCount = 0;
               // vscode.window.showInformationMessage(JSON.stringify(diagnostics));
    
                // Loop through each diagnostic collection and count errors       
                diagnostics.forEach(([uri, diagnosticArray]) => {
                    diagnosticArray.forEach((diagnostic) => {
                        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
                            errorCount++;
                        }
                    });
                });  
                return errorCount;   
           }
    
    //    }




    return -1;
}

async function countLinesOfCode(dirPath: string): Promise<number> {
    let totalLines = 0;

    // Recursively read the directory and its files
    const files = await readDir(dirPath);
    for (const file of files) {
        const filePath = path.join(dirPath, file);

        // If it's a directory, call the function recursively
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            totalLines += await countLinesOfCode(filePath);
        } else if (isCodeFile_CE(filePath)) {
            totalLines += await countLinesInFile_CE(filePath);
        }
    }

    return totalLines;
}

async function readDir(dirPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) {
                reject(err);
            } else {
                resolve(files);
            }
        });
    });
}

function isCodeFile_CE(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.ts', '.html', '.css', '.cpp', '.java', '.py', '.dart', '.c'].includes(ext);
}

async function countLinesInFile_CE(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        let lines = 0;
        const stream = fs.createReadStream(filePath, 'utf8');
        
        stream.on('data', (chunk) => {
            lines += chunk.toString('utf8').split('\n').length;
        });

        stream.on('end', () => {
            resolve(lines);
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}


// Function to return the HTML content for the Webview
function getWebviewContent_CE(detailsMessage: string): string {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Current Date</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
            .panel_CE { width: 100%; position: relative; padding: 1px; display: flex; flex-direction: column; align-items: center; }
            .date {
                font-size: 24px;
                font-weight: bold;
            }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid white; padding: 4px; text-align: center; }
            td { font-size: 16px; }
            th { font-size: 18px; color: green; background-color: black; } /* Yellow text on black background */
        </style>
    </head>
    <body>
        <div class="panel_CE">   
            <h1>Compilation History</h1><br>
            <table>
            <tr><th>${tableheader_CE}</th></tr>
            ${tableRows_CE}
            </table>
        </div>

    </body>
    </html>
    `;
}


    

function deactivate() {}

module.exports = { activateCompileErrors, deactivate };
