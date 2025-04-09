import vscode from 'vscode';
import os from 'os';

let currentPanel: vscode.WebviewPanel | undefined;
let videoCount = 0;
let totalSongs: number;
let songIndex: number;
let userIds: string[] = [];

function activate(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");

    let takeAbreakExtension = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    takeAbreakExtension.text = `$(play) BreakTime`;
    takeAbreakExtension.tooltip = "Take a Break...Relax";
    takeAbreakExtension.command = "seExtension.takeABreak";
    takeAbreakExtension.show();
 
	let getVideoListDisposable = vscode.commands.registerCommand('seExtension.takeABreak', async () => {
        await getVideoCount();
        // Fetch all users
        await fetchAllUsers();
      // Retrieve usersList from global state (default empty array if not found)
      const usersList: string[] = context.globalState.get("usersList", []);
      if (!usersList.includes(username)) {
        const success = await registerUser(username);
        if (success) {
          usersList.push(username);
          await context.globalState.update("usersList", usersList);
        }
      }

       fetchAndDisplayVideos(context, username);

    });

    context.subscriptions.push(takeAbreakExtension, getVideoListDisposable);
}

async function getVideoCount()
{
    const url = "https://animateinput.s3.ap-south-1.amazonaws.com/videocount.txt";

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const text = await response.text();
        const numberMatch = text.match(/\d+/); // Extract first number from file

        if (numberMatch) {
            totalSongs = parseInt(numberMatch[0], 10);
        } else {
            totalSongs = 0;
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error fetching file: ${error.message}`);
        totalSongs = 0;
    }
}

async function fetchAllUsers() {

    const getAllUsersApiURL = "https://w0jnm95oyc.execute-api.ap-south-1.amazonaws.com/animal/userlist";
    const jsonBody = {};

    try {
        const response = await fetch(getAllUsersApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify(jsonBody)
        });
        
        const result = await response.json() as { body?: string };

        
        
        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                userIds = parsedBody.map(item => item.userid).filter(id => id);
            }
        }

    } catch (error) {
        const errorMessage = (error as any).message || "Unknown error";
        vscode.window.showErrorMessage("API request failed: " + errorMessage);
    }
}

async function fetchAndDisplayVideos(context: vscode.ExtensionContext, username?: string) {


  //  const getMsgsApiURL = "https://pvu9i3cor7.execute-api.ap-south-1.amazonaws.com/prod/getvideos";
    const getMsgsApiURL = "https://qb1n4uw5b6.execute-api.ap-south-1.amazonaws.com/animal/getvideowithmsg";
    const jsonBody = { "userid": username };

    // If currentPanel already exists, reveal it and return
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);       
    }
    else{
        currentPanel = vscode.window.createWebviewPanel('apiResponse', 'API Response', vscode.ViewColumn.One, { enableScripts: true });
    }
    
    try {
        const response = await fetch(getMsgsApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify(jsonBody)
        });
        
        const result = await response.json() as { body?: string };
    let messageIds: { id: string; msg: string; lang: string }[] = [];

        
/*        
        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                messageIds = parsedBody.map(item => item.messageid).filter(id => id);
                messageTexts = parsedBody.map(item => item.messagetext).filter(id => id);
            }
        }
*/

        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                messageIds = parsedBody.map(item => ({ id: item.messageid, msg: item.messagetext, lang:item.language }));
            }
        }

        if (messageIds.length <= videoCount) {
            vscode.window.showInformationMessage("No New Videos avilable.");
        }
        else{
            videoCount = messageIds.length;
        }
        const watchedVideos = new Set<string>(context.globalState.get<string[]>("watchedVideos", []));
   

        if (currentPanel) {
            currentPanel.webview.html = getWebviewContent(messageIds.map(item => ({ id: item.id, msg: item.msg, lang:item.lang })), watchedVideos, username || "Guest", totalSongs);
        }
        
        currentPanel.webview.onDidReceiveMessage(            
            (message) => {
                if (message.command === 'playVideo') {
                    watchedVideos.add(message.selectedId);
                    context.globalState.update("watchedVideos", Array.from(watchedVideos));
                } 
                else if (message.command === 'refreshVideos') {
                    fetchAndDisplayVideos(context, username); // Refresh video list
                }
                else if (message.command === 'noSelection') {
                    vscode.window.showInformationMessage("Please select a Video to Play");
                }
                else if (message.command === 'emptySendToUser') {
                    vscode.window.showInformationMessage("Please select a user to send message.");
                }
                else if (message.command === 'emptyMessage') {
                    vscode.window.showInformationMessage("Please enter a message to Send.");
                }
                else if (message.command === 'reset') {
                    if (currentPanel) {
                        currentPanel.reveal(vscode.ViewColumn.One);       
                    }
                    else{
                        currentPanel = vscode.window.createWebviewPanel('apiResponse', 'API Response', vscode.ViewColumn.One, { enableScripts: true });
                    }
                    if (currentPanel) {
                        currentPanel.webview.html = getWebviewContent(messageIds.map(item => ({ id: item.id, msg: item.msg, lang:item.lang })), watchedVideos, username || "Guest", totalSongs);
                    }
                }
            },
            undefined,
            context.subscriptions
        );
        // Handle webview disposal (when closed)
        currentPanel.onDidDispose(() => {
            currentPanel = undefined; // Reset the reference
        }, null, context.subscriptions);
    } catch (error) {
        const errorMessage = (error as any).message || "Unknown error";
        vscode.window.showErrorMessage("API request failed: " + errorMessage);
    }
}


function getWebviewContent(messageIds: { id: string; msg: string; lang:string }[],watchedVideos: Set<string>, username: string, songsCount: number): string {

    const values = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, -40000];
    const shuffledValues = values.sort(() => Math.random() - 0.5);
    let gameResult: string | undefined;

    const videoURL = "https://animateoutput.s3.ap-south-1.amazonaws.com/";
    const sendMsgApiURL = "https://9xbaecf7o2.execute-api.ap-south-1.amazonaws.com/prod/callanimal";

    const options = userIds
    .map((user) => `<li onclick="selectUser('${user}')">${user}</li>`)
    .join("");

    let sortedMessageIds = Array.from(messageIds).sort((a, b) => b.id.localeCompare(a.id));
    const radioButtons = sortedMessageIds.map(({id, msg, lang}) => {
        const isWatched = watchedVideos.has(id);
        return `
            <input type="radio" name="messageid" value="${msg} [${lang}]" id="${id}" msg="${msg}">
            <label for="${id}" style="color: ${isWatched ? 'grey' : 'white'}; font-weight: ${isWatched ? 'normal' : 'bold'};">${id}</label><br>
        `;
    }).join("");

    return `<!DOCTYPE html>
    <html>
    <head>
        <title>Submit Message</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
            .header { position: absolute; top: 10px; right: 20px; font-size: 14px; color: lightgray; }
            .left-currentPanel, .right-currentPanel { padding: 4px; }
            .scrollable-list {flex-grow: 1; overflow-y: auto;}

            .left-currentPanel { width: 20%; float: left; height: 75vh; border-right: 2px solid grey; display: flex; flex-direction: column; }
            .center-currentPanel { width: 47%; position: relative; padding: 5px; border-right: 2px solid grey; display: flex; flex-direction: column; align-items: center; }
            .right-currentPanel { width: 33%; position: relative; padding: 5px; display: flex; flex-direction: column; align-items: center; }
            select { width: 100px; margin-left: 10px; }
            .button-container { display: flex; gap: 10px; justify-content: left; background: black; padding: 8px; }
            
            .left-currentPanel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; } 
            .center-currentPanel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; }         

            #videoContainer {
                position: relative;
                width: 420px;
                height: 320px;
                border: 3px solid #007acc;
                border-radius: 8px;
                resize: both;
                overflow: hidden;
                background-color: black;
            }
            video {
                width: 100%;
                height: 100%;
                object-fit: contain;
            }
            #dragHandle {
                width: 100%;
                height: 20px;
                background: #007acc;
                cursor: move;
                text-align: center;
                color: white;
                font-weight: bold;
            }
            textarea {
                width: 95%;
                max-width: 420px;
                height: 60px;
                margin-top: 10px;
                border: 1px solid #007acc;
                border-radius: 8px;
                padding: 3px;
                background-color: #222;
                color: white;
                resize: none;
            }
            button:hover { background-color: #005f99; }

            .dropdown-container { position: relative; display: inline-block; border: 1px solid #007acc; }
            .dropdown-input { width: 180px; padding: 6px; border: 1px solid #007acc; border-radius: 5px; }
            .dropdown-list {
                position: absolute;
                width: 200px;
                max-height: 150px;
                overflow-y: auto;
                border: 1px solid #007acc;
                border-top: none;
                background: grey;
                display: none;
                z-index: 1000;
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .dropdown-list li {
                padding: 2px;
                cursor: pointer;
                color: black;  /* Ensure text is black */
                background: grey; /* Ensure background is white */
            }
            .dropdown-list li:hover {
                background: #f0f0f0;
            }


            .right-currentPanel {
                display: flex;
                flex-direction: column;
                align-items: center;
                flex-grow: 1;
                padding: 10px;
            }
            .right-currentPanel  .header {
                width: 100%;
                text-align: center;
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 5px;
                padding: 5px;
                background: none;
                color: black;
            }
           .right-currentPanel .grid-container {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: 10px;
                padding: 10px;
                border: 2px solid grey;
                background-color: #f5f5f5;
            }
            .right-currentPanel .button {
                width: 90px;
                height: 60px;
                background: linear-gradient(to top, #e0e0e0, #ffffff);
                color: #333;
                border: 3px solid #888;
                border-radius: 8px;
                box-shadow: inset 0px -5px 5px rgba(0, 0, 0, 0.2), inset 0px 5px 5px rgba(255, 255, 255, 0.7), 3px 3px 5px rgba(0, 0, 0, 0.3);
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                text-align: center;
                position: relative;
            }
            .right-currentPanel .button:hover {
                background: linear-gradient(to top, #d0d0d0, #ffffff);
            }
            .right-currentPanel .green {
                background: green !important;
                font-weight: bold;
                color: white;
            }
            .right-currentPanel .orange {
                background: orange !important;
                font-weight: bold;
                color: black;
            }
            .right-currentPanel .red {
                background: red !important;
                font-weight: bold;
                color: white;
            }
            .right-currentPanel .disabled {
                pointer-events: none;
                opacity: 0.5;
            }
            .right-currentPanel  .score-table {
                margin-top: 10px;
                border-collapse: collapse;
                width: 200px;
                text-align: center;
                border: 1px solid white;
            }
            .right-currentPanel .score-table th {
                background: white;
                color: blue;
                font-weight: bold;
            }
            .right-currentPanel .score-table th, .score-table td {
                border: 1px solid white;
                padding: 5px;
                font-size: 16px;
            }
            #add-rounded-sum {
                margin-top: 10px;
                display: none;
                background: linear-gradient(to top, #ffff00, #ffcc00);
                color: black;
                font-weight: bold;
                padding: 2px;
                border: 3px solid #ffaa00;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: inset 0px -5px 5px rgba(255, 255, 0, 0.5), inset 0px 5px 5px rgba(255, 204, 0, 0.7), 3px 3px 5px rgba(255, 153, 0, 0.5);
            }
            #add-rounded-sum:hover {
                background: linear-gradient(to top, #ffcc00, #ffff00);
            }
            .right-currentPanel .medal {
                display: none;
                width: 280px;
                height: 40px;
                background: gold;
                border-radius: 10%;
                text-align: center;
                font-size: 18px;
                font-weight: bold;
                line-height: 30px;
                color: black;
                margin-top: 10px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            }
            .right-currentPanel .reset-button {
                display: none;
                margin-top: 10px;
                padding: 6px;
                font-size: 16px;
                font-weight: bold;
                background: red;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            }
            .right-currentPanel .reset-button:hover {
                background: darkred;
            }
          .right-currentPanel .suitcase {
                width: 80px;
                height: 60px;
                background: linear-gradient(to top, #e0e0e0, #ffffff);
                color: white;
                border: 3px solid #888;
                border-radius: 8px;
                box-shadow: inset 0px -5px 5px rgba(0, 0, 0, 0.2), inset 0px 5px 5px rgba(255, 255, 255, 0.7), 3px 3px 5px rgba(0, 0, 0, 0.3);
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                text-align: center;
                position: relative;
            }
            .right-currentPanel .button::before {
                content: "";
                position: absolute;
                top: -10px;
                width: 30px;
                height: 10px;
                background-color: grey;
                border-radius: 5px 5px 0 0;
            }
            .right-currentPanel .button .handle {
                width: 50px;
                height: 10px;
                background-color: white;
                position: absolute;
                top: -10px;
                border-radius: 5px;
            }
            .right-currentPanel .suitcase:hover {
                background: linear-gradient(to top, #d0d0d0, #ffffff);
            }
        </style>
    </head>
    <body>
        <div class="header"><strong>${username}</strong></div>
        <div class="left-currentPanel">
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


        <div class="center-currentPanel">
            <h3></h3>
            <div id="videoContainer">
                <div id="dragHandle">Drag</div>
                <video id="videoPlayer" controls autoplay>
                    <source id="videoSource" src="" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>


            <!-- Comment input and language selection -->

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

        <div class="right-currentPanel">
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
            <button id="add-rounded-sum" style="margin-top: 10px; display: none; color: #333;" onclick="addofferValueToUserTotal();">Add Rounded Sum</button>
            <button id="reset" class="reset-button" onclick="resetGame()">Play Again</button>  

        </div>

        <script>

            let selectedUser = "";
            songIndex = 0;
            totalSongs = ${songsCount};
            console.log('totalSongs ', totalSongs);

            function toggleDropdown() {
                document.getElementById("userDropdown").style.display = "block";
            }

            function selectUser(user) {
                document.getElementById("userSearch").value = user;
                document.getElementById("userDropdown").style.display = "none";
                selectedUser = user;
            }

            function filterUsers() {
                let input = document.getElementById("userSearch").value.toLowerCase();
                let items = document.querySelectorAll("#userDropdown li");
                items.forEach(item => {
                    item.style.display = item.textContent.toLowerCase().includes(input) ? "block" : "none";
                });
            }

            document.addEventListener("click", function(event) {
                if (!event.target.closest(".dropdown-container")) {
                    document.getElementById("userDropdown").style.display = "none";
                }
            });

            // Function to update message ID colors based on state
            function updateMessageColors(selectedId) {
                document.querySelectorAll('input[name="messageid"]').forEach(radio => {
                    const safeId = CSS.escape(radio.id); // Escape special characters
                    const label = document.getElementById(safeId); // Get the label directly by ID

                    if (label) {
                        if (radio.id === selectedId) {
                            label.style.color = "grey"; // Change selected ID to the specified color
                        } else {
                            label.style.color = radio.dataset.watched === "true" ? "grey" : "white"; 
                            label.style.fontWeight = radio.dataset.watched === "true" ? "normal" : "bold";
                        }
                    }
                });
            }

            function updateLanguage() {
                const selectedLanguage = document.getElementById("languageSelect").value;
                // Change input method for the message box
                setIME(selectedLanguage);
            }

            function playRandomSong() {
                    console.log('Inside playRandomSong');
                    console.log('song count is ', totalSongs);
                    songIndex = songIndex < totalSongs ? songIndex + 1 : 1;
                    let randUrl = "https://animateinput.s3.ap-south-1.amazonaws.com/randsong" + songIndex + ".mp4";
                    console.log('url ', randUrl);
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');

                    videoSource.src = randUrl;
                    videoPlayer.load();
                    videoPlayer.playbackRate = 0.75; // Set playback speed to 0.75x
                    enablePiP(); // Auto-enable PiP
            }
            function stopRandomSong() {
               
                    const videoPlayer = document.getElementById('videoPlayer');
                    if (videoPlayer) {
                        videoPlayer.pause();  // Pause the video
                        videoPlayer.currentTime = 0;  // Reset to the beginning
                    }
            }

            function playSelectedVideo() {
                const selected = document.querySelector('input[name="messageid"]:checked');
                const selectedMsg = selected.msg;
                
                if (selected) {
                    const videoUrl = '${videoURL}' + selected.id;
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');

                    videoSource.src = videoUrl;
                    videoPlayer.load();
                    videoPlayer.playbackRate = 0.75; // Set playback speed to 0.75x
                    enablePiP(); // Auto-enable PiP
                    updateMessageColors(selected.value);
                    const messageBox = document.getElementById("messageBox");
                    messageBox.placeholder = selected.value;
                    vscode.postMessage({ command: 'playVideo', selectedId: selected.id, selectedMessage: selected.value });
                } else {
                    vscode.postMessage({ command: 'noSelection' });
                }
            }
            function refreshVideos() {
                const refreshButton = document.getElementById('Refresh');
                refreshButton.disabled = true; // Disable button to prevent multiple clicks
                refreshButton.style.backgroundColor = '#808080'; // Change color to grey
                vscode.postMessage({ command: 'refreshVideos' });
                setTimeout(() => {
                    refreshButton.disabled = false; // Re-enable after API call (assuming response comes quickly)
                    refreshButton.style.backgroundColor = '#007acc'; // Change back to blue
                }, 5000); // Adjust timeout if needed based on actual response time
            }

            async function enablePiP() {
                const video = document.getElementById('videoPlayer');
                if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                    try {
                        await video.requestPictureInPicture();
                    } catch (error) {
                        console.error("PiP failed:", error);
                    }
                }
            }

            function submitMessage() {
                console.log("Submitting message...");
                const selected = document.querySelector('input[name="messageid"]:checked');
                if (!selectedUser) {
                    vscode.postMessage({ command: 'emptySendToUser'});
                    alert("Please select a user to send message.");
                    return;
                }
                const message = document.getElementById('messageBox').value.trim();
                if (message.length === 0) {
                    vscode.postMessage({ command: 'emptyMessage'});
                    alert("Message cannot be empty.");
                    return;
                }
                const selectedLanguage = document.getElementById('languageSelect').value; // Get selected language

                fetch('${sendMsgApiURL}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },

                    body: JSON.stringify(
                                            { 
                                                "userid": '${username}',
                                                "message": message,
                                                "receiverid": selectedUser,
                                                "language": selectedLanguage,
                                                "animal": "cm"
                                            }
                                        )
                })
                .then(response => response.json())
                .then(data => {
                    console.log("Message submitted successfully!");
                    document.getElementById('messageBox').value = ""; // Clear input
                })
                .catch(error => {
                    console.error("Error submitting message:", error);
                    alert("Failed to submit message.");
                });
            }
            const vscode = acquireVsCodeApi();

            // Dragging functionality
            const videoContainer = document.getElementById("videoContainer");
            const dragHandle = document.getElementById("dragHandle");
            let isDragging = false, offsetX = 0, offsetY = 0;

            dragHandle.addEventListener("mousedown", (e) => {
                isDragging = true;
                offsetX = e.clientX - videoContainer.offsetLeft;
                offsetY = e.clientY - videoContainer.offsetTop;
            });

            document.addEventListener("mousemove", (e) => {
                if (isDragging) {
                    videoContainer.style.left = (e.clientX - offsetX) + "px";
                    videoContainer.style.top = (e.clientY - offsetY) + "px";
                }
            });

            document.addEventListener("mouseup", () => {
                isDragging = false;
            });


            function setIME(language) {
                const messageBox = document.getElementById("messageBox");

                if (language === "ta") {
                    messageBox.setAttribute("lang", "ta");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "உங்கள் செய்தியை உள்ளிடவும்"; // Tamil placeholder
                }
                else if (language === "te") {
                    messageBox.setAttribute("lang", "te");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "మీ సందేశాన్ని నమోదు చేయండి"; // Telugu placeholder
                } 
                else if (language === "ml") {
                    messageBox.setAttribute("lang", "'ml");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "നിങ്ങളുടെ സന്ദേശം നൽകുക"; //Malayalam
                }
                else if (language === "kn"){
                    messageBox.setAttribute("lang", "kn");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ನಮೂದಿಸಿ"; //Kannada
                }
                else if (language === "hi") {
                    messageBox.setAttribute("lang", "hi");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "अपना संदेश दर्ज करें"; // Hindi placeholder
                }
                else if (language === "mr") {
                    messageBox.setAttribute("lang", "mr");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "तुमचा संदेश प्रविष्ट करा"; // Marati placeholder
                }
                else if (language === "gu") {
                    messageBox.setAttribute("lang", "gu");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "તમારો સંદેશ દાખલ કરો"; // Gujarati placeholder
                }
                else if (language === "or"){
                    messageBox.setAttribute("lang", "or");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "ତୁମର ବାର୍ତ୍ତା"; // Odia placeholder
                }
                else if (language === "en") {
                    messageBox.setAttribute("lang", "en");
                    messageBox.setAttribute("dir", "ltr");
                    messageBox.placeholder = "Enter your message"; // English placeholder
                }
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
                console.log('offerAccepted ' , offerAccepted);
                if (buttonsDisabled) return;
                if (offerAccepted) return;
                let button = document.getElementById('btn' + index);
                let value = parseInt(button.getAttribute('data-value'));
                handleButtonClick(index, value, 'User');
                userTotal += value;
                userScores.push(value);
                updateScoreTable();
                buttonsDisabled = true;
                setTimeout(() => {
                    autoClick();
                }, 1000);
            }

            function handleButtonClick(index, value, source) {
            console.log('inside handleButtonClick');
                let button = document.getElementById('btn' + index);
                if (source === "User"){
                    button.innerHTML = \`₹\${value}<br><span style="color: white;font-weight: bold;">\${source}</span>\`;
                }
                else{
                    button.innerHTML = \`₹\${value}<br><span style="color: blue;font-weight: bold;">\${source}</span>\`;
                }
                
                button.classList.add(value > 20000 ? 'green' : value > 0 ? 'orange' : 'red');
                button.classList.add('disabled');
                button.setAttribute('data-source', source);
            }

            function autoClick() {
                console.log('inside autoClick');
                let unclickedButtons = Array.from(document.querySelectorAll('.button:not(.disabled)'));
                if (unclickedButtons.length === 0) {
                    buttonsDisabled = false;
                    console.log('(unclickedButtons.length === 0) ');
                    return;
                }
                let randomButton = unclickedButtons[Math.floor(Math.random() * unclickedButtons.length)];
                let index = randomButton.id.replace('btn', '');
                let value = parseInt(randomButton.getAttribute('data-value'));
                handleButtonClick(index, value, 'Comp');
                compClicks += 1;
                compTotal += value;
                compScores.push(value);
                updateScoreTable();
                if (!offerAccepted){
                    calculateUnclickedSum();
                    setTimeout(() => {
                        buttonsDisabled = false;
                        checkRemainingButton();
                    }, 1000);                
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
               if (!offerAccepted){
                    userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString());
                    document.getElementById('user-total').innerText = '₹' + userTotal.toLocaleString();                                  
               }
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
                if (userTotal < compTotal){
                    offerValue = offerValue + Math.round((compTotal / 1.5) / 5000) * 5000;
                }
                if ((compTotal + offerValue) < userTotal){
                   offerValue = 0;
                }
                if (offerValue < 0){
                   offerValue = 0
                }
                if (compClicks === 4)
                {
                    offerValue = 0;
                }

                let button = document.getElementById('add-rounded-sum');
                if (offerValue !== 0) {
                    button.innerText = \`Offer to Quit ₹\${offerValue.toLocaleString()}\`;
                    button.style.display = 'block'; // Show the button
                    button.setAttribute('data-value', offerValue); // Store the offerValue in the button
                } else {
                    button.style.display = 'none'; // Hide if offerValue is 0
                }
            }

            function addofferValueToUserTotal() {
                let i  = 0;
                userTotal = userTotal + offerValue;
                offerAccepted = true;
                let button = document.getElementById('add-rounded-sum');
                userScores.push(offerValue);
                userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString());
                document.getElementById('user-total').innerText = '₹' + userTotal;
                console.log(userTotal);
                let userTotalCell = document.getElementById('user-total');
                let compTotalCell = document.getElementById('comp-total');
                compTotalCell.style.backgroundColor = compTotal < userTotal ? 'red' : 'green';
                userTotalCell.style.backgroundColor = userTotal < compTotal ? 'red' : 'green';
                button.style.display = 'none'; // Hide the button after adding the value
                console.log('compClicks ', compClicks);                
                for ( i = compClicks; i < 4; i++){
                    setTimeout(() => {autoClick();}, i*1000); 
                }
                setTimeout(() => {checkWinner();}, (5 - compClicks) * 1500); 
                
                                                
                
            }

            function disableUserButtons() {
                document.querySelectorAll('.button').forEach(button => {
                    button.classList.add('disabled');
                });
            }
            function checkWinner() {
               console.log('inside checkWinner');
                if (userTotal > compTotal) {
                    gameResult = "You Won";
                }
                else{
                     gameResult = "Its a Time-pass Game...";
                }
                document.getElementById('medal').innerText = gameResult;
                document.getElementById('medal').style.display = 'block';
                document.getElementById('reset').style.display = 'block';
            }
            function resetGame() {
                vscode.postMessage({ command: 'reset' });
            }
        </script>
    </body>
    </html>`;
}

async function registerUser(username: string): Promise<boolean> {
    try {
      const response = await fetch("https://raoh09sh65.execute-api.ap-south-1.amazonaws.com/prod/registeruser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
            { 
                "userid": username,
                "password": "",
                "username": "",
                "secquestion": "",
                "secanswer": ""
            }
        ),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      console.log(`User registered successfully: ${username}`);
      return true; // Successfully registered
    } catch (error) {
      console.error("Error registering user:", error);
      return false; // Registration failed
    }
  }

function deactivate() {}

module.exports = { activate, deactivate };
