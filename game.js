import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Game state
let scene, camera, renderer;
let player, playerMixer;
let ground = [];
let obstacles = [];
let coins = [];
let gameSpeed = 0.2;
let score = 0;
let ethCollected = 0;
let obstaclesPassed = 0;
let gameOver = false;
let isJumping = false;
let jumpVelocity = 0;

// Game over screen 3D model
let gameOverScene, gameOverCamera, gameOverRenderer;
let idleModel, idleMixer;

// Player position
const lanes = [-3, 0, 3];
let currentLane = 1;
let targetLane = 1;

// Constants
const GROUND_LENGTH = 20;
const GROUND_WIDTH = 10;
const GRAVITY = 0.015;
const JUMP_POWER = 0.35;
const PLAYER_Y_OFFSET = 0;

// Initialize the game
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 10, 100);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 8);
    camera.lookAt(0, 2, 0);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure proper color rendering
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.body.appendChild(renderer.domElement);

    // Lighting - increased brightness to show colors better
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    // Expand shadow camera to cover the entire visible path
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 150; // Extend far distance to cover entire path
    directionalLight.shadow.mapSize.width = 2048; // Higher resolution shadows
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Add a fill light to brighten the character
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
    fillLight.position.set(-5, 5, 10);
    scene.add(fillLight);

    // Create initial ground segments - extending forward and behind player
    // Skip obstacles on first 3 segments to give player a clear start
    createGroundSegment(10, true); // Behind player - no obstacles
    createGroundSegment(-10, true); // Around player - no obstacles
    createGroundSegment(-10 - GROUND_LENGTH, true); // Ahead - no obstacles
    createGroundSegment(-10 - GROUND_LENGTH * 2); // Start adding obstacles
    createGroundSegment(-10 - GROUND_LENGTH * 3);
    createGroundSegment(-10 - GROUND_LENGTH * 4);
    createGroundSegment(-10 - GROUND_LENGTH * 5);

    // Load player model
    loadPlayer();

    // Event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);

    // Setup game over screen 3D model
    setupGameOverModel();

    // Start animation loop
    animate();
}

// Setup the game over screen 3D model display
function setupGameOverModel() {
    const container = document.getElementById('gameOverModel');

    // Create separate scene for game over model
    gameOverScene = new THREE.Scene();
    // Make scene background transparent so CSS background shows through
    gameOverScene.background = null;

    // Camera for game over model - pull back and raise to show full head
    gameOverCamera = new THREE.PerspectiveCamera(50, 250 / 450, 0.1, 100);
    gameOverCamera.position.set(0, 1.5, 4.5);
    gameOverCamera.lookAt(0, 1, 0);

    // Renderer for game over model - fully transparent to use CSS background
    gameOverRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gameOverRenderer.setSize(250, 450);
    gameOverRenderer.outputEncoding = THREE.sRGBEncoding;
    gameOverRenderer.setClearColor(0x000000, 0); // Transparent background
    container.appendChild(gameOverRenderer.domElement);

    // Lighting for game over model
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    gameOverScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(2, 3, 2);
    gameOverScene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x627EEA, 0.5);
    fillLight.position.set(-2, 1, -1);
    gameOverScene.add(fillLight);

    // Load idle model
    const loader = new GLTFLoader();
    loader.load('vitalik_buterin_idle.glb', (gltf) => {
        idleModel = gltf.scene;

        // Position model to show full head and body
        idleModel.position.set(0, -0.2, 0);
        idleModel.scale.set(1, 1, 1);

        // Setup animation
        if (gltf.animations && gltf.animations.length > 0) {
            idleMixer = new THREE.AnimationMixer(idleModel);
            const action = idleMixer.clipAction(gltf.animations[0]);
            action.play();
        }

        gameOverScene.add(idleModel);
    });

    // Render loop for game over model
    function renderGameOverModel() {
        requestAnimationFrame(renderGameOverModel);

        if (idleMixer) {
            idleMixer.update(0.016);
        }

        gameOverRenderer.render(gameOverScene, gameOverCamera);
    }
    renderGameOverModel();
}

