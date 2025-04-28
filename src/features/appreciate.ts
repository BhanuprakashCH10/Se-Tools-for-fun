import vscode from 'vscode';
import os from 'os';

import { getVideoCount } from './breakTime/socialBreak';
import { getSocialBreakContent } from './breakTime/socialBreak';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';



let currentPanel: vscode.WebviewPanel | undefined;
let videoCount = 0;
let totalSongs: number = 0; // Initialize with a default value
let songIndex: number;
let senderId: string | undefined;
let receiverIds: string[] = [];
let totalGreetings: number = 0;
let userIds: string[] = [];
let panel_GT: vscode.WebviewPanel | undefined;


export function activateAppreciate(context: vscode.ExtensionContext) {
    const username = os.userInfo().username.replace(/\s+/g, "");
    senderId = username;
    let sayThanks = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sayThanks.text = `$(play) Appreciate`;
    sayThanks.tooltip = "Show coding efficiency through Compilation errors";
    sayThanks.command = "extension.Appreciate";
    sayThanks.show();

    let sayThanksDisposable = 	vscode.commands.registerCommand('extension.Appreciate', async () => {
                // If panel already exists, reveal it and return
                if (panel_GT) { panel_GT.reveal(vscode.ViewColumn.One); }
                else{
                    panel_GT = vscode.window.createWebviewPanel(
                        'Say Thanks',
                        'Appreciate your friends',
                            vscode.ViewColumn.One,
                            {
                                enableScripts: true
                            }
                        );
                }  
  
        getGreetingCount();  
		await fetchAllReceivers(context);  
  
        const jsonBody = { "receiverId": username };
  
        const response = await fetch('https://ykvafyh8c5.execute-api.ap-south-1.amazonaws.com/ThanksMsgProd/getThanksMsgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonBody)
        });
  
        const result = await response.json() as { body?: string };
        let receivedMessages: { imageId: string; senderId: string; dateReceived: string; message: string }[] = [];
  
        if (result.body) {
          const parsedBody = JSON.parse(result.body);
          if (Array.isArray(parsedBody)) {
              receivedMessages = parsedBody.map(item => ({ imageId: item.imageId, senderId: item.senderId, dateReceived:item.dateReceived, message: item.message }));
          }
      }
  
       let s3Thumbnails: { id: string; thumbnail: string; full: string }[] = [];
       for (let i = 1; i <= totalGreetings; i++) {
          const imageId = `GreetingCard${i}.jpg`;
          const thumbnailId = `TN_${imageId}`;
          const thumbnailUrl = `https://animateinput.s3.ap-south-1.amazonaws.com/${thumbnailId}`;
          const fullUrl = `https://animateinput.s3.ap-south-1.amazonaws.com/${imageId}`;
          s3Thumbnails.push({
            id: imageId,
            thumbnail: thumbnailUrl,
            full: fullUrl
          });
        }
  
        if (panel_GT) {
            panel_GT.webview.html = getWebviewContent_GT(
          s3Thumbnails,
          receiverIds,
          receivedMessages
        );
    }
            // Handle webview disposal (when closed)
            panel_GT?.onDidDispose(() => {
                panel_GT = undefined; // Reset the reference
            }, null, context.subscriptions);
      });

      context.subscriptions.push(sayThanks, sayThanksDisposable);

	  senderId = username;
	
  
	  let takeAbreakExtension = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	  takeAbreakExtension.text = `$(play) BreakTime`;
	  takeAbreakExtension.tooltip = "Take a Break...Relax";
	  takeAbreakExtension.command = "extension.takeABreak";
	  takeAbreakExtension.show();
  
	  let getVideoListDisposable = vscode.commands.registerCommand('extension.takeABreak', async () => {
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


export function getWebviewContent_GT(images: { id: string; thumbnail: string; full: string }[], receiverIds: string[], receivedMessages: { imageId: string; senderId: string; dateReceived: string; message: string }[]) {
	const thumbnailsHtml = images.map((img, index) => `
	  <label class="thumb-option">
		<input type="radio" name="thumbnail" value="${img.id}" data-full="${img.full}" ${index === 0 ? 'checked' : ''} />
		<img src="${img.thumbnail}" alt="Thumbnail ${index + 1}" />
	  </label>
	`).join('');
  
	const dropdownHtml = receiverIds.map(id => `
	  <option value="${id}">${id}</option>
	`).join('');
  
	  let rightPanelContent = '';

	  if (receivedMessages.length === 0) {
		rightPanelContent = `<p style="color: gray; padding: 10px;">No Cards Received Yet.</p>`;
	  } else {
		let sortedMessageIds = Array.from(receivedMessages).sort((a, b) => b.dateReceived.localeCompare(a.dateReceived));
		receivedMessages = sortedMessageIds;
		const listHtml = receivedMessages.map((msg, idx) => `
		<label style="display: flex; align-items: center; margin-bottom: 6px;">
		  <input 
			type="radio" 
			name="rightImage" 
			value="${msg.imageId}" 
			data-message="${msg.message || ''}"
			${idx === 0 ? 'checked' : ''} 
		  />
		  <span style="margin-left: 8px;">
			${msg.senderId} - ${msg.dateReceived}
		  </span>
		</label>
	  `).join('');
	  
	  
		const firstImageId = receivedMessages[0].imageId;
		const s3Base = 'https://animateinput.s3.ap-south-1.amazonaws.com/';
		const ext = '.jpg'; // or your actual extension
		const firstImageUrl = `${s3Base}${firstImageId}`;
	  
		rightPanelContent = `
		  <div class="right-scrollable-list">${listHtml}</div>
		  <img id="rightFullImage" src="${firstImageUrl}" alt="Selected Full Image" />
		        <div class="card">
					<div class="emoji">🎉</div>
					<div id="rightImageMessage" style="color: #797bd9; font-size: 16px; font-weight: bold; justify-content: center;"> </div>
				</div>
		  
		`;
	  }
	  
  
	const firstFullImage = images.length > 0 ? images[0].full : '';
  
	return `
	  <!DOCTYPE html>
	  <html lang="en">
	  <head>
		<style>
		  body {
			font-family: sans-serif;
			margin: 0;
			padding: 0;
			display: flex;
			height: 100vh;
			overflow: hidden;
		  }
  
		  .left-panel, .right-panel {
			padding: 16px;
			overflow-y: auto;
		  }
  
		  .left-panel {
			width: 38%;
			border-right: 1px solid #ccc;
		  }
  
		  .right-panel {
		  	position: relative;
			width: 62%;
			display: flex;
			flex-direction: column;
		  }
  
		  h2 {
			margin-top: 0;
		  }
  
		  .thumb-scroll-container {
			display: flex;
			overflow-x: auto;
			gap: 10px;
			padding-bottom: 12px;
			margin-bottom: 16px;
			border-bottom: 1px solid #ddd;
		  }
  
		  .thumb-option {
			display: flex;
			flex-direction: column;
			align-items: center;
			cursor: pointer;
		  }
  
		  .thumb-option img {
			width: 100px;
			height: 60px;
			object-fit: contain;
			border: 2px solid transparent;
			border-radius: 6px;
		  }
  
		  .thumb-option input:checked + img {
			border-color: #007acc;
		  }
  
		  #fullImage {
			width: 95%;
			height: 300px;
			object-fit: contain;
			margin-left: 6px;
			border-radius: 6px;
			background-color: #f0f0f0;
			margin-bottom: 12px;
			display: block;
		  }
  
		  .form-section {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		  }
  
		  #message {
			width: 89%;
			padding: 10px;
			font-size: 14px;
			margin-left: 6px;
			border: 1px solid #ccc;
			border-radius: 4px;
			transition: border-color 0.3s;
		  }
  
		  #message:focus {
			border-color: #007acc;
			outline: none;
		  }
  
		  .bottom-row {
			display: flex;
			gap: 10px;
			margin-left: 14px;
			width: 90%;
		  }
  
		  select {
			flex: 1;
			padding: 8px;
			font-size: 14px;
			border: 1px solid #ccc;
			border-radius: 4px;
			transition: border-color 0.3s;
		  }
  
		  select:focus {
			border-color: #007acc;
			outline: none;
		  }
  
		  button {
			min-width: 85px;
			padding: 8px 12px;
			font-size: 14px;
			border: none;
			border-radius: 4px;
			background-color: #ccc;
			color: #fff;
			cursor: not-allowed;
			transition: background-color 0.3s;
		  }
  
		  button:enabled {
			background-color: #007acc;
			cursor: pointer;
		  }
  
		  .right-scrollable-list {
			max-height: 100px;
			overflow-y: auto;
			border: 1px solid  #444;
			padding: 8px;
			border-radius: 6px;
			margin-bottom: 16px;
			background-color: #222;
		  }

		  #fullImage {
			max-width: 100%;
			height: 300px;
			object-fit: fill;
			background-color: #222;
			border-radius: 6px;
		  }

		  #rightFullImage {
			max-width: 100%;
			height: 400px;
			object-fit: fill;
			background-color: #222;
			border-radius: 6px;
		  }
		.points-display {
		background:rgb(151, 146, 140);
		position: absolute;
		top: 10px;
		right: 16px;
		font-size: 18px;
		padding: 10px;
		font-weight: bold;
		/* Additional styling as needed */
		}
		.card {
          background: #F1ECE5;
		  margin-top: 6px;
          border-radius: 6px;
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
          padding: 40px;
          max-width: 700px;
          text-align: center;
        }
        .card .emoji {
          font-size: 32px;
          margin-bottom: 6px;
        }
		</style>
	  </head>
	  <body>
		<div class="left-panel">
		  <h2>Select a Greeting Card</h2>
  
		  <div class="thumb-scroll-container">
			${thumbnailsHtml}
		  </div>
  
		  <img id="fullImage" src="${firstFullImage}" alt="Full Image Preview" />
  
		  <div class="form-section">
			<textarea id="message" rows="3" placeholder="Enter your message..."></textarea>
			<div class="bottom-row">
			  <select id="receiver">
				<option value="">-- Select Receiver --</option>
				${dropdownHtml}
			  </select>
			  <button id="sendButton" disabled>Send</button>
			</div>
		  </div>
		</div>
  

  
		<div class="right-panel">
		<div class="points-display" id="pointsDisplay" style="color:rgb(98, 7, 63);"></div>
		<h2>Appreciations received</h2>
		${rightPanelContent}
		</div>

		<script>
		  const fullImage = document.getElementById('fullImage');
		  const sendButton = document.getElementById('sendButton');
		  const receiverInput = document.getElementById('receiver');
		  const messageInput = document.getElementById('message');
		  const rightFullImage = document.getElementById('rightFullImage');
		  const rightImageMessage = document.getElementById('rightImageMessage');
		  let selectedImageId = document.querySelector('input[name="thumbnail"]:checked')?.value;
		  console.log("UserName: " , '${senderId}');

			const apiUrl = 'https://ds5mcukui7.execute-api.ap-south-1.amazonaws.com/SayThanksProd/getThanksPoints'; // Replace with your API endpoint

			fetch(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ "userid": '${senderId}' }),
			})
			.then(response => {
				if (!response.ok) {
				throw new Error('Network response was not ok');
				}
				return response.json();
			})
			.then(data => {
			   let totalPoints = 0;
			   const body = JSON.parse(data.body);

				if (!data.body) {
					throw new Error('Invalid response from API');
				}
				else {
					totalPoints = body.totalPoints;
				}

				displayPoints(totalPoints);
			})
			.catch(error => {
				console.error('There was a problem with the fetch operation:', error);
			});

			function displayPoints(points) {
			const pointsDisplay = document.getElementById('pointsDisplay');
			pointsDisplay.textContent = \`Points Earned: \${points}\`;
			}

  
			// Set initial right panel full image on load
			(function initRightPanelImageAndMessage() {
			const firstRightRadio = document.querySelector('input[name="rightImage"]:checked');
			if (firstRightRadio) {
				const id = firstRightRadio.value;
				const msg = firstRightRadio.dataset.message;
				const s3Base = 'https://animateinput.s3.ap-south-1.amazonaws.com/';
				const ext = '.jpg';

				rightFullImage.src = s3Base + id;
				const formattedMessage = msg.replace(/\\n/g, \'<br>\');
				rightImageMessage.innerHTML = formattedMessage;
			}
			})();


		  document.querySelectorAll('input[name="thumbnail"]').forEach(radio => {
			radio.addEventListener('change', (e) => {
			  selectedImageId = e.target.value;
			  const fullUrl = e.target.getAttribute('data-full');
			  fullImage.src = fullUrl;
			  fullImage.style.display = 'block';
			  validateInputs();
			});
		  });
  
			document.querySelectorAll('input[name="rightImage"]').forEach(radio => {
				radio.addEventListener('change', (e) => {
					const id = e.target.value;
					const msg = e.target.dataset.message;
					const s3Base = 'https://animateinput.s3.ap-south-1.amazonaws.com/';
					const ext = '.jpg'; //only jpg supported for now

					rightFullImage.src = s3Base + id;
					const formattedMessage = msg.replace(/\\n/g, \'<br>\');
					rightImageMessage.innerHTML = formattedMessage;
				});
			});
  
		  receiverInput.addEventListener('change', validateInputs);
		  messageInput.addEventListener('input', validateInputs);
  
		  function validateInputs() {
			const message = messageInput.value.trim();
			const receiver = receiverInput.value;
			const enable = selectedImageId && message && receiver;
			sendButton.disabled = !enable;
		  }
  
		  sendButton.addEventListener('click', async () => {
			const message = messageInput.value.trim();
			const receiverId = receiverInput.value;
  
			if (!selectedImageId || !receiverId || !message) return;
  
			const payload = {
			  senderId: '${senderId}',
			  imageId: selectedImageId,
			  receiverId: receiverId,
			  message: message
			};
  
			sendButton.disabled = true;
  
			try {
			  const response = await fetch('https://2zisqo65p2.execute-api.ap-south-1.amazonaws.com/SayThanksProd/updateThanks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			  });
  
			  if (response.ok) {
				alert('Greeting card sent successfully!');
				messageInput.value = '';
				receiverInput.value = '';
				validateInputs();
			  } else {
				alert('Failed to send greeting card.');
				sendButton.disabled = false;
			  }
			} catch (err) {
			  console.error(err);
			  alert('Error sending greeting card.');
			  sendButton.disabled = false;
			}
		  });
  
		  // Initial validation
		  validateInputs();
		</script>
	  </body>
	  </html>
	`;
  }

  async function fetchAllReceivers(context: vscode.ExtensionContext) {

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
                receiverIds = parsedBody.map(item => item.userid).filter(id => id);
				const index = receiverIds.indexOf(senderId!);
				if (index > -1) {
					receiverIds.splice(index, 1); // Remove the senderId from the list	
				}
                else{
                        // Retrieve usersList from global state (default empty array if not found)
                        const usersList: string[] = context.globalState.get("usersList", []);
						if (senderId && !usersList.includes(senderId)) {
                            const success = await registerUser(senderId);
                            if (success) {
                            usersList.push(senderId);
                            await context.globalState.update("usersList", usersList);
                            }
                        }
                }
            }
        }

    } catch (error) {
        const errorMessage = (error as any).message || "Unknown error";
        vscode.window.showErrorMessage("API request failed: " + errorMessage);
    }
}
  
