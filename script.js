// PASTE THE FULL JAVASCRIPT FROM THE PREVIOUS MESSAGE HERE
// (The one that includes all the loading animation helper functions,
// fixes for synchronized playback, logic for removing progress bar for camera,
// core video/camera logic that was confirmed working correctly,
// AND HAS BEEN TRANSLATED TO ENGLISH FOR UI TEXTS)
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const btnSelectCurrentPhoto = document.getElementById('btn-select-current-photo');
    const btnSelectDestinationPhoto = document.getElementById('btn-select-destination-photo');
    const currentPhotoFileInp = document.getElementById('current-location-file');
    const destinationPhotoFileInp = document.getElementById('destination-file');
    const imgCurrentPhoto = document.getElementById('img-current-photo');
    const imgDestinationPhoto = document.getElementById('img-destination-photo');
    const currentPhotoNameDisplay = document.getElementById('current-photo-name');
    const destinationPhotoNameDisplay = document.getElementById('destination-photo-name');
    const indoorMapTitle = document.getElementById('indoor-map-title');
    const btnGenerateVideos = document.getElementById('btn-generate-videos');
    const videoOutputArea = document.getElementById('video-output-area');
    const visualNavVideo = document.getElementById('visual-nav-video');
    const indoorMapVideo = document.getElementById('indoor-map-video');
    const navModeToggle = document.getElementById('nav-mode-toggle');
    const visualNavTitle = document.getElementById('visual-nav-title');
    const navModeTextLabel = document.getElementById('nav-mode-text');

    // --- State ---
    let currentPhotoSelected = false;
    let destinationPhotoSelected = false;
    let cameraStream = null;
    let globalIsSyncing = false;
    let videosPreloaded = false;
    let visualNavStandardReady = false;
    let indoorMapStandardReady = false;

    // --- Configuration ---
    const config = {
        demoVideos: {
            standardVisualNav: 'videos/visual_navigation_demo.mp4',
            standardIndoorMap: 'videos/indoor_map_demo.mp4',
            realtimeIndoorLocation: 'videos/realtime_indoor_location_demo.mp4'
        }
    };

    // --- Helper Functions for Loading Animation ---
    function getLoadingElements(videoElement) {
        const container = videoElement.closest('.video-player-container');
        if (!container) return null;
        return {
            overlay: container.querySelector('.loading-animation-overlay'),
            rocket: container.querySelector('.loading-rocket'),
            progressBarFill: container.querySelector('.progress-bar-fill'),
            flames: container.querySelector('.rocket-flames')
        };
    }

    function showLoadingAnimation(videoElement) {
        const elements = getLoadingElements(videoElement);
        if (!elements || !elements.overlay || !elements.rocket || !elements.progressBarFill || !elements.flames) {
            console.warn("Could not find loading elements for", videoElement.id);
            return;
        }
        elements.progressBarFill.style.transition = 'none';
        elements.progressBarFill.style.width = '0%';
        requestAnimationFrame(() => { elements.progressBarFill.style.transition = 'width 0.3s linear'; });
        
        elements.rocket.classList.remove('takeoff');
        elements.rocket.classList.add('bouncing');
        elements.flames.style.opacity = '0';
        elements.flames.style.height = '0px';
        elements.overlay.classList.add('active');
        videoElement.closest('.video-player-container').classList.add('loading-active');
        console.log(`Show loading for ${videoElement.id}`);

        if (videoElement === visualNavVideo && navModeToggle.checked) {
            elements.overlay.classList.add('camera-loading');
        } else {
            elements.overlay.classList.remove('camera-loading');
        }
    }

    function updateLoadingProgress(videoElement, progress) {
        const elements = getLoadingElements(videoElement);
        if (!elements || !elements.progressBarFill) return;
        elements.progressBarFill.style.width = `${Math.min(progress, 100)}%`;
    }

    function hideLoadingAnimation(videoElement, withTakeoff = true) {
        const elements = getLoadingElements(videoElement);
        if (!elements || !elements.overlay || !elements.rocket || !elements.flames) {
            console.warn("Could not find loading elements for hide for", videoElement.id);
            return;
        }
        console.log(`Hide loading for ${videoElement.id}, takeoff: ${withTakeoff}`);
        
        elements.overlay.classList.remove('camera-loading'); 

        if (withTakeoff && videoElement.srcObject !== cameraStream) {
            elements.rocket.classList.remove('bouncing');
            elements.rocket.classList.add('takeoff');
            setTimeout(() => {
                elements.overlay.classList.remove('active');
                elements.rocket.classList.remove('takeoff');
                videoElement.closest('.video-player-container').classList.remove('loading-active');
            }, 1400);
        } else {
            elements.overlay.classList.remove('active');
            elements.rocket.classList.remove('bouncing', 'takeoff');
            elements.flames.style.opacity = '0';
            elements.flames.style.height = '0px';
            videoElement.closest('.video-player-container').classList.remove('loading-active');
        }
    }

    function setupVideoLoadingListeners(videoElement) {
        if (videoElement.dataset.loadingListenersAttached === 'true') return;
        videoElement.dataset.loadingListenersAttached = 'true';

        videoElement.addEventListener('loadstart', () => {
            console.log(`${videoElement.id} loadstart event`);
            showLoadingAnimation(videoElement); 
            updateLoadingProgress(videoElement, 0);
        });
        videoElement.addEventListener('progress', () => {
            if (videoElement.duration && videoElement.buffered.length > 0) {
                const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
                const progressVal = (bufferedEnd / videoElement.duration) * 100;
                updateLoadingProgress(videoElement, progressVal);
            }
        });
        videoElement.addEventListener('waiting', () => {
            console.log(`${videoElement.id} waiting event`);
            showLoadingAnimation(videoElement); 
        });
        videoElement.addEventListener('canplaythrough', () => {
            console.log(`${videoElement.id} canplaythrough event`);
            updateLoadingProgress(videoElement, 100);
        });
        videoElement.addEventListener('playing', () => {
            console.log(`${videoElement.id} playing event`);
            updateLoadingProgress(videoElement, 100);
            hideLoadingAnimation(videoElement, videoElement.srcObject !== cameraStream);
        });
        videoElement.addEventListener('error', (e) => {
            console.error(`${videoElement.id} error event:`, e);
            updateLoadingProgress(videoElement, 0);
            hideLoadingAnimation(videoElement, false);
        });
        videoElement.addEventListener('emptied', () => {
            console.log(`${videoElement.id} emptied event`);
            updateLoadingProgress(videoElement, 0);
        });
    }
    
    // --- Core Functions ---
    function updateGenerateButtonState() {
        btnGenerateVideos.disabled = !(currentPhotoSelected && destinationPhotoSelected);
    }

    function handlePhotoUpload(event, imgElement, nameDisplayElement, photoType) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                imgElement.src = e.target.result;
                imgElement.style.display = 'block';
            }
            reader.readAsDataURL(file);
            nameDisplayElement.textContent = `Selected: ${file.name}`;
            if (photoType === 'current') currentPhotoSelected = true;
            else if (photoType === 'destination') destinationPhotoSelected = true;
        } else {
            imgElement.src = "#";
            imgElement.style.display = 'none';
            nameDisplayElement.textContent = "No image selected";
            if (photoType === 'current') currentPhotoSelected = false;
            else if (photoType === 'destination') destinationPhotoSelected = false;
        }
        updateGenerateButtonState();
    }

    async function startCamera() {
        console.log("Attempting to start camera...");
        showLoadingAnimation(visualNavVideo); 

        if (cameraStream && visualNavVideo.srcObject === cameraStream && !visualNavVideo.paused) {
            console.log("Camera already started and playing.");
            hideLoadingAnimation(visualNavVideo, false); 
            return;
        }
        if (cameraStream && visualNavVideo.srcObject !== cameraStream) {
            visualNavVideo.srcObject = cameraStream;
            console.log("Reattached existing camera stream.");
        }
        if (cameraStream && visualNavVideo.paused) {
             try {
                await visualNavVideo.play(); 
                console.log("Resumed paused camera stream.");
                return; 
            } catch (e) {
                console.warn("Resuming camera stream failed, will try to get new stream.", e);
                hideLoadingAnimation(visualNavVideo, false);
            }
        }
        
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }

        try {
            const constraints = { video: { facingMode: "environment" }, audio: false };
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            visualNavVideo.srcObject = cameraStream;
            visualNavVideo.src = ""; 
            visualNavVideo.muted = true;
            visualNavVideo.controls = false; 
            await visualNavVideo.play(); 
            console.log("Camera started successfully and playing.");
            visualNavTitle.textContent = "Current Location Image"; 
        } catch (err) {
            console.error("Error starting camera:", err);
            visualNavTitle.textContent = "Camera Feed (Error)";
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
                cameraStream = null;
            }
            visualNavVideo.srcObject = null;
            visualNavVideo.controls = true; 
            hideLoadingAnimation(visualNavVideo, false);
        }
    }

    function stopCamera() {
        console.log("Stopping camera...");
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
            console.log("Camera stream tracks stopped.");
        }
        if (visualNavVideo.srcObject) {
            visualNavVideo.srcObject = null; 
            console.log("Camera stream detached from video element.");
        }
        hideLoadingAnimation(visualNavVideo, false); 
    }

    function setupInitialVideoSources() {
        if (videosPreloaded) return;
        if (!visualNavVideo.src && config.demoVideos.standardVisualNav) {
            visualNavVideo.src = config.demoVideos.standardVisualNav;
        }
        if (!indoorMapVideo.src && config.demoVideos.standardIndoorMap) {
            indoorMapVideo.src = config.demoVideos.standardIndoorMap;
        }
        videosPreloaded = true;
        console.log("Initial video sources set for preloading (standard mode).");
    }

    function attemptSynchronizedPlay(isInitialPlayIntent) {
        if (navModeToggle.checked) return; 

        if (visualNavStandardReady && indoorMapStandardReady) {
            console.log("Both standard videos ready. Attempting synchronized play.");
            let playVisual = isInitialPlayIntent || visualNavVideo.dataset.intendedToPlay === 'true';
            let playIndoor = isInitialPlayIntent || indoorMapVideo.dataset.intendedToPlay === 'true';

            if (playVisual) {
                visualNavVideo.play().catch(e => console.warn(`Error playing visualNavVideo (sync attempt):`, e));
            }
            if (playIndoor) {
                indoorMapVideo.play().catch(e => console.warn(`Error playing indoorMapVideo (sync attempt):`, e));
            }
        } else {
            console.log(`Synchronized play condition not met: visualNav=${visualNavStandardReady}, indoorMap=${indoorMapStandardReady}`);
        }
    }

    function updateVisualNavSource() {
        const isRealtimeMode = navModeToggle.checked;
        console.log(`updateVisualNavSource called. Realtime mode: ${isRealtimeMode}. globalIsSyncing: ${globalIsSyncing}`);

        const visualNavWasPlayingPreviously = !visualNavVideo.paused && visualNavVideo.readyState >= 2 && visualNavVideo.srcObject !== cameraStream;
        const visualNavCurrentTime = visualNavVideo.srcObject === cameraStream ? 0 : visualNavVideo.currentTime;
        const indoorMapWasPlayingPreviously = !indoorMapVideo.paused && indoorMapVideo.readyState >= 2;
        const indoorMapCurrentTime = indoorMapVideo.currentTime;

        const isInitialGenerationPlay = !videoOutputArea.classList.contains('hidden') &&
                                       !isRealtimeMode &&
                                       (!visualNavVideo.played.length && !indoorMapVideo.played.length);

        if (globalIsSyncing) {
            console.warn("Sync operation in progress. updateVisualNavSource call deferred.");
            requestAnimationFrame(updateVisualNavSource);
            return;
        }
        globalIsSyncing = true;

        visualNavVideo.pause();
        indoorMapVideo.pause();
        console.log("Paused both videos for source update.");

        visualNavStandardReady = false;
        indoorMapStandardReady = false;
        visualNavVideo.dataset.intendedToPlay = 'false'; 
        indoorMapVideo.dataset.intendedToPlay = 'false';

        if (isRealtimeMode) {
            visualNavTitle.textContent = "Current Location Image";
            indoorMapTitle.textContent = "Real-Time Indoor Map Localization and Navigation";
            videoOutputArea.classList.add('realtime-mode');
        } else {
            visualNavTitle.textContent = "Visual Navigation Preview";
            indoorMapTitle.textContent = "Indoor Map Localization and Navigation";
            videoOutputArea.classList.remove('realtime-mode');
        }
        navModeTextLabel.textContent = isRealtimeMode ? "Real-Time Visual Navigation" : "Visual Navigation";
        
        visualNavVideo.onloadeddata = null; 
        visualNavVideo.onerror = (e) => { console.error("visualNavVideo error during update:", visualNavVideo.error, e); hideLoadingAnimation(visualNavVideo, false); };
        indoorMapVideo.onloadeddata = null;
        indoorMapVideo.onerror = (e) => { console.error("indoorMapVideo error during update:", indoorMapVideo.error, e); hideLoadingAnimation(indoorMapVideo, false); };

        if (isRealtimeMode) {
            console.log("Switching to Realtime Mode.");
            stopCamera(); 
            visualNavVideo.src = ""; 
            visualNavVideo.removeAttribute("src");
            visualNavVideo.srcObject = null; 
            visualNavVideo.controls = false;
            
            startCamera().then(() => { 
                console.log("Camera started for visualNavVideo in realtime mode.");
                if (indoorMapVideo.src !== config.demoVideos.realtimeIndoorLocation) {
                    console.log("Setting indoorMapVideo source for realtime.");
                    showLoadingAnimation(indoorMapVideo);
                    indoorMapVideo.src = config.demoVideos.realtimeIndoorLocation;
                    indoorMapVideo.load();
                } else if (indoorMapVideo.paused && (indoorMapWasPlayingPreviously || (cameraStream && !visualNavVideo.paused))) {
                    console.log("indoorMapVideo source is same (realtime), attempting to play.");
                    indoorMapVideo.play().catch(e => console.warn("Error playing indoorMapVideo (realtime, same src):", e));
                }
                indoorMapVideo.controls = true;

                const onMapLoadedRT = () => {
                    console.log("indoorMapVideo (realtime) loadeddata.");
                    indoorMapVideo.currentTime = indoorMapWasPlayingPreviously ? indoorMapCurrentTime : 0;
                    if (indoorMapWasPlayingPreviously || (cameraStream && !visualNavVideo.paused)) { 
                        indoorMapVideo.play().catch(e => console.warn("Error playing indoorMapVideo (realtime, onMapLoadedRT):", e));
                    }
                    cleanupListeners(indoorMapVideo, onMapLoadedRT, onMapErrorRT);
                };
                const onMapErrorRT = (e) => {
                    console.error("Error loading indoorMapVideo (realtime):", e);
                    hideLoadingAnimation(indoorMapVideo, false);
                    cleanupListeners(indoorMapVideo, onMapLoadedRT, onMapErrorRT);
                };
                
                if (indoorMapVideo.src === config.demoVideos.realtimeIndoorLocation && indoorMapVideo.readyState >= 2) {
                    onMapLoadedRT();
                } else if (indoorMapVideo.src === config.demoVideos.realtimeIndoorLocation) {
                    indoorMapVideo.addEventListener('loadeddata', onMapLoadedRT);
                    indoorMapVideo.addEventListener('error', onMapErrorRT);
                } else {
                     hideLoadingAnimation(indoorMapVideo, false);
                }
                requestAnimationFrame(() => { globalIsSyncing = false; console.log("Realtime mode setup potentially complete."); });

            }).catch(err => {
                console.error("startCamera promise rejected in realtime mode:", err);
                hideLoadingAnimation(visualNavVideo, false); 
                hideLoadingAnimation(indoorMapVideo, false); 
                requestAnimationFrame(() => { globalIsSyncing = false; });
            });

        } else { // Standard Mode
            console.log("Switching to Standard Mode.");
            stopCamera(); 
            visualNavVideo.srcObject = null; 
            visualNavVideo.controls = true;
            indoorMapVideo.controls = true;

            const setupStandardVideo = (video, wasPlaying, time, videoSrc, attemptAutoplay, readyFlagSetter) => {
                return new Promise((resolve, reject) => {
                    video.dataset.intendedToPlay = (attemptAutoplay || wasPlaying).toString();
                    let sourceChanged = false;
                    const currentFullSrc = video.currentSrc ? new URL(video.currentSrc, document.baseURI).pathname : "";
                    const targetFullSrc = videoSrc ? new URL(videoSrc, document.baseURI).pathname : "";

                    if (targetFullSrc && currentFullSrc !== targetFullSrc) {
                        video.src = videoSrc; sourceChanged = true;
                    } else if (!video.src && videoSrc) {
                        video.src = videoSrc; sourceChanged = true;
                    }
                    
                    if (sourceChanged || (video.src.endsWith(videoSrc.substring(videoSrc.lastIndexOf('/')+1)) && video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA)) {
                        console.log(`${video.id} (standard) - Condition met to show loading animation.`);
                        showLoadingAnimation(video);
                    } else if (video.src.endsWith(videoSrc.substring(videoSrc.lastIndexOf('/')+1)) && (attemptAutoplay || wasPlaying) && video.paused && video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                        console.log(`${video.id} (standard) - Preloaded, ready, will attempt play. Showing loading animation.`);
                        showLoadingAnimation(video);
                    }

                    if (sourceChanged) {
                        console.log(`Source for ${video.id} changed to ${videoSrc}. JS calling load().`);
                        video.load(); 
                    }

                    const onLoadedStd = () => {
                        console.log(`${video.id} (standard) loadeddata. ReadyState: ${video.readyState}`);
                        if (video.readyState >= 1 && (sourceChanged || Math.abs(video.currentTime - time) > 0.2)) {
                            video.currentTime = time;
                        }
                        readyFlagSetter(true);
                        console.log(`${video.id} is now ready. Checking for synchronized play (initial: ${isInitialGenerationPlay}).`);
                        attemptSynchronizedPlay(isInitialGenerationPlay);
                        cleanupListeners(video, onLoadedStd, onErrorStd);
                        resolve();
                    };
                    const onErrorStd = (e) => {
                        console.error(`Error loading ${video.id} (standard):`, e);
                        hideLoadingAnimation(video, false);
                        readyFlagSetter(false);
                        cleanupListeners(video, onLoadedStd, onErrorStd);
                        reject(e);
                    };

                    if (video.src.endsWith(videoSrc.substring(videoSrc.lastIndexOf('/')+1)) && video.readyState >= 2 && !sourceChanged) { 
                        console.log(`${video.id} (standard) - already loaded and source correct. Calling onLoadedStd.`);
                        hideLoadingAnimation(video, false); 
                        onLoadedStd();
                    } else if (video.src.endsWith(videoSrc.substring(videoSrc.lastIndexOf('/')+1)) || sourceChanged) { 
                        video.addEventListener('loadeddata', onLoadedStd);
                        video.addEventListener('error', onErrorStd);
                        if (!sourceChanged && (video.networkState === HTMLMediaElement.NETWORK_EMPTY || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE)) {
                           console.log(`${video.id} (standard) - src was correct but network empty/no_source. Calling load().`);
                           showLoadingAnimation(video);
                           video.load(); 
                        }
                    } else if (!videoSrc) { 
                        hideLoadingAnimation(video, false);
                        readyFlagSetter(true); 
                        resolve();
                    } else {
                        hideLoadingAnimation(video, false);
                        readyFlagSetter(false);
                        reject(new Error(`${video.id} in unexpected state for standard mode.`));
                    }
                });
            };

            Promise.allSettled([
                setupStandardVideo(visualNavVideo, visualNavWasPlayingPreviously, visualNavCurrentTime, config.demoVideos.standardVisualNav, isInitialGenerationPlay, (isReady) => visualNavStandardReady = isReady),
                setupStandardVideo(indoorMapVideo, indoorMapWasPlayingPreviously, indoorMapCurrentTime, config.demoVideos.standardIndoorMap, isInitialGenerationPlay, (isReady) => indoorMapStandardReady = isReady)
            ]).then(results => {
                results.forEach(result => {
                    if (result.status === 'rejected') {
                        console.error("A standard video setup failed:", result.reason);
                    }
                });
            }).finally(() => {
                requestAnimationFrame(() => { globalIsSyncing = false; console.log("Standard mode video setup complete."); });
            });
        }
    }

    function cleanupListeners(videoElement, loadedHandler, errorHandler) {
        videoElement.removeEventListener('loadeddata', loadedHandler);
        videoElement.removeEventListener('error', errorHandler);
    }

    function generateVideos() {
        if (!currentPhotoSelected || !destinationPhotoSelected) {
            alert('Please select images for both current location and target location first!');
            return;
        }
        btnGenerateVideos.style.display = 'none';
        videoOutputArea.classList.remove('hidden');
        console.log("Generate Videos button clicked.");
        
        if (!navModeToggle.checked) { 
            const checkAndShowLoading = (video, targetSrcPath) => {
                const targetFilename = targetSrcPath.substring(targetSrcPath.lastIndexOf('/') + 1);
                // Ensure video.src exists and is a string before calling includes or endsWith
                if (video.src && typeof video.src === 'string' && video.src.includes(targetFilename) && video.paused && video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
                     console.log(`GenerateVideos: Showing loading for preloaded but not ready ${video.id}`);
                    showLoadingAnimation(video);
                }
            };
            checkAndShowLoading(visualNavVideo, config.demoVideos.standardVisualNav);
            checkAndShowLoading(indoorMapVideo, config.demoVideos.standardIndoorMap);
        }
        
        updateVisualNavSource();

        const attemptScroll = () => {
            if (!globalIsSyncing) {
                const parentSection = document.getElementById('video-generation-output-section');
                if (parentSection) parentSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                requestAnimationFrame(attemptScroll);
            }
        };
        requestAnimationFrame(attemptScroll);
    }

    function performSyncAction(sourceVideo, targetVideo, action, value) {
        if (targetVideo === visualNavVideo && navModeToggle.checked && targetVideo.srcObject) return;
        if (sourceVideo === visualNavVideo && navModeToggle.checked && sourceVideo.srcObject && action === 'seeked') return;

        let shouldSetGlobalSync = sourceVideo.id !== 'programmatic' && !globalIsSyncing;
        if (shouldSetGlobalSync) {
            globalIsSyncing = true;
        }

        let operationPromise = Promise.resolve();
        switch (action) {
            case 'play':
                if (targetVideo.paused) {
                    operationPromise = targetVideo.play().catch(e => console.warn(`Sync PLAY on ${targetVideo.id} failed:`, e));
                }
                break;
            case 'pause':
                if (!targetVideo.paused) targetVideo.pause();
                break;
            case 'seeked':
                if (targetVideo.readyState >= 1 && Math.abs(targetVideo.currentTime - value) > 0.2) {
                    targetVideo.currentTime = value;
                }
                break;
        }
        Promise.resolve(operationPromise).finally(() => {
            if (shouldSetGlobalSync) {
                requestAnimationFrame(() => { globalIsSyncing = false; });
            }
        });
    }

    function setupVideoEventListeners(video1, video2) {
        const createHandler = (action) => () => {
            const isVideo1Camera = video1 === visualNavVideo && navModeToggle.checked && video1.srcObject;
            const isVideo2Camera = video2 === visualNavVideo && navModeToggle.checked && video2.srcObject;

            if (isVideo2Camera) return;
            if (isVideo1Camera && action === 'seeked') return;

            if (!globalIsSyncing || action === 'seeked') {
                performSyncAction(video1, video2, action, action === 'seeked' ? video1.currentTime : undefined);
            } else {
                 console.log(`Sync for ${action} on ${video1.id} throttled by globalIsSyncing.`);
            }
        };
        video1.addEventListener('play', createHandler('play'));
        video1.addEventListener('pause', createHandler('pause'));
        video1.addEventListener('seeked', createHandler('seeked'));
    }
    
    // --- Event Listeners ---
    btnSelectCurrentPhoto.addEventListener('click', () => currentPhotoFileInp.click());
    btnSelectDestinationPhoto.addEventListener('click', () => destinationPhotoFileInp.click());
    currentPhotoFileInp.addEventListener('change', (event) => handlePhotoUpload(event, imgCurrentPhoto, currentPhotoNameDisplay, 'current'));
    destinationPhotoFileInp.addEventListener('change', (event) => handlePhotoUpload(event, imgDestinationPhoto, destinationPhotoNameDisplay, 'destination'));
    btnGenerateVideos.addEventListener('click', generateVideos);
    navModeToggle.addEventListener('change', updateVisualNavSource);
    
    // --- Initial Setup ---
    imgCurrentPhoto.style.display = 'none';
    imgDestinationPhoto.style.display = 'none';
    videoOutputArea.classList.remove('realtime-mode');

    setupVideoLoadingListeners(visualNavVideo);
    setupVideoLoadingListeners(indoorMapVideo);
    
    setupVideoEventListeners(visualNavVideo, indoorMapVideo);
    setupVideoEventListeners(indoorMapVideo, visualNavVideo);

    updateGenerateButtonState();
    stopCamera(); 
    setupInitialVideoSources();

    visualNavTitle.textContent = "Visual Navigation Preview";
    indoorMapTitle.textContent = "Indoor Map Localization and Navigation";
    navModeTextLabel.textContent = "Visual Navigation";
});