// Load the player GLB model
function loadPlayer() {
    const loader = new GLTFLoader();
    loader.load('vitalik_buterin_running.glb', (gltf) => {
        player = gltf.scene;

        // Scale and position the player
        player.scale.set(1, 1, 1);
        player.position.set(lanes[currentLane], PLAYER_Y_OFFSET, 5);
        player.rotation.y = Math.PI;

        // Enable shadows and ensure materials/textures are properly configured
        player.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;

                // Debug: Log material info
                console.log('Mesh:', node.name, 'Material:', node.material);

                // Ensure material and textures are properly configured
                if (node.material) {
                    // Handle texture color space
                    if (node.material.map) {
                        console.log('Found texture map on', node.name);
                        node.material.map.colorSpace = THREE.SRGBColorSpace;
                        node.material.map.needsUpdate = true;
                    }

                    // Handle other texture maps
                    if (node.material.emissiveMap) {
                        console.log('Found emissive map on', node.name);
                        node.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                        node.material.emissiveMap.needsUpdate = true;
                    }

                    // Check for base color
                    if (node.material.color) {
                        console.log('Material color:', node.material.color);
                    }

                    node.material.needsUpdate = true;
                }
            }
        });

        // Setup animation mixer
        if (gltf.animations && gltf.animations.length > 0) {
            playerMixer = new THREE.AnimationMixer(player);
            const action = playerMixer.clipAction(gltf.animations[0]);
            action.play();
        }

        scene.add(player);
    }, undefined, (error) => {
        console.error('Error loading GLB model:', error);
        // Create a fallback cube if model fails to load
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        player = new THREE.Mesh(geometry, material);
        player.position.set(lanes[currentLane], PLAYER_Y_OFFSET + 1, 5);
        player.castShadow = true;
        scene.add(player);
    });
}

// Create an Ethereum logo coin using geometry
function createEthCoin() {
    const coinGroup = new THREE.Group();

    // Ethereum diamond shape (simplified)
    const ethColor = 0x627EEA; // Ethereum purple/blue
    const material = new THREE.MeshPhongMaterial({
        color: ethColor,
        emissive: ethColor,
        emissiveIntensity: 0.3,
        flatShading: true
    });

    // Top pyramid (pointing up)
    const topGeometry = new THREE.ConeGeometry(0.3, 0.4, 4);
    const topPyramid = new THREE.Mesh(topGeometry, material);
    topPyramid.position.y = 0.2;
    topPyramid.rotation.y = Math.PI / 4;
    topPyramid.castShadow = false; // Don't cast shadows
    topPyramid.receiveShadow = false;
    coinGroup.add(topPyramid);

    // Bottom pyramid (pointing down)
    const bottomGeometry = new THREE.ConeGeometry(0.3, 0.4, 4);
    const bottomPyramid = new THREE.Mesh(bottomGeometry, material);
    bottomPyramid.position.y = -0.2;
    bottomPyramid.rotation.y = Math.PI / 4;
    bottomPyramid.rotation.z = Math.PI;
    bottomPyramid.castShadow = false; // Don't cast shadows
    bottomPyramid.receiveShadow = false;
    coinGroup.add(bottomPyramid);

    return coinGroup;
}

// Create a ground segment
function createGroundSegment(zPos, skipObstacles = false) {
    const group = new THREE.Group();
    group.position.z = zPos; // Set the group's position, not the individual meshes

    // Main ground
    const groundGeometry = new THREE.BoxGeometry(GROUND_WIDTH, 0.5, GROUND_LENGTH);
    const groundMaterial = new THREE.MeshPhongMaterial({
        color: 0x8B7355,
        flatShading: true
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.position.set(0, -0.25, 0); // Position relative to group
    groundMesh.receiveShadow = true;
    group.add(groundMesh);

    // Side walls
    const wallGeometry = new THREE.BoxGeometry(1, 3, GROUND_LENGTH);
    const wallMaterial = new THREE.MeshPhongMaterial({ color: 0x654321 });

    const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
    leftWall.position.set(-GROUND_WIDTH/2 - 0.5, 1.5, 0); // Position relative to group
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeometry, wallMaterial);
    rightWall.position.set(GROUND_WIDTH/2 + 0.5, 1.5, 0); // Position relative to group
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    // Add obstacles randomly (but not if skipObstacles is true)
    if (!skipObstacles && Math.random() < 0.7) {
        const obstacleCount = Math.floor(Math.random() * 2) + 1;
        const usedLanes = new Set();

        for (let i = 0; i < obstacleCount; i++) {
            let laneidx;
            do {
                laneidx = Math.floor(Math.random() * 3);
            } while (usedLanes.has(laneidx));
            usedLanes.add(laneidx);

            const obstacleGeometry = new THREE.BoxGeometry(1.5, 2, 1.5);
            const obstacleMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
            const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
            // Place obstacles in the back portion of the segment (negative Z)
            const obstacleZ = -GROUND_LENGTH/4 - Math.random() * (GROUND_LENGTH/4);
            obstacle.position.set(lanes[laneidx], 1, obstacleZ);
            obstacle.castShadow = true;
            obstacle.receiveShadow = true;
            group.add(obstacle);
            obstacles.push({
                mesh: obstacle,
                segmentGroup: group
            });
        }
    }

    // Add coins (but not if skipObstacles is true)
    if (!skipObstacles) {
        const coinCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < coinCount; i++) {
            const coin = createEthCoin();
            const laneidx = Math.floor(Math.random() * 3);
            // Spread coins throughout the segment
            const coinZ = -GROUND_LENGTH/2 + Math.random() * GROUND_LENGTH;
            coin.position.set(lanes[laneidx], 1.5, coinZ);
            group.add(coin);
            coins.push({
                mesh: coin,
                segmentGroup: group
            });
        }
    }

    scene.add(group);
    ground.push(group);
}