async function getGreetingCount()
{
    const url = "https://animateinput.s3.ap-south-1.amazonaws.com/greetingcount.txt";

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const text = await response.text();
        const numberMatch = text.match(/\d+/); // Extract first number from file

        if (numberMatch) {
            totalGreetings = parseInt(numberMatch[0], 10);
        } else {
            totalGreetings = 0;
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error fetching file: ${error.message}`);
        totalGreetings = 0;
    }
}




/*

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
	*/

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
		vscode.window.showErrorMessage("Unable to Fetch Data: " + errorMessage);
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
		currentPanel = vscode.window.createWebviewPanel('Break-Time', 'Break-Time', vscode.ViewColumn.One, { enableScripts: true });
	}
	
	try {
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
			currentPanel.webview.html = getSocialBreakContent(messageIds.map(item => ({ id: item.id, msg: item.msg, lang:item.lang })), watchedVideos, username || "Guest", totalSongs);
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
						currentPanel = vscode.window.createWebviewPanel('Break-Time', 'Break-Time', vscode.ViewColumn.One, { enableScripts: true });
					}
					if (currentPanel) {
						currentPanel.webview.html = getSocialBreakContent(messageIds.map(item => ({ id: item.id, msg: item.msg, lang:item.lang })), watchedVideos, username || "Guest", totalSongs);
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
		vscode.window.showErrorMessage("Unable to Fetch Data: " + errorMessage);
	}
}

function deactivate() {}
module.exports = { activateAppreciate, deactivate };
