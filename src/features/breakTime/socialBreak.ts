import * as vscode from 'vscode';
import { State } from './breakTime';

let totalSongs: number = 0;
let userIds: string[] = [];
let videoCount: number = 0;

export async function fetchAndDisplayVideos(panel: vscode.WebviewPanel, state: State, context: vscode.ExtensionContext, username: string) {
    const getMsgsApiURL = "https://qb1n4uw5b6.execute-api.ap-south-1.amazonaws.com/animal/getvideowithmsg";
    const jsonBody = { "userid": username };

    try {
        totalSongs = await getVideoCount();
        userIds = await fetchAllUsers();
        const response = await fetch(getMsgsApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify(jsonBody)
        });
        const result = await response.json() as { body?: string };
        let messageIds: { id: string; msg: string; lang: string }[] = [];

        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                messageIds = parsedBody.map(item => ({ id: item.messageid, msg: item.messagetext, lang: item.language }));
            }
        }

        if (messageIds.length <= videoCount) {
            vscode.window.showInformationMessage("No New Videos available.");
        } else {
            videoCount = messageIds.length;
        }

        const usersList: string[] = context.globalState.get("usersList", []);
        if (!usersList.includes(username)) {
            const success = await registerUser(username);
            if (success) {
                usersList.push(username);
                await context.globalState.update("usersList", usersList);
            }
        }

        panel.webview.html = getSocialBreakContent(messageIds, state.watchedVideos, username, totalSongs, "closeSocialBreak");
    } catch (error) {
        vscode.window.showErrorMessage(`API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export function getSocialBreakContent(messageIds: { id: string; msg: string; lang: string }[], watchedVideos: Set<string>, username: string, songsCount: number, gameAction: string): string {
    const values = [5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, -40000];
    const shuffledValues = values.sort(() => Math.random() - 0.5);
    const gameActionFunction = gameAction === "closeSocialBreak" ? "closeSocialBreak()" : "resetGame()";
    const gameActionText = gameAction === "closeSocialBreak" ? "Close" : "Play Again";
    const videoURL = "https://animateoutput.s3.ap-south-1.amazonaws.com/";
    const sendMsgApiURL = "https://9xbaecf7o2.execute-api.ap-south-1.amazonaws.com/prod/callanimal";

    const options = userIds.map((user) => `<li onclick="selectUser('${user}')">${user}</li>`).join("");
    const sortedMessageIds = Array.from(messageIds).sort((a, b) => b.id.localeCompare(a.id));
    const radioButtons = sortedMessageIds.map(({ id, msg, lang }) => {
        const isWatched = watchedVideos.has(id);
        return `
            <input type="radio" name="messageid" value="${msg} [${lang}]" id="${id}" msg="${msg}">
            <label for="${id}" style="color: ${isWatched ? 'grey' : 'white'}; font-weight: ${isWatched ? 'normal' : 'bold'};">${id}</label><br>
        `;
    }).join("");

    return `<!DOCTYPE html>
    <html>
    <head>
        <title>Social Break</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 10px; background-color: black; color: white; display: flex; }
            .header { position: absolute; top: 10px; right: 20px; font-size: 14px; color: lightgray; }
            .left-panel, .right-panel { padding: 4px; }
            .scrollable-list { flex-grow: 1; overflow-y: auto; }
            .left-panel { width: 20%; float: left; height: 75vh; border-right: 2px solid grey; display: flex; flex-direction: column; }
            .center-panel { width: 47%; position: relative; padding: 5px; border-right: 2px solid grey; display: flex; flex-direction: column; align-items: center; }
            .right-panel { width: 33%; position: relative; padding: 5px; display: flex; flex-direction: column; align-items: center; }
            select { width: 100px; margin-left: 10px; }
            .button-container { display: flex; gap: 10px; justify-content: left; background: black; padding: 8px; }
            .left-panel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; }
            .center-panel button { width: 80px; padding: 6px; background-color: #007acc; color: white; border: none; cursor: pointer; }
            #videoContainer { position: relative; width: 420px; height: 320px; border: 3px solid #007acc; border-radius: 8px; resize: both; overflow: hidden; background-color: black; }
            video { width: 100%; height: 100%; object-fit: contain; }
            #dragHandle { width: 100%; height: 20px; background: #007acc; cursor: move; text-align: center; color: white; font-weight: bold; }
            textarea { width: 95%; max-width: 420px; height: 60px; margin-top: 10px; border: 1px solid #007acc; border-radius: 8px; padding: 3px; background-color: #222; color: white; resize: none; }
            button:hover { background-color: #005f99; }
            .dropdown-container { position: relative; display: inline-block; border: 1px solid #007acc; }
            .dropdown-input { width: 180px; padding: 6px; border: 1px solid #007acc; border-radius: 5px; }
            .dropdown-list { position: absolute; width: 200px; max-height: 150px; overflow-y: auto; border: 1px solid #007acc; border-top: none; background: grey; display: none; z-index: 1000; list-style: none; padding: 0; margin: 0; }
            .dropdown-list li { padding: 2px; cursor: pointer; color: black; background: grey; }
            .dropdown-list li:hover { background: #f0f0f0; }
            .right-panel { display: flex; flex-direction: column; align-items: center; flex-grow: 1; padding: 10px; }
            .right-panel .grid-container { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 10px; padding: 10px; border: 2px solid grey; background-color: #f5f5f5; }
            .right-panel .button { width: 90px; height: 60px; background: linear-gradient(to top, #e0e0e0, #ffffff); color: #333; border: 3px solid #888; border-radius: 8px; box-shadow: inset 0px -5px 5px rgba(0, 0, 0, 0.2), inset 0px 5px 5px rgba(255, 255, 255, 0.7), 3px 3px 5px rgba(0, 0, 0, 0.3); cursor: pointer; font-size: 14px; font-weight: bold; text-align: center; position: relative; }
            .right-panel .button:hover { background: linear-gradient(to top, #d0d0d0, #ffffff); }
            .right-panel .green { background: green !important; font-weight: bold; color: white; }
            .right-panel .orange { background: orange !important; font-weight: bold; color: black; }
            .right-panel .red { background: red !important; font-weight: bold; color: white; }
            .right-panel .disabled { pointer-events: none; opacity: 0.5; }
            .right-panel .score-table { margin-top: 10px; border-collapse: collapse; width: 200px; text-align: center; border: 1px solid white; }
            .right-panel .score-table th { background: white; color: blue; font-weight: bold; }
            .right-panel .score-table th, .score-table td { border: 1px solid white; padding: 5px; font-size: 16px; }
            #add-rounded-sum { margin-top: 10px; display: none; background: linear-gradient(to top, #ffff00, #ffcc00); color: black; font-weight: bold; padding: 2px; border: 3px solid #ffaa00; border-radius: 8px; cursor: pointer; box-shadow: inset 0px -5px 5px rgba(255, 255, 0, 0.5), inset 0px 5px 5px rgba(255, 204, 0, 0.7), 3px 3px 5px rgba(255, 153, 0, 0.5); }
            .right-panel .medal { display: none; width: 280px; height: 40px; background: gold; border-radius: 10%; text-align: center; font-size: 18px; font-weight: bold; line-height: 30px; color: black; margin-top: 10px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.5); }
            .right-panel .reset-button { display: none; margin-top: 10px; padding: 6px; font-size: 16px; font-weight: bold; background: red; color: white; border: none; border-radius: 5px; cursor: pointer; }
            .right-panel .reset-button:hover { background: darkred; }
            .right-panel .ins-button { display: block; margin-top: 12px; padding: 6px; font-size: 16px; font-weight: bold; background: blue; color: white; border: none; border-radius: 5px; cursor: pointer; }
            .right-panel .ins-button:hover { background: darkred; }
            .right-panel .instructions-container { max-height: 90px;  overflow-y: auto; border: 1px solid #ccc; padding: 6px;  display: none; margin-top: 6px; line-height: 1.5; }
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
    </head>
    <body>
        <div class="header"><strong>${username}</strong></div>
        <div class="left-panel">
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
        <div class="center-panel">
            <h3></h3>
            <div id="videoContainer">
                <div id="dragHandle">Drag</div>
                <video id="videoPlayer" controls autoplay>
                    <source id="videoSource" src="" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
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
        <div class="right-panel">
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
            <button id="reset" class="reset-button" onclick="${gameActionFunction}">${gameActionText}</button> 
            <button id="instruction" class="ins-button" onclick="toggleInstructions()">Instructions</button>  
            <div id="instructions" class="instructions-container">
                <ol>
                <li>You will play with the Computer</li>                
                <li>Each box will contain random amount between ₹5K to ₹40K in increments of ₹5K</li>
                <li>One box will have a negative amount ₹-40K</li>
                <li>Click Any of the 9 boxes to start</li>
                <li>The amount You see in Your clicked box will be added to your account</li>
                <li>Computer will select a box after You. So please wait before clicking the next box.</li>
                <li>The amount in the computer clicked box will be added to Computer's account</li>
                <li>Computer will randomly give you an Offer to quit the game</li>
                <li>You can choose to avail computer's  Offer to Quit. If so the amount will be added to your account</li>
                <li>Once you chose computer's  Offer to Quit, You will not be allowed to select any boxes. But the computer will select its remaining boxes</li>
                <li>Either You or Computer having highest amount in account is the Winner at the end</li>
                <li>The Offer to Quit amount from computer is calculative and not random. So your chances of winning is high</li>
                <li>Clicked Boxes will be (1).Yellow if amount <= ₹20K (2). Green if amount > ₹20K (3). Red if amount < 0 </li>
                </ol>
            </div>
        </div>
        <script>
            let selectedUser = "";
            let songIndex = 0;
            const totalSongs = ${songsCount};

            function toggleDropdown() { document.getElementById("userDropdown").style.display = "block"; }
            function selectUser(user) { document.getElementById("userSearch").value = user; document.getElementById("userDropdown").style.display = "none"; selectedUser = user; }
            function filterUsers() { let input = document.getElementById("userSearch").value.toLowerCase(); let items = document.querySelectorAll("#userDropdown li"); items.forEach(item => { item.style.display = item.textContent.toLowerCase().includes(input) ? "block" : "none"; }); }
            document.addEventListener("click", function(event) { if (!event.target.closest(".dropdown-container")) { document.getElementById("userDropdown").style.display = "none"; } });

            function updateMessageColors(selectedId) {
                document.querySelectorAll('input[name="messageid"]').forEach(radio => {
                    const safeId = CSS.escape(radio.id);
                    const label = document.querySelector(\`label[for="\${safeId}"]\`);
                    if (label) {
                        if (radio.id === selectedId) { label.style.color = "grey"; }
                        else { label.style.color = radio.dataset.watched === "true" ? "grey" : "white"; label.style.fontWeight = radio.dataset.watched === "true" ? "normal" : "bold"; }
                    }
                });
            }

            function updateLanguage() { const selectedLanguage = document.getElementById("languageSelect").value; setIME(selectedLanguage); }
            function playRandomSong() {
                songIndex = songIndex < totalSongs ? songIndex + 1 : 1;
                let randUrl = "https://animateinput.s3.ap-south-1.amazonaws.com/randsong" + songIndex + ".mp4";
                const videoPlayer = document.getElementById('videoPlayer');
                const videoSource = document.getElementById('videoSource');
                videoSource.src = randUrl;
                videoPlayer.load();
                videoPlayer.playbackRate = 0.75;
                enablePiP();
            }
            function stopRandomSong() {
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer) { videoPlayer.pause(); videoPlayer.currentTime = 0; }
            }

            function playSelectedVideo() {
                const selected = document.querySelector('input[name="messageid"]:checked');
                if (selected) {
                    const videoUrl = '${videoURL}' + selected.id;
                    const videoPlayer = document.getElementById('videoPlayer');
                    const videoSource = document.getElementById('videoSource');
                    videoSource.src = videoUrl;
                    videoPlayer.load();
                    videoPlayer.playbackRate = 0.75;
                    enablePiP();
                    updateMessageColors(selected.id);
                    const messageBox = document.getElementById("messageBox");
                    messageBox.placeholder = selected.getAttribute('msg');
                    vscode.postMessage({ command: 'playVideo', selectedId: selected.id });
                } else { vscode.postMessage({ command: 'noSelection' }); }
            }

            function refreshVideos() {
                const refreshButton = document.getElementById('Refresh');
                refreshButton.disabled = true;
                refreshButton.style.backgroundColor = '#808080';
                vscode.postMessage({ command: 'refreshVideos' });
                setTimeout(() => { refreshButton.disabled = false; refreshButton.style.backgroundColor = '#007acc'; }, 5000);
            }

            async function enablePiP() {
                const video = document.getElementById('videoPlayer');
                if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
                    try { await video.requestPictureInPicture(); } catch (error) { console.error("PiP failed:", error); }
                }
            }
            
            function submitMessage() {
                const selected = document.querySelector('input[name="messageid"]:checked');
                if (!selectedUser) { vscode.postMessage({ command: 'emptySendToUser'}); alert("Please select a user to send message."); return; }
                const message = document.getElementById('messageBox').value.trim();
                if (message.length === 0) { vscode.postMessage({ command: 'emptyMessage'}); alert("Message cannot be empty."); return; }
                const selectedLanguage = document.getElementById('languageSelect').value;
                fetch('${sendMsgApiURL}', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ "userid": '${username}', "message": message, "receiverid": selectedUser, "language": selectedLanguage, "animal": "cm" })
                })
                .then(response => response.json())
                .then(data => { console.log("Message submitted successfully!"); document.getElementById('messageBox').value = ""; })
                .catch(error => { console.error("Error submitting message:", error); alert("Failed to submit message."); });
            }

            const vscode = acquireVsCodeApi();
            const videoContainer = document.getElementById("videoContainer");
            const dragHandle = document.getElementById("dragHandle");
            let isDragging = false, offsetX = 0, offsetY = 0;

            dragHandle.addEventListener("mousedown", (e) => { isDragging = true; offsetX = e.clientX - videoContainer.offsetLeft; offsetY = e.clientY - videoContainer.offsetTop; });
            document.addEventListener("mousemove", (e) => { if (isDragging) { videoContainer.style.left = (e.clientX - offsetX) + "px"; videoContainer.style.top = (e.clientY - offsetY) + "px"; } });
            document.addEventListener("mouseup", () => { isDragging = false; });

            function setIME(language) {
                const messageBox = document.getElementById("messageBox");
                if (language === "ta") { messageBox.setAttribute("lang", "ta"); messageBox.placeholder = "உங்கள் செய்தியை உள்ளிடவும்"; }
                else if (language === "te") { messageBox.setAttribute("lang", "te"); messageBox.placeholder = "మీ సందేశాన్ని నమోదు చేయండి"; }
                else if (language === "ml") { messageBox.setAttribute("lang", "ml"); messageBox.placeholder = "നിങ്ങളുടെ സന്ദേശം നൽകുക"; }
                else if (language === "kn") { messageBox.setAttribute("lang", "kn"); messageBox.placeholder = "ನಿಮ್ಮ ಸಂದೇಶವನ್ನು ನಮೂದಿಸಿ"; }
                else if (language === "hi") { messageBox.setAttribute("lang", "hi"); messageBox.placeholder = "अपना संदेश दर्ज करें"; }
                else if (language === "mr") { messageBox.setAttribute("lang", "mr"); messageBox.placeholder = "तुमचा संदेश प्रविष्ट करा"; }
                else if (language === "gu") { messageBox.setAttribute("lang", "gu"); messageBox.placeholder = "તમારો સંદેશ દાખલ કરો"; }
                else if (language === "or") { messageBox.setAttribute("lang", "or"); messageBox.placeholder = "ତୁମର ବାର୍ତ୍ତା"; }
                else if (language === "en") { messageBox.setAttribute("lang", "en"); messageBox.placeholder = "Enter your message"; }
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
                if (buttonsDisabled || offerAccepted) return;
                let button = document.getElementById('btn' + index);
                let value = parseInt(button.getAttribute('data-value'));
                handleButtonClick(index, value, 'User');
                userTotal += value;
                userScores.push(value);
                updateScoreTable();
                buttonsDisabled = true;
                setTimeout(() => { autoClick(); }, 1000);
            }

            function handleButtonClick(index, value, source) {
                let button = document.getElementById('btn' + index);
                if (source === "User") { button.innerHTML = \`₹\${value}<br><span style="color: white;font-weight: bold;">\${source}</span>\`; }
                else { button.innerHTML = \`₹\${value}<br><span style="color: blue;font-weight: bold;">\${source}</span>\`; }
                button.classList.add(value > 20000 ? 'green' : value > 0 ? 'orange' : 'red');
                button.classList.add('disabled');
            }

            function autoClick() {
                let unclickedButtons = Array.from(document.querySelectorAll('.button:not(.disabled)'));
                if (unclickedButtons.length === 0) { buttonsDisabled = false; return; }
                let randomButton = unclickedButtons[Math.floor(Math.random() * unclickedButtons.length)];
                let index = randomButton.id.replace('btn', '');
                let value = parseInt(randomButton.getAttribute('data-value'));
                handleButtonClick(index, value, 'Comp');
                compClicks += 1;
                compTotal += value;
                compScores.push(value);
                updateScoreTable();
                if (!offerAccepted) {
                    calculateUnclickedSum();
                    setTimeout(() => { buttonsDisabled = false; checkRemainingButton(); }, 1000);
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
                if (!offerAccepted) { userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString()); document.getElementById('user-total').innerText = '₹' + userTotal.toLocaleString(); }
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
                if (userTotal < compTotal) { offerValue = offerValue + Math.round((compTotal / 1.5) / 5000) * 5000; }
                if ((compTotal + offerValue) < userTotal) { offerValue = 0; }
                if (offerValue < 0) { offerValue = 0; }
                if (compClicks === 4) { offerValue = 0; }
                let button = document.getElementById('add-rounded-sum');
                if (offerValue !== 0) {
                    button.innerText = \`Offer to Quit ₹\${offerValue.toLocaleString()}\`;
                    button.style.display = 'block';
                    button.setAttribute('data-value', offerValue);
                } else { button.style.display = 'none'; }
            }

            function addofferValueToUserTotal() {
                userTotal += offerValue;
                offerAccepted = true;
                let button = document.getElementById('add-rounded-sum');
                userScores.push(offerValue);
                userScores.forEach((val, i) => document.getElementById(\`user-score\${i+1}\`).innerText = '₹' + val.toLocaleString());
                document.getElementById('user-total').innerText = '₹' + userTotal.toLocaleString();
                let userTotalCell = document.getElementById('user-total');
                let compTotalCell = document.getElementById('comp-total');
                compTotalCell.style.backgroundColor = compTotal < userTotal ? 'red' : 'green';
                userTotalCell.style.backgroundColor = userTotal < compTotal ? 'red' : 'green';
                button.style.display = 'none';
                for (let i = compClicks; i < 4; i++) { setTimeout(() => { autoClick(); }, i * 1000); }
                setTimeout(() => { checkWinner(); }, (5 - compClicks) * 1500);
            }

            function checkWinner() {
                let gameResult = userTotal > compTotal ? "You Won" : "It's a Time-pass Game...";
                document.getElementById('medal').innerText = gameResult;
                document.getElementById('medal').style.display = 'block';
                document.getElementById('reset').style.display = 'block';
                document.querySelectorAll('.button').forEach(button => button.classList.add('disabled'));

                if (gameResult === "You Won") {
                    vscode.postMessage({ command: 'awardPoints', amount: 100 });
                }
            }

            function toggleInstructions() {
                const box = document.getElementById('instructions');
                box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
            }

            function resetGame() {
                vscode.postMessage({ command: 'reset' });
            }

            function closeSocialBreak() { vscode.postMessage({ command: 'closeSocialBreak' }); }

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'showReward') {
                    const emoji = '💰';
                    const rewardEl = document.createElement('div');
                    rewardEl.textContent = \`+ \${message.amount} units \${emoji}\`;
                    rewardEl.className = 'floating-reward';
                    document.body.appendChild(rewardEl);
                    setTimeout(() => { rewardEl.remove(); }, 2000);
                }
            });
        </script>
    </body>
    </html>`;
}

export async function getVideoCount(): Promise<number> {
    const url = "https://animateinput.s3.ap-south-1.amazonaws.com/videocount.txt";
    try {
        const response = await fetch(url);
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        const text = await response.text();
        const numberMatch = text.match(/\d+/);
        return numberMatch ? parseInt(numberMatch[0], 10) : 0;
    } catch (error) {
        vscode.window.showErrorMessage(`Error fetching file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return 0;
    }
}

export async function fetchAllUsers(): Promise<string[]> {
    const getAllUsersApiURL = "https://w0jnm95oyc.execute-api.ap-south-1.amazonaws.com/animal/userlist";
    try {
        const response = await fetch(getAllUsersApiURL, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=UTF-8" },
            body: JSON.stringify({})
        });
        const result = await response.json() as { body?: string };
        if (result.body) {
            const parsedBody = JSON.parse(result.body);
            if (Array.isArray(parsedBody)) {
                return parsedBody.map(item => item.userid).filter(id => id);
            }
        }
        return [];
    } catch (error) {
        vscode.window.showErrorMessage(`API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return [];
    }
}

export async function registerUser(username: string): Promise<boolean> {
    try {
        const response = await fetch("https://raoh09sh65.execute-api.ap-south-1.amazonaws.com/prod/registeruser", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "userid": username, "password": "", "username": "", "secquestion": "", "secanswer": "" })
        });
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}`); }
        console.log(`User registered successfully: ${username}`);
        return true;
    } catch (error) {
        console.error("Error registering user:", error);
        return false;
    }
}