// Handle keyboard input
function onKeyDown(event) {
    if (gameOver) return;

    switch(event.code) {
        case 'ArrowLeft':
            if (currentLane > 0) {
                currentLane--;
                targetLane = currentLane;
            }
            break;
        case 'ArrowRight':
            if (currentLane < 2) {
                currentLane++;
                targetLane = currentLane;
            }
            break;
        case 'Space':
            if (!isJumping && player) {
                isJumping = true;
                jumpVelocity = JUMP_POWER;
            }
            event.preventDefault();
            break;
    }
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update game state
function update(deltaTime) {
    if (gameOver || !player) return;

    // Update score display
    document.getElementById('score').textContent = `Score: ${score}`;

    // Increase speed over time
    gameSpeed += 0.0001;

    // Move player towards target lane
    const targetX = lanes[currentLane];
    player.position.x += (targetX - player.position.x) * 0.15;

    // Handle jumping
    if (isJumping) {
        player.position.y += jumpVelocity;
        jumpVelocity -= GRAVITY;

        if (player.position.y <= PLAYER_Y_OFFSET) {
            player.position.y = PLAYER_Y_OFFSET;
            isJumping = false;
            jumpVelocity = 0;
        }
    }

    // Update animation
    if (playerMixer) {
        playerMixer.update(deltaTime);
    }

    // Move ground segments
    ground.forEach((segment, index) => {
        segment.position.z += gameSpeed;

        // Recycle ground segments - recycle when they pass behind the camera
        if (segment.position.z > 20) {
            // Find the furthest segment
            let minZ = Infinity;
            ground.forEach(g => {
                if (g !== segment && g.position.z < minZ) {
                    minZ = g.position.z;
                }
            });
            segment.position.z = minZ - GROUND_LENGTH;

            // Remove old obstacles and coins associated with this segment
            obstacles = obstacles.filter(obs => obs.segmentGroup !== segment);
            coins = coins.filter(coin => coin.segmentGroup !== segment);

            // Clear old obstacles and coins from the segment
            const objectsToRemove = [];
            segment.children.forEach(child => {
                // Remove red obstacles (BoxGeometry) and coin groups
                if ((child.geometry && child.geometry.type === 'BoxGeometry' && child.material.color.getHex() === 0xff0000) ||
                    (child.isGroup && child.children.length > 0 && child.children[0].geometry && child.children[0].geometry.type === 'ConeGeometry')) {
                    objectsToRemove.push(child);
                }
            });
            objectsToRemove.forEach(obj => segment.remove(obj));

            // Add new obstacles
            if (Math.random() < 0.7) {
                const obstacleCount = Math.floor(Math.random() * 2) + 1;
                const usedLanes = new Set();

                for (let i = 0; i < obstacleCount; i++) {
                    let laneidx;
                    do {
                        laneidx = Math.floor(Math.random() * 3);
                    } while (usedLanes.has(laneidx));
                    usedLanes.add(laneidx);

                    const obstacleGeometry = new THREE.BoxGeometry(1.5, 2, 1.5);
                    const obstacleMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
                    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
                    // Place obstacles in the back portion of the segment (negative Z)
                    const obstacleZ = -GROUND_LENGTH/4 - Math.random() * (GROUND_LENGTH/4);
                    obstacle.position.set(lanes[laneidx], 1, obstacleZ);
                    obstacle.castShadow = true;
                    segment.add(obstacle);
                    obstacles.push({
                        mesh: obstacle,
                        segmentGroup: segment
                    });
                }
            }

            // Add new coins
            const coinCount = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < coinCount; i++) {
                const coin = createEthCoin();
                const laneidx = Math.floor(Math.random() * 3);
                // Spread coins throughout the segment
                const coinZ = -GROUND_LENGTH/2 + Math.random() * GROUND_LENGTH;
                coin.position.set(lanes[laneidx], 1.5, coinZ);
                segment.add(coin);
                coins.push({
                    mesh: coin,
                    segmentGroup: segment
                });
            }
        }
    });

    // Animate coins - rotate and bob
    coins.forEach(coinObj => {
        coinObj.mesh.rotation.y += 0.05;
        // Gentle bobbing motion
        const baseY = 1.5;
        coinObj.mesh.position.y = baseY + Math.sin(Date.now() * 0.003 + coinObj.mesh.position.x) * 0.1;
    });

    // Check collision with obstacles and track passed obstacles
    obstacles.forEach(obsObj => {
        const obstacle = obsObj.mesh;
        const worldPos = new THREE.Vector3();
        obstacle.getWorldPosition(worldPos);

        const distance = player.position.distanceTo(worldPos);

        // Check for collision
        if (distance < 1.5 && Math.abs(player.position.y - worldPos.y) < 1.5) {
            endGame();
        }

        // Check if player passed the obstacle (obstacle is now behind player)
        if (!obsObj.passed && worldPos.z > player.position.z + 2) {
            obsObj.passed = true;
            obstaclesPassed++;
            score = (ethCollected * 100) + (obstaclesPassed * 100);
            console.log('Obstacle passed! Total passed:', obstaclesPassed, 'Score:', score);
        }
    });

    // Check coin collection - iterate backwards to safely remove items
    for (let i = coins.length - 1; i >= 0; i--) {
        const coinObj = coins[i];
        const coin = coinObj.mesh;
        const worldPos = new THREE.Vector3();
        coin.getWorldPosition(worldPos);

        // Calculate distance in X and Z (ignore Y for more forgiving collection)
        const dx = player.position.x - worldPos.x;
        const dz = player.position.z - worldPos.z;
        const distance2D = Math.sqrt(dx * dx + dz * dz);

        // Collect coin if player is close enough (larger radius for easier collection)
        if (distance2D < 1.2) {
            ethCollected++;
            score = (ethCollected * 100) + (obstaclesPassed * 100);
            coinObj.segmentGroup.remove(coin);
            coins.splice(i, 1);
            console.log('ETH collected! Total ETH:', ethCollected, 'Score:', score);
        }
    }
}

