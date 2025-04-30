import * as vscode from 'vscode';
import * as path from 'path';
import { showHistoryPanel } from './graphView';
import * as fs from 'fs';
import { getKeyboardHeatmapHtml, getKeyboardHeatmapStyle, getKeyboardHeatmapScript } from './keyboardHeatmap';

export function createWebviewPanel(
    context: vscode.ExtensionContext,
    onMessage: (message: any) => void
): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        'typingSpeedAnimation',
        'Typing Speed Visualizer',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getWebviewContent(panel.webview, context);
    panel.webview.onDidReceiveMessage(onMessage, undefined, context.subscriptions);

    return panel;
}


export function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    const initialAnimationFile = getAnimationFile(0);
    
    // Create URI for media files
    const mediaBaseUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'src', 'features', 'typingSpeed', 'media'));
    
    // Verify that required animation files exist in dist/media directory
    try {
        const mediaDir = path.join(context.extensionUri.fsPath, 'src', 'features', 'typingSpeed', 'media');
        const requiredFiles = ['slow1.json', 'slow2.json', 'medium1.json', 'medium2.json', 'fast1.json', 'fast2.json'];
        
        for (const file of requiredFiles) {
            if (!fs.existsSync(path.join(mediaDir, file))) {
                console.warn(`Warning: Animation file not found: ${file}`);
            }
        }
    } catch (error) {
        console.error('Error checking animation files:', error);
    }

    // Get keyboard heatmap HTML, style and script
    const keyboardHeatmapHtml = getKeyboardHeatmapHtml();
    const keyboardHeatmapStyle = getKeyboardHeatmapStyle();
    const keyboardHeatmapScript = getKeyboardHeatmapScript();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Typing Animation</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.7.4/lottie.min.js"></script>
    <style>
        :root {
            --primary-text: #e0e0e0;
            --border-color: rgba(80, 80, 80, 0.5);
            --bg-dark: rgba(30, 30, 30, 0.8);
            --bg-darker: rgba(30, 30, 30, 0.4);
            --button-hover: rgba(60, 60, 60, 0.8);
            --transition-duration: 0.8s;
            --transition-timing: cubic-bezier(0.25, 0.1, 0.25, 1.0);
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            background: transparent;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
            height: 100vh;
            overflow-y: auto;
            font-family: 'Segoe UI', sans-serif;
            color: var(--primary-text);
            padding: 0;
        }

        .content-wrapper {
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }

        #container {
            width: 100%;
            min-height: 300px;
            height: 40vh;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        @media (max-height: 700px) {
            #container {
                min-height: 200px;
                height: 30vh;
            }
        }

        #lottie {
            width: 100%;
            height: 100%;
            pointer-events: none;
            transition: opacity var(--transition-duration) var(--transition-timing);
            opacity: 0; /* Start hidden */
        }
        
        #lottie.loaded {
            opacity: 1;
        }
        
        #lottie.fade-out {
            opacity: 0;
        }
        
        #lottie.fade-in {
            opacity: 1;
        }

        #quote-container {
            padding: 20px;
            text-align: center;
            width: 100%;
            font-size: clamp(1rem, 2vw, 1.5rem);
            font-weight: 500;
            color: white;
            text-shadow: 1px 1px 3px black;
            background: var(--bg-darker);
            border-bottom: 1px solid var(--border-color);
            position: relative;
            overflow: hidden;
        }
        
        #quote {
            transition: transform 0.5s ease, opacity 0.5s ease;
        }
        
        #quote.changing {
            transform: translateY(20px);
            opacity: 0;
        }

        #wpm-value {
            -webkit-background-clip: text; 
            background-clip: text;         
            color: transparent;             
        }

        #wpm-display {
            position: absolute;
            top: 20px;
            left: 20px;
            font-size: clamp(1.5rem, 4vw, 3rem);
            font-weight: 800;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
            background: transparent;
            z-index: 10;
        }

        #emoji {
            font-size: clamp(1.2rem, 3vw, 2rem);
            transition: all 0.3s ease;
        }

        .control-buttons {
            position: absolute;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 10;
            flex-wrap: wrap;
            justify-content: flex-end;
        }

        @media (max-width: 600px) {
            #wpm-display {
                top: 10px;
                left: 10px;
            }
            
            .control-buttons {
                top: 10px;
                right: 10px;
            }
            
            button {
                padding: 4px 8px !important;
                font-size: 0.8rem !important;
            }
        }

        @media (max-width: 480px) {
            .control-buttons {
                flex-direction: column;
                align-items: flex-end;
            }
        }

        button {
            background: var(--bg-dark);
            border: 1px solid #555;
            color: var(--primary-text);
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.9rem;
            white-space: nowrap;
        }

        button:hover {
            background: var(--button-hover);
        }

        .animate-wpm {
            animation: pop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes pop {
            0% { transform: scale(1); opacity: 0.7; }
            50% { transform: scale(1.4); opacity: 1; }
            70% { transform: scale(0.9); }
            100% { transform: scale(1); }
        }
        
        /* Smoother WPM display transitions */
        #wpm-value, #emoji {
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        /* Pulse animation for certain elements */
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        /* Keyboard Heatmap section */
        #keyboard-section {
            width: 100%;
            padding: 20px 10px;
            margin-top: 10px;
            border-top: 1px solid var(--border-color);
            overflow-x: auto;
        }

        /* Custom scrollbar for webkit browsers */
        #keyboard-section::-webkit-scrollbar {
            height: 8px;
        }
        
        #keyboard-section::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.1);
            border-radius: 4px;
        }
        
        #keyboard-section::-webkit-scrollbar-thumb {
            background: rgba(100, 100, 100, 0.5);
            border-radius: 4px;
        }

        /* Make keyboard responsive */
        .keyboard-container {
            min-width: 600px; /* Prevents keyboard from becoming too small */
            max-width: 800px;
            margin: 0 auto;
        }

        /* Enhanced Animation transitions */
        .fade-out {
            opacity: 0 !important;
            transition: opacity var(--transition-duration) var(--transition-timing);
        }
        
        .fade-in {
            opacity: 1 !important;
            transition: opacity var(--transition-duration) var(--transition-timing);
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
        
        @keyframes slideUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes slideDown {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        
        .animate-fade-in {
            animation: fadeIn var(--transition-duration) var(--transition-timing) forwards;
        }
        
        .animate-fade-out {
            animation: fadeOut var(--transition-duration) var(--transition-timing) forwards;
        }
        
        .animate-slide-up {
            animation: slideUp 0.5s ease forwards;
        }
        
        .animate-slide-down {
            animation: slideDown 0.5s ease forwards;
        }

        /* Keyboard Heatmap CSS with responsive adjustments */
        ${keyboardHeatmapStyle.replace(
            // Add responsive modifications to the keyboard heatmap styles here if needed
            '.keyboard-container {',
            '.keyboard-container { min-width: 600px; max-width: 800px; margin: 0 auto;'
        )}
    </style>
</head>
<body>
    <div class="content-wrapper">
        <!-- Quote moved to the top -->
        <div id="quote-container">
            <div id="quote">🐢 Slow and steady wins the race...</div>
        </div>
        
        <div id="container">
            <div id="lottie"></div>
            
            <div id="wpm-display">
                <span id="wpm-value">0</span>
                <span id="emoji">🐢</span>
            </div>

            <div class="control-buttons">
                <button id="toggle-history">Show History</button>
                <button id="reset-stats">Reset Stats</button>
            </div>
        </div>

        <!-- Keyboard Heatmap in its own section -->
        <div id="keyboard-section">
            ${keyboardHeatmapHtml}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let animation;
        let lastWPM = 0;
        let wpmHistory = [];
        let heatmapInitialized = false;
        let animationTransitionInProgress = false;

        function loadAnimation(animationPath) {
            const container = document.getElementById('lottie');
            
            // Prevent multiple transitions from running simultaneously
            if (animationTransitionInProgress) {
                console.log('Animation transition already in progress, skipping');
                return;
            }
            
            animationTransitionInProgress = true;
            
            try {
                // Start the transition - improved fade out
                container.classList.remove('loaded');
                container.classList.remove('fade-in');
                container.classList.add('fade-out');
                
                // Wait for fade out to complete with proper timing
                setTimeout(() => {
                    // Destroy the previous animation if it exists
                    if (animation) {
                        animation.destroy();
                    }
                    
                    try {
                        // Clear the container
                        container.innerHTML = '';
                        
                        // Create the new animation
                        animation = lottie.loadAnimation({
                            container: container,
                            renderer: 'svg',
                            loop: true,
                            autoplay: false, // Start paused to allow for smooth transition
                            path: animationPath
                        });
                        
                        // Set up event listeners
                        animation.addEventListener('DOMLoaded', () => {
                            // Animation has loaded - prepare for fade in
                            container.classList.remove('fade-out');
                            
                            // Brief pause before fading in
                            setTimeout(() => {
                                // Start playing and fade in
                                animation.play();
                                container.classList.add('fade-in');
                                container.classList.add('loaded');
                                
                                // Reset the transition flag after animation completes
                                setTimeout(() => {
                                    animationTransitionInProgress = false;
                                }, 800);
                            }, 100);
                        });
                        
                        animation.addEventListener('data_failed', () => {
                            console.error('Failed to load animation:', animationPath);
                            // Fallback with smooth transition
                            container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;opacity:0;transition:opacity 0.8s cubic-bezier(0.25, 0.1, 0.25, 1.0);" class="fallback-animation"><span style="font-size:3em;">⌨️</span></div>';
                            
                            setTimeout(() => {
                                const fallback = container.querySelector('.fallback-animation');
                                if (fallback) {
                                    fallback.style.opacity = '1';
                                }
                                container.classList.add('loaded');
                                container.classList.add('fade-in');
                                
                                // Reset the transition flag after animation completes
                                setTimeout(() => {
                                    animationTransitionInProgress = false;
                                }, 800);
                            }, 100);
                        });
                        
                    } catch (error) {
                        console.error('Error loading animation:', error);
                        // Fallback with smooth transition
                        container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;opacity:0;transition:opacity 0.8s cubic-bezier(0.25, 0.1, 0.25, 1.0);" class="fallback-animation"><span style="font-size:3em;">⌨️</span></div>';
                        
                        setTimeout(() => {
                            const fallback = container.querySelector('.fallback-animation');
                            if (fallback) {
                                fallback.style.opacity = '1';
                            }
                            container.classList.add('loaded');
                            container.classList.add('fade-in');
                            
                            // Reset the transition flag after animation completes
                            setTimeout(() => {
                                animationTransitionInProgress = false;
                            }, 800);
                        }, 100);
                    }
                }, 800); // Match to CSS transition duration
                
            } catch (error) {
                console.error('Animation error:', error);
                // Fallback with smooth transition
                container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;opacity:0;transition:opacity 0.8s cubic-bezier(0.25, 0.1, 0.25, 1.0);" class="fallback-animation"><span style="font-size:3em;">⌨️</span></div>';
                
                setTimeout(() => {
                    const fallback = container.querySelector('.fallback-animation');
                    if (fallback) {
                        fallback.style.opacity = '1';
                    }
                    container.classList.add('loaded');
                    container.classList.add('fade-in');
                    
                    // Reset the transition flag after animation completes
                    setTimeout(() => {
                        animationTransitionInProgress = false;
                    }, 800);
                }, 100);
            }
        }

        function getSpeedEmoji(wpm) {
            if (wpm <= 10) return "🐢";
            if (wpm <= 20) return "🌱";
            if (wpm <= 35) return "🚶";
            if (wpm <= 50) return "🏃";
            if (wpm <= 65) return "⚡";
            return "🚀";
        }

        function getWPMColor(wpm) {
            // IMPORTANT: This function should match the one in the extension code
            if (wpm < 10) {
                return 'linear-gradient(45deg, #FFD1D1, #FFE5E5)';
            } else if (wpm < 20) {
                return 'linear-gradient(45deg, #FFFACD, #FFF5B7)';
            } else if (wpm < 35) {
                return 'linear-gradient(45deg, #DFFFD6, #E8FFE0)';
            } else if (wpm < 50) {
                return 'linear-gradient(45deg, #D6F6FF, #E0FCFF)';
            } else if (wpm < 65) {
                return 'linear-gradient(45deg, #EAD9FF, #F3E8FF)';
            } else {
                return 'linear-gradient(45deg, #FFD9F7, #FFE0FA)';
            }
        }

        function updateWPMDisplay(newWPM) {
            const wpmValueEl = document.getElementById('wpm-value');
            const emojiEl = document.getElementById('emoji');
            const wpmDisplay = document.getElementById('wpm-display');

            // Animate value pop
            wpmValueEl.classList.remove('animate-wpm');
            void wpmValueEl.offsetWidth; // trigger reflow
            wpmValueEl.classList.add('animate-wpm');

            // Update number smoothly
            wpmValueEl.textContent = newWPM;

            // Update emoji
            emojiEl.textContent = getSpeedEmoji(newWPM);

            // Apply gradient to WPM text color
            const color = getWPMColor(newWPM);
            wpmValueEl.style.backgroundImage = color;
            wpmValueEl.style.webkitBackgroundClip = 'text';
            wpmValueEl.style.backgroundClip = 'text';
            wpmValueEl.style.color = 'transparent';
            
            lastWPM = newWPM;
        }

        // Handle window resize to adjust layout if needed
        window.addEventListener('resize', () => {
            // Any specific resize handling can go here
            // For example, you might need to re-position elements based on window size
        });

        // Keyboard Heatmap Script
        ${keyboardHeatmapScript}

        window.addEventListener('message', event => {
            const message = event.data;
            
            if (message.command === 'update') {
                const { wpm, quote, animationFile, color, history } = message;
                
                // Animate quote change with fade out/in
                const quoteElement = document.getElementById('quote');
                quoteElement.classList.add('changing');
                
                // Wait for fade out, then update content and fade back in
                setTimeout(() => {
                    quoteElement.textContent = quote;
                    quoteElement.classList.remove('changing');
                    
                    // Add a pulse animation to the quote after it appears
                    setTimeout(() => {
                        quoteElement.style.animation = 'pulse 1s ease';
                        
                        // Remove the animation after it completes
                        setTimeout(() => {
                            quoteElement.style.animation = '';
                        }, 1000);
                    }, 500);
                }, 300);
                
                try {
                    const newPath = '${mediaBaseUri}/' + animationFile;
                    loadAnimation(newPath);
                } catch (error) {
                    console.error('Failed to load animation:', error);
                }
                
                updateWPMDisplay(wpm);
                
                if (history) {
                    wpmHistory = history;
                }
            } else if (message.command === 'reset') {
                updateWPMDisplay(0);
                document.getElementById('quote').textContent = '🐢 Slow and steady wins the race...';
                
                // Clear history if requested
                if (message.clearHistory) {
                    wpmHistory = [];
                }
                
                // Clear heatmap if requested
                if (message.clearKeyHeatmap) {
                    resetKeyboardHeatmap();
                }
                
                lastWPM = 0;
            } else if(message.command === 'initKeyboardHeatmap'){
                console.log('Received keyboard heatmap data from extension');
                initKeyboardHeatmap(message.keyPressData);
                heatmapInitialized = true;
            } else if(message.command === 'updateKeyHeat'){
                console.log('Received key press update from extension');
                updateKeyHeat(message.keys);
            }
        });

        document.getElementById('toggle-history').addEventListener('click', () => {
            vscode.postMessage({ 
                command: 'showHistory',
                history: wpmHistory
            });
        });
        
        document.getElementById('reset-stats').addEventListener('click', () => {
            vscode.postMessage({ command: 'resetStats' });
        });

        // Track when DOM is fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM content loaded');
            
            // Notify extension that heatmap is ready to receive data
            setTimeout(() => {
                vscode.postMessage({ command: 'heatmapReady' });
            }, 300);
        });

        window.onload = () => {
            // Send ready message to trigger initial data loading
            vscode.postMessage({ command: 'ready' });
            
            // Check if keyboard DOM elements are ready
            const checkKeyboardElements = setInterval(() => {
                if (document.querySelector('.key')) {
                    clearInterval(checkKeyboardElements);
                    console.log('Keyboard elements found - sending heatmapReady');
                    vscode.postMessage({ command: 'heatmapReady' });
                }
            }, 200);
            
            // Fallback if the keyboard elements check fails
            setTimeout(() => {
                clearInterval(checkKeyboardElements);
                if (!heatmapInitialized) {
                    console.log('Fallback: sending heatmapReady after timeout');
                    vscode.postMessage({ command: 'heatmapReady' });
                }
            }, 2000);
        };
    </script>
</body>
</html>
`;
}

export function getAnimationFile(wpm: number): string {
    if (wpm < 10) {return 'slow1.json';}
    else if (wpm < 20) {return 'slow2.json';}
    else if (wpm < 30) {return 'medium1.json';}
    else if (wpm < 40) {return 'medium2.json';}
    else if (wpm < 50) {return 'fast1.json';}
    else {return 'fast2.json';}
}

export function getQuote(wpm: number): string {
    if (wpm < 10) {return '🐢 Slow and steady wins the race...';}
    else if (wpm < 20) {return '🌱 Warming up... keep those keys moving!';}
    else if (wpm < 35) {return '🚶 Steady and focused — you\'re getting there!';}
    else if (wpm < 50) {return '🏃 Nice flow! You\'re typing like a pro.';}
    else if (wpm < 65) {return '⚡ Speedy fingers! Keep up the great momentum!';}
    else {return '🚀 Typing master unlocked! You\'re on fire!';}
}