// Animation loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    update(deltaTime);

    renderer.render(scene, camera);
}

// End game
function endGame() {
    gameOver = true;

    // Update score breakdown
    const ethPoints = ethCollected * 100;
    const obstaclePoints = obstaclesPassed * 100;

    document.getElementById('ethCount').textContent = ethCollected;
    document.getElementById('ethPoints').textContent = ethPoints;
    document.getElementById('obstaclesCount').textContent = obstaclesPassed;
    document.getElementById('obstaclesPoints').textContent = obstaclePoints;
    document.getElementById('finalScore').textContent = score;

    document.getElementById('gameOver').style.display = 'block';
}

// Restart game
window.restartGame = function() {
    // Remove all obstacles and coins
    obstacles.forEach(obsObj => {
        obsObj.segmentGroup.remove(obsObj.mesh);
    });
    coins.forEach(coinObj => {
        coinObj.segmentGroup.remove(coinObj.mesh);
    });

    obstacles = [];
    coins = [];

    // Reset ground segments
    ground.forEach(segment => {
        scene.remove(segment);
    });
    ground = [];

    createGroundSegment(10, true); // Behind player - no obstacles
    createGroundSegment(-10, true); // Around player - no obstacles
    createGroundSegment(-10 - GROUND_LENGTH, true); // Ahead - no obstacles
    createGroundSegment(-10 - GROUND_LENGTH * 2); // Start adding obstacles
    createGroundSegment(-10 - GROUND_LENGTH * 3);
    createGroundSegment(-10 - GROUND_LENGTH * 4);
    createGroundSegment(-10 - GROUND_LENGTH * 5);

    // Reset player position
    if (player) {
        player.position.set(lanes[1], PLAYER_Y_OFFSET, 5);
        currentLane = 1;
        targetLane = 1;
    }

    // Reset game state
    score = 0;
    ethCollected = 0;
    obstaclesPassed = 0;
    gameSpeed = 0.2;
    gameOver = false;
    isJumping = false;
    jumpVelocity = 0;

    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('score').textContent = 'Score: 0';
}

// WebSocket connection to listen for new blocks on Base
function setupBlockListener() {
    const ws = new WebSocket('wss://base-mainnet.g.alchemy.com/v2/wVzdvwQWSkf6DObBafMZA');

    ws.onopen = () => {
        console.log('Connected to Base mainnet WebSocket');

        // Subscribe to new block headers
        const subscribeMessage = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['newHeads']
        });

        ws.send(subscribeMessage);
        console.log('Subscribed to new blocks');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle subscription confirmation
        if (data.id === 1 && data.result) {
            console.log('Subscription ID:', data.result);
        }

        // Handle new block notifications
        if (data.method === 'eth_subscription') {
            const blockData = data.params.result;
            console.log('New block received!', {
                blockNumber: parseInt(blockData.number, 16),
                blockHash: blockData.hash,
                timestamp: parseInt(blockData.timestamp, 16),
                miner: blockData.miner
            });
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket connection closed. Reconnecting in 5 seconds...');
        setTimeout(setupBlockListener, 5000);
    };
}

// Start the game
init();

// Setup block listener
setupBlockListener();
