import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ethers } from 'ethers';

// Dynamic API URL - use environment variable or fallback to localhost
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// Audio
const coinSound = new Audio('/coin.mp3');
coinSound.volume = 0.3; // Set volume to 30%

const powerupSound = new Audio('/coin.mp3'); // Reuse coin sound for now, can be replaced
powerupSound.volume = 0.5;

const backgroundMusic = new Audio('/track.mp3');
backgroundMusic.volume = 0.2; // Set volume to 20%
backgroundMusic.loop = true; // Loop the track

let isMuted = false;

// Game state
let scene, camera, renderer;
let player, playerMixer;
let backwardPlayer, backwardPlayerMixer; // Backward running model for powerup
let ground = [];
let obstacles = [];
let coins = [];
let powerups = []; // Track powerup coins
let blockchainBlocks = []; // Track blockchain-generated blocks separately
let fallingBlocks = []; // Blocks that are falling through the floor during powerup
let matrixRain = []; // Falling matrix symbols
let gameSpeed = 0.2;
let score = 0;
let ethCollected = 0;
let obstaclesPassed = 0;
let gameOver = false;
let isJumping = false;
let jumpVelocity = 0;
let segmentCounter = 0; // Track segments for safe landing zones

// Powerup state
let powerupActive = false;
let powerupEndTime = 0;
let blockSpawnDelay = 0; // Timestamp when blocks can spawn again
let magneticPowerupActive = false; // Magnetic coin attraction powerup
let magneticPowerupEndTime = 0;

// Blockchain stream management
let eventSource = null;
let reconnectTimeout = null;

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
    // Scene setup - Cyberpunk dark theme
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a); // Dark purple/blue
    scene.fog = new THREE.Fog(0x0a0a1a, 10, 100);

    // Camera setup - pull back more to see all lanes, wider FOV for mobile
    const isMobile = window.innerWidth <= 768;
    const fov = isMobile ? 90 : 75; // Wider field of view on mobile
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 12); // Pull back and raise camera
    camera.lookAt(0, 1, 0);

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

    // Mobile touch controls
    setupMobileControls();

    // Create subtle matrix rain
    createMatrixRain();

    // Start animation loop
    animate();
}

// Create subtle falling matrix symbols
function createMatrixRain() {
    const matrixChars = ['0', '1', 'ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク'];

    // Create only 15 symbols for subtlety
    for (let i = 0; i < 15; i++) {
        // Create canvas for each symbol
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Draw glowing green character
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
        ctx.fillText(char, 32, 32);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);

        // Create sprite material
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.4
        });

        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.5, 0.5, 1);

        // Random position across the track width and height
        sprite.position.x = (Math.random() - 0.5) * 12;
        sprite.position.y = Math.random() * 8 + 5;
        sprite.position.z = (Math.random() - 0.5) * 40;

        // Random fall speed
        sprite.userData.fallSpeed = 0.02 + Math.random() * 0.03;
        sprite.userData.startY = sprite.position.y;

        scene.add(sprite);
        matrixRain.push(sprite);
    }
}

// Load the player GLB model
function loadPlayer() {
    const loader = new GLTFLoader();
    loader.load('/vitalik_buterin_running.glb', (gltf) => {
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

    // Also load the backward running model for powerup
    loadBackwardPlayer();
}

// Load the backward running model (used during powerup)
function loadBackwardPlayer() {
    const loader = new GLTFLoader();
    loader.load('/vitalik_buterin_running_backward.glb', (gltf) => {
        backwardPlayer = gltf.scene;

        // Scale and position (same as regular player)
        backwardPlayer.scale.set(1, 1, 1);
        backwardPlayer.position.set(lanes[currentLane], PLAYER_Y_OFFSET, 5);
        backwardPlayer.rotation.y = Math.PI;

        // Enable shadows
        backwardPlayer.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;

                if (node.material) {
                    if (node.material.map) {
                        node.material.map.colorSpace = THREE.SRGBColorSpace;
                        node.material.map.needsUpdate = true;
                    }
                    if (node.material.emissiveMap) {
                        node.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                        node.material.emissiveMap.needsUpdate = true;
                    }
                    node.material.needsUpdate = true;
                }
            }
        });

        // Setup animation mixer
        if (gltf.animations && gltf.animations.length > 0) {
            backwardPlayerMixer = new THREE.AnimationMixer(backwardPlayer);
            const action = backwardPlayerMixer.clipAction(gltf.animations[0]);
            action.play();
        }

        // Don't add to scene yet - will be swapped in during powerup
        console.log('Backward running model loaded');
    }, undefined, (error) => {
        console.error('Error loading backward running model:', error);
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

// Create a glowing powerup ETH coin (larger and more radiant)
function createPowerupCoin() {
    const coinGroup = new THREE.Group();

    // Larger, glowing Ethereum diamond with prominent GREEN glow
    const glowColor = 0x00FF00; // Bright green for powerup
    const material = new THREE.MeshPhongMaterial({
        color: glowColor,
        emissive: glowColor,
        emissiveIntensity: 1.0, // Maximum glow intensity
        flatShading: true
    });

    // Top pyramid (pointing up) - larger size
    const topGeometry = new THREE.ConeGeometry(0.6, 0.7, 4);
    const topPyramid = new THREE.Mesh(topGeometry, material);
    topPyramid.position.y = 0.35;
    topPyramid.rotation.y = Math.PI / 4;
    topPyramid.castShadow = false;
    topPyramid.receiveShadow = false;
    coinGroup.add(topPyramid);

    // Bottom pyramid (pointing down) - larger size
    const bottomGeometry = new THREE.ConeGeometry(0.6, 0.7, 4);
    const bottomPyramid = new THREE.Mesh(bottomGeometry, material);
    bottomPyramid.position.y = -0.35;
    bottomPyramid.rotation.y = Math.PI / 4;
    bottomPyramid.rotation.z = Math.PI;
    bottomPyramid.castShadow = false;
    bottomPyramid.receiveShadow = false;
    coinGroup.add(bottomPyramid);

    // Add a bright green glowing point light around the powerup
    const glowLight = new THREE.PointLight(glowColor, 3, 8);
    glowLight.position.set(0, 0, 0);
    coinGroup.add(glowLight);

    // Mark this as a powerup for identification
    coinGroup.userData.isPowerup = true;
    coinGroup.userData.powerupType = 'clear'; // Green = clear blocks powerup

    return coinGroup;
}

// Create a magnetic powerup ETH coin (yellow, attracts coins)
function createMagneticPowerupCoin() {
    const coinGroup = new THREE.Group();

    // Larger, glowing Ethereum diamond with YELLOW glow for magnetic powerup
    const glowColor = 0xFFFF00; // Bright yellow for magnetic powerup
    const material = new THREE.MeshPhongMaterial({
        color: glowColor,
        emissive: glowColor,
        emissiveIntensity: 1.0, // Maximum glow intensity
        flatShading: true
    });

    // Top pyramid (pointing up) - larger size
    const topGeometry = new THREE.ConeGeometry(0.6, 0.7, 4);
    const topPyramid = new THREE.Mesh(topGeometry, material);
    topPyramid.position.y = 0.35;
    topPyramid.rotation.y = Math.PI / 4;
    topPyramid.castShadow = false;
    topPyramid.receiveShadow = false;
    coinGroup.add(topPyramid);

    // Bottom pyramid (pointing down) - larger size
    const bottomGeometry = new THREE.ConeGeometry(0.6, 0.7, 4);
    const bottomPyramid = new THREE.Mesh(bottomGeometry, material);
    bottomPyramid.position.y = -0.35;
    bottomPyramid.rotation.y = Math.PI / 4;
    bottomPyramid.rotation.z = Math.PI;
    bottomPyramid.castShadow = false;
    bottomPyramid.receiveShadow = false;
    coinGroup.add(bottomPyramid);

    // Add a bright yellow glowing point light around the powerup
    const glowLight = new THREE.PointLight(glowColor, 3, 8);
    glowLight.position.set(0, 0, 0);
    coinGroup.add(glowLight);

    // Mark this as a magnetic powerup for identification
    coinGroup.userData.isPowerup = true;
    coinGroup.userData.powerupType = 'magnetic'; // Yellow = magnetic powerup

    return coinGroup;
}

// Create a ground segment
function createGroundSegment(zPos, skipObstacles = false) {
    const group = new THREE.Group();
    group.position.z = zPos; // Set the group's position, not the individual meshes

    // Main ground - Cyberpunk grid with large squares
    const groundGeometry = new THREE.BoxGeometry(GROUND_WIDTH, 0.5, GROUND_LENGTH);

    // Create grid texture for ground
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 512;
    groundCanvas.height = 512;
    const groundCtx = groundCanvas.getContext('2d');

    // Dark base
    groundCtx.fillStyle = '#0a0a0a';
    groundCtx.fillRect(0, 0, 512, 512);

    // Neon cyan grid lines - larger squares
    groundCtx.strokeStyle = '#00ffff';
    groundCtx.lineWidth = 3;
    const gridSize = 64; // Increased from 32 to 64 for larger squares

    for (let i = 0; i <= 512; i += gridSize) {
        groundCtx.beginPath();
        groundCtx.moveTo(i, 0);
        groundCtx.lineTo(i, 512);
        groundCtx.stroke();

        groundCtx.beginPath();
        groundCtx.moveTo(0, i);
        groundCtx.lineTo(512, i);
        groundCtx.stroke();
    }

    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(2, 4);

    const groundMaterial = new THREE.MeshPhongMaterial({
        map: groundTexture,
        emissive: 0x00ffff,
        emissiveIntensity: 0.2,
        color: 0x00ffff
    });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.position.set(0, -0.25, 0);
    groundMesh.receiveShadow = true;
    group.add(groundMesh);

    // Red obstacles removed - only blockchain blocks spawn now

    // Add coins (but not if skipObstacles is true)
    if (!skipObstacles) {
        // 2.5% chance to spawn a powerup instead of regular coins
        if (Math.random() < 0.025) {
            // 50/50 chance between green (clear blocks) and yellow (magnetic) powerup
            const powerup = Math.random() < 0.5 ? createPowerupCoin() : createMagneticPowerupCoin();
            const laneidx = Math.floor(Math.random() * 3);
            const powerupZ = -GROUND_LENGTH/2 + Math.random() * GROUND_LENGTH;
            powerup.position.set(lanes[laneidx], 1.5, powerupZ);
            group.add(powerup);
            powerups.push({
                mesh: powerup,
                segmentGroup: group
            });
        } else {
            // Regular coin spawning
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
    }

    scene.add(group);
    ground.push(group);
}

// Handle keyboard input
function onKeyDown(event) {
    if (gameOver) return;

    switch(event.code) {
        case 'ArrowLeft':
        case 'KeyA':
            if (currentLane > 0) {
                currentLane--;
                targetLane = currentLane;
            }
            break;
        case 'ArrowRight':
        case 'KeyD':
            if (currentLane < 2) {
                currentLane++;
                targetLane = currentLane;
            }
            break;
        case 'Space':
        case 'KeyW':
            if (!isJumping && player) {
                isJumping = true;
                jumpVelocity = JUMP_POWER;
            }
            event.preventDefault();
            break;
    }
}

// Setup mobile touch controls
function setupMobileControls() {
    const leftBtn = document.getElementById('leftBtn');
    const rightBtn = document.getElementById('rightBtn');
    const jumpBtn = document.getElementById('jumpBtn');

    if (leftBtn) {
        leftBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!gameOver && currentLane > 0) {
                currentLane--;
                targetLane = currentLane;
            }
        });
    }

    if (rightBtn) {
        rightBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!gameOver && currentLane < 2) {
                currentLane++;
                targetLane = currentLane;
            }
        });
    }

    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!gameOver && !isJumping && player) {
                isJumping = true;
                jumpVelocity = JUMP_POWER;
            }
        });
    }
}

// Handle window resize
function onWindowResize() {
    const isMobile = window.innerWidth <= 768;

    // Adjust FOV for mobile
    camera.fov = isMobile ? 90 : 75;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update game state
function update(deltaTime) {
    if (gameOver || !player) return;

    // Get the currently active player model (forward or backward)
    const activePlayer = powerupActive && scene.children.includes(backwardPlayer) ? backwardPlayer : player;

    // Update score display
    document.getElementById('score').textContent = `Score: ${score}`;

    // Increase speed over time
    gameSpeed += 0.0001;

    // Move active player towards target lane
    const targetX = lanes[currentLane];
    activePlayer.position.x += (targetX - activePlayer.position.x) * 0.15;

    // Handle jumping
    if (isJumping) {
        activePlayer.position.y += jumpVelocity;
        jumpVelocity -= GRAVITY;

        if (activePlayer.position.y <= PLAYER_Y_OFFSET) {
            activePlayer.position.y = PLAYER_Y_OFFSET;
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
            // Before recycling, detach any blockchain blocks from this segment
            const blocksOnThisSegment = blockchainBlocks.filter(block => block.segmentGroup === segment);
            blocksOnThisSegment.forEach(block => {
                // Get the world position before detaching
                const worldPos = new THREE.Vector3();
                block.mesh.getWorldPosition(worldPos);

                // Remove from segment
                segment.remove(block.mesh);

                // Add directly to scene with world position
                block.mesh.position.copy(worldPos);
                scene.add(block.mesh);

                // Update segment reference to null so we know it's detached
                block.segmentGroup = null;
            });

            segment.position.z = minZ - GROUND_LENGTH;

            // Increment segment counter for safe landing zones
            segmentCounter++;

            // Remove old obstacles and coins associated with this segment (but keep blockchain blocks)
            obstacles = obstacles.filter(obs => {
                if (obs.segmentGroup === segment && !obs.isBlockchainBlock) {
                    return false; // Remove regular obstacles
                }
                return true; // Keep blockchain blocks and other segments' obstacles
            });
            coins = coins.filter(coin => coin.segmentGroup !== segment);

            // Also clean up blockchain blocks that passed (behind player)
            blockchainBlocks = blockchainBlocks.filter(block => {
                const worldPos = new THREE.Vector3();
                block.mesh.getWorldPosition(worldPos);
                // Remove if it's far behind the player
                // Use 50 units to account for large blocks (up to 3 units tall) with extra margin
                if (worldPos.z > player.position.z + 50) {
                    block.segmentGroup.remove(block.mesh);
                    obstacles = obstacles.filter(obs => obs !== block);
                    return false;
                }
                return true;
            });

            // Clear old obstacles and coins from the segment, but keep blockchain blocks and ground/walls
            const objectsToRemove = [];
            segment.children.forEach(child => {
                // Check if this is a blockchain block
                const isBlockchainBlock = blockchainBlocks.some(block => block.mesh === child);

                // Check if this is ground (cyan grid)
                const isGround = child.material && child.material.color.getHex() === 0x00ffff;

                if (!isBlockchainBlock && !isGround) {
                    // Remove red obstacles (BoxGeometry) and coin groups (ConeGeometry groups)
                    if ((child.geometry && child.geometry.type === 'BoxGeometry') ||
                        (child.isGroup && child.children.length > 0 && child.children[0].geometry && child.children[0].geometry.type === 'ConeGeometry')) {
                        objectsToRemove.push(child);
                    }
                }
            });
            objectsToRemove.forEach(obj => segment.remove(obj));

            // Red obstacles removed - only blockchain blocks spawn now

            // Determine if this should be a safe landing zone
            // Every 4th segment at high speeds becomes a safe zone (no obstacles)
            // This is most important when game speed > 0.35
            const isSafeLandingZone = gameSpeed > 0.35 && segmentCounter % 4 === 0;

            // Add new coins or powerups (skip on safe landing zones at high speeds)
            if (isSafeLandingZone) {
                console.log('🛬 Safe landing zone created (no obstacles)');
                // Still spawn coins on safe zones, just no obstacles
                const coinCount = Math.floor(Math.random() * 2) + 1;
                for (let i = 0; i < coinCount; i++) {
                    const coin = createEthCoin();
                    const laneidx = Math.floor(Math.random() * 3);
                    const coinZ = -GROUND_LENGTH/2 + Math.random() * GROUND_LENGTH;
                    coin.position.set(lanes[laneidx], 1.5, coinZ);
                    segment.add(coin);
                    coins.push({
                        mesh: coin,
                        segmentGroup: segment
                    });
                }
            } else {
                // 2.5% chance to spawn a powerup instead of regular coins
                if (Math.random() < 0.025) {
                    // 50/50 chance between green (clear blocks) and yellow (magnetic) powerup
                    const powerup = Math.random() < 0.5 ? createPowerupCoin() : createMagneticPowerupCoin();
                    const laneidx = Math.floor(Math.random() * 3);
                    const powerupZ = -GROUND_LENGTH/2 + Math.random() * GROUND_LENGTH;
                    powerup.position.set(lanes[laneidx], 1.5, powerupZ);
                    segment.add(powerup);
                    powerups.push({
                        mesh: powerup,
                        segmentGroup: segment
                    });
                } else {
                    // Regular coin spawning
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

    // Animate powerups - rotate faster and bob more dramatically
    powerups.forEach(powerupObj => {
        powerupObj.mesh.rotation.y += 0.1; // Faster rotation
        // More dramatic bobbing motion
        const baseY = 1.5;
        powerupObj.mesh.position.y = baseY + Math.sin(Date.now() * 0.005 + powerupObj.mesh.position.x) * 0.2;
    });

    // Animate matrix rain symbols
    matrixRain.forEach(sprite => {
        sprite.position.y -= sprite.userData.fallSpeed;

        // Reset to top when it falls below ground
        if (sprite.position.y < -1) {
            sprite.position.y = sprite.userData.startY;
            sprite.position.x = (Math.random() - 0.5) * 12;
            sprite.position.z = (Math.random() - 0.5) * 40;
        }
    });

    // Animate falling blocks (from powerup)
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
        const fallingBlock = fallingBlocks[i];

        // Move block down
        fallingBlock.mesh.position.y -= fallingBlock.fallSpeed;

        // Add rotation for visual effect
        fallingBlock.mesh.rotation.x += fallingBlock.rotationSpeed;
        fallingBlock.mesh.rotation.z += fallingBlock.rotationSpeed * 0.5;

        // Remove block once it's well below the floor
        if (fallingBlock.mesh.position.y < -10) {
            scene.remove(fallingBlock.mesh);
            fallingBlocks.splice(i, 1);
        }
    }

    // Check collision with obstacles and track passed obstacles (using activePlayer from update() scope)
    obstacles.forEach(obsObj => {
        const obstacle = obsObj.mesh;
        const worldPos = new THREE.Vector3();
        obstacle.getWorldPosition(worldPos);

        const distance = activePlayer.position.distanceTo(worldPos);

        // Check for collision
        if (distance < 1.5 && Math.abs(activePlayer.position.y - worldPos.y) < 1.5) {
            endGame();
        }

        // Check if player passed the obstacle (obstacle is now behind player)
        if (!obsObj.passed && worldPos.z > activePlayer.position.z + 2) {
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
        const dx = activePlayer.position.x - worldPos.x;
        const dz = activePlayer.position.z - worldPos.z;
        const distance2D = Math.sqrt(dx * dx + dz * dz);

        // Collect coin if player is close enough (larger radius for easier collection)
        if (distance2D < 1.2) {
            ethCollected++;
            score = (ethCollected * 100) + (obstaclesPassed * 100);
            coinObj.segmentGroup.remove(coin);
            coins.splice(i, 1);

            // Play coin sound
            if (!isMuted) {
                coinSound.currentTime = 0; // Reset to start in case it's already playing
                coinSound.play().catch(e => console.log('Audio play failed:', e));
            }

            console.log('ETH collected! Total ETH:', ethCollected, 'Score:', score);
        }
    }

    // Check powerup collection
    for (let i = powerups.length - 1; i >= 0; i--) {
        const powerupObj = powerups[i];
        const powerup = powerupObj.mesh;
        const worldPos = new THREE.Vector3();
        powerup.getWorldPosition(worldPos);

        // Calculate distance in X and Z
        const dx = activePlayer.position.x - worldPos.x;
        const dz = activePlayer.position.z - worldPos.z;
        const distance2D = Math.sqrt(dx * dx + dz * dz);

        // Collect powerup if player is close enough
        if (distance2D < 1.5) {
            powerupObj.segmentGroup.remove(powerup);
            powerups.splice(i, 1);

            // Activate appropriate powerup based on type
            if (powerup.userData.powerupType === 'magnetic') {
                activateMagneticPowerup();
            } else {
                activatePowerup(); // Green powerup
            }

            // Play powerup sound
            if (!isMuted) {
                powerupSound.currentTime = 0;
                powerupSound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
    }

    // Magnetic powerup - attract nearby coins
    if (magneticPowerupActive && activePlayer) {
        const magnetRadius = 8; // Attraction range
        const magnetStrength = 0.15; // Pull strength

        coins.forEach(coinObj => {
            const coin = coinObj.mesh;
            const worldPos = new THREE.Vector3();
            coin.getWorldPosition(worldPos);

            const dx = activePlayer.position.x - worldPos.x;
            const dz = activePlayer.position.z - worldPos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < magnetRadius && distance > 0.5) {
                // Pull coin toward player
                coin.position.x += (dx / distance) * magnetStrength;
                coin.position.z += (dz / distance) * magnetStrength;
            }
        });
    }

    // Check if powerups have expired
    if (powerupActive && Date.now() >= powerupEndTime) {
        deactivatePowerup();
    }
    if (magneticPowerupActive && Date.now() >= magneticPowerupEndTime) {
        deactivateMagneticPowerup();
    }
}

// Activate powerup: clear blocks, swap models, delay spawning
function activatePowerup() {
    console.log('🚀 Activating powerup!');

    // If powerup is already active, just extend the duration
    const wasAlreadyActive = powerupActive;
    powerupActive = true;
    powerupEndTime = Date.now() + 5000; // 5 seconds duration (or extend it)
    blockSpawnDelay = Date.now() + 5000; // Delay block spawning for 5 seconds

    // Make all blockchain blocks fall through the floor
    blockchainBlocks.forEach(block => {
        // Detach from segment group so they don't move with ground
        if (block.segmentGroup) {
            const worldPos = new THREE.Vector3();
            block.mesh.getWorldPosition(worldPos);
            block.segmentGroup.remove(block.mesh);
            block.mesh.position.copy(worldPos);
            scene.add(block.mesh);
            block.segmentGroup = null;
        }

        // Add to falling blocks array with falling animation data
        fallingBlocks.push({
            mesh: block.mesh,
            fallSpeed: 0.05 + Math.random() * 0.05, // Random fall speed for variety
            rotationSpeed: (Math.random() - 0.5) * 0.1 // Random rotation for effect
        });
    });
    blockchainBlocks = [];
    console.log('✨ Blocks falling through floor!');

    // Only swap models if we weren't already in powerup mode
    if (!wasAlreadyActive && player && backwardPlayer && scene.children.includes(player)) {
        const currentLaneIndex = lanes.indexOf(player.position.x);
        const currentY = player.position.y;
        const currentZ = player.position.z;

        // Remove forward player
        scene.remove(player);

        // Add backward player at same position, rotated 180 degrees
        backwardPlayer.position.set(lanes[currentLaneIndex >= 0 ? currentLaneIndex : currentLane], currentY, currentZ);
        backwardPlayer.rotation.y = 0; // Face forward (180 degrees from original Math.PI)
        scene.add(backwardPlayer);

        // Swap references temporarily
        const tempMixer = playerMixer;
        playerMixer = backwardPlayerMixer;
        backwardPlayerMixer = tempMixer;

        console.log('🔄 Switched to backward running!');
    } else if (wasAlreadyActive) {
        console.log('⏱️ Extended powerup duration!');
    }
}

// Deactivate powerup: swap models back
function deactivatePowerup() {
    console.log('⏱️ Powerup ended');
    powerupActive = false;

    // Swap back to forward running model
    if (player && backwardPlayer && scene.children.includes(backwardPlayer)) {
        const currentLaneIndex = lanes.indexOf(backwardPlayer.position.x);
        const currentY = backwardPlayer.position.y;
        const currentZ = backwardPlayer.position.z;

        // Remove backward player
        scene.remove(backwardPlayer);

        // Add forward player back at same position, facing forward (180 degrees)
        player.position.set(lanes[currentLaneIndex >= 0 ? currentLaneIndex : currentLane], currentY, currentZ);
        player.rotation.y = Math.PI; // Face forward (original forward direction)
        scene.add(player);

        // Swap mixers back
        const tempMixer = playerMixer;
        playerMixer = backwardPlayerMixer;
        backwardPlayerMixer = tempMixer;

        console.log('🔙 Switched back to forward running!');
    }
}

// Activate magnetic powerup: attract coins
function activateMagneticPowerup() {
    console.log('🧲 Activating magnetic powerup!');
    magneticPowerupActive = true;
    magneticPowerupEndTime = Date.now() + 14000; // 14 seconds duration (twice as long)
}

// Deactivate magnetic powerup
function deactivateMagneticPowerup() {
    console.log('🧲 Magnetic powerup ended');
    magneticPowerupActive = false;
}

// Animation loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    update(deltaTime);

    // Always clean up blockchain blocks, even during game over
    // This prevents blocks from getting stuck on screen
    if (player && blockchainBlocks.length > 0) {
        const beforeCount = blockchainBlocks.length;

        blockchainBlocks = blockchainBlocks.filter(block => {
            const worldPos = new THREE.Vector3();
            block.mesh.getWorldPosition(worldPos);

            // Remove if it's behind the player by 5 units or more
            // Blocks get stuck at z=10-12 when detached from segments
            // With player at z=5, threshold of 5 gives us z>10
            const threshold = player.position.z + 5;

            if (worldPos.z > threshold) {
                // Try to remove from segment group if still attached
                if (block.segmentGroup) {
                    block.segmentGroup.remove(block.mesh);
                }
                // Also remove directly from scene as fallback
                scene.remove(block.mesh);
                // Remove from obstacles array
                obstacles = obstacles.filter(obs => obs !== block);
                return false;
            }
            return true;
        });

        if (blockchainBlocks.length !== beforeCount) {
            console.log(`🧹 Cleaned up ${beforeCount - blockchainBlocks.length} blocks. Remaining: ${blockchainBlocks.length}`);
        }
    }

    renderer.render(scene, camera);
}

// End game
function endGame() {
    gameOver = true;

    // Disconnect from blockchain stream to save credits
    disconnectBlockchainStream();

    // Pause background music
    backgroundMusic.pause();

    // Update score breakdown
    const ethPoints = ethCollected * 100;
    const obstaclePoints = obstaclesPassed * 100;

    document.getElementById('ethCount').textContent = ethCollected;
    document.getElementById('ethPoints').textContent = ethPoints;
    document.getElementById('obstaclesCount').textContent = obstaclesPassed;
    document.getElementById('obstaclesPoints').textContent = obstaclePoints;
    document.getElementById('finalScore').textContent = score;

    // Update game over UI based on wallet connection
    updateGameOverUI();

    document.getElementById('gameOver').style.display = 'block';
}

// Restart game
window.restartGame = function() {
    // Remove all obstacles and coins
    obstacles.forEach(obsObj => {
        if (obsObj.segmentGroup) {
            obsObj.segmentGroup.remove(obsObj.mesh);
        } else {
            // If detached from segment, remove from scene
            scene.remove(obsObj.mesh);
        }
    });
    coins.forEach(coinObj => {
        coinObj.segmentGroup.remove(coinObj.mesh);
    });

    // Remove all blockchain blocks (some may be detached)
    blockchainBlocks.forEach(block => {
        if (block.segmentGroup) {
            block.segmentGroup.remove(block.mesh);
        } else {
            scene.remove(block.mesh);
        }
    });

    obstacles = [];
    coins = [];
    blockchainBlocks = [];

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
    segmentCounter = 0; // Reset segment counter for safe zones

    // Resume background music
    if (!isMuted) {
        backgroundMusic.play().catch(e => console.log('Music play failed:', e));
    }

    // Reconnect to blockchain stream
    connectBlockchainStream();

    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('score').textContent = 'Score: 0';
}

// Add block to live feed
function addBlockToFeed(blockType, txCount, blockNumber) {
    const feedEntries = document.getElementById('blockFeedEntries');

    // Create new entry
    const entry = document.createElement('div');
    entry.className = `block-entry ${blockType}`;

    const chainName = blockType.toUpperCase();
    entry.innerHTML = `
        <div class="block-chain">${chainName} #${blockNumber}</div>
        <div class="block-txs">${txCount} transaction${txCount !== 1 ? 's' : ''}</div>
    `;

    // Add to top of feed
    feedEntries.insertBefore(entry, feedEntries.firstChild);

    // Keep only last 8 entries
    while (feedEntries.children.length > 8) {
        feedEntries.removeChild(feedEntries.lastChild);
    }
}

// Spawn a blockchain block obstacle when a new blockchain block is detected
function spawnBlockObstacle(blockType = 'base', txCount = 0, blockNumber = 0) {
    if (!player || gameOver) return;

    // Don't spawn blocks if powerup delay is active
    if (blockSpawnDelay > 0 && Date.now() < blockSpawnDelay) {
        console.log('⏸️ Block spawn delayed due to powerup');
        return;
    }

    // Dynamic spawn probability based on game speed
    // As speed increases, spawn fewer blocks to allow landing space
    // At speed 0.2 (start): 100% spawn rate
    // At speed 0.5+: 40% spawn rate
    const speedFactor = Math.max(0.4, 1 - (gameSpeed - 0.2) * 1.5);
    if (Math.random() > speedFactor) {
        console.log(`⏭️ Block spawn skipped (speed: ${gameSpeed.toFixed(2)}, spawn chance: ${(speedFactor * 100).toFixed(0)}%)`);
        return;
    }

    // Determine block size based on transaction count
    let blockSize;
    let blockHeight;
    if (txCount <= 10) {
        // Small block
        blockSize = 0.8;
        blockHeight = 1;
    } else if (txCount <= 200) {
        // Medium block
        blockSize = 1.5;
        blockHeight = 2;
    } else {
        // Large block
        blockSize = 2.5;
        blockHeight = 3;
    }

    console.log(`${blockType.toUpperCase()} block with ${txCount} transactions - size: ${blockSize}`);

    // Find the furthest ground segment (at the back of the track)
    let furthestSegment = ground[0];
    let minZ = ground[0].position.z;

    ground.forEach(segment => {
        if (segment.position.z < minZ) {
            minZ = segment.position.z;
            furthestSegment = segment;
        }
    });

    // Find available lane - check for overlapping blocks
    const availableLanes = [0, 1, 2];
    const blockZ = -GROUND_LENGTH/4 - Math.random() * (GROUND_LENGTH/4);
    const minDistance = 3; // Minimum distance between blocks

    // Check all blockchain blocks to avoid overlaps
    blockchainBlocks.forEach(existingBlock => {
        const worldPos = new THREE.Vector3();
        existingBlock.mesh.getWorldPosition(worldPos);

        // Check each lane to see if it's too close to existing blocks
        for (let i = availableLanes.length - 1; i >= 0; i--) {
            const laneX = lanes[availableLanes[i]];
            const distance = Math.sqrt(
                Math.pow(laneX - worldPos.x, 2) +
                Math.pow(furthestSegment.position.z + blockZ - worldPos.z, 2)
            );

            // Remove lane if too close to existing block
            if (distance < minDistance) {
                availableLanes.splice(i, 1);
            }
        }
    });

    // If no available lanes, don't spawn
    if (availableLanes.length === 0) {
        console.log(`${blockType.toUpperCase()} block spawn skipped - no available lanes`);
        return;
    }

    // Pick a random available lane
    const laneidx = availableLanes[Math.floor(Math.random() * availableLanes.length)];

    // Load appropriate texture based on block type
    const textureLoader = new THREE.TextureLoader();
    let texturePath;
    if (blockType === 'op') {
        texturePath = '/op.png';
    } else if (blockType === 'eth') {
        texturePath = '/eth.png';
    } else if (blockType === 'arb') {
        texturePath = '/arb.png';
    } else {
        texturePath = '/base.png';
    }
    const blockTexture = textureLoader.load(texturePath);
    blockTexture.colorSpace = THREE.SRGBColorSpace;

    // Create white block with blockchain logo texture using MeshBasicMaterial to preserve colors
    const blockGeometry = new THREE.BoxGeometry(blockSize, blockHeight, blockSize);
    const blockMaterial = new THREE.MeshBasicMaterial({
        map: blockTexture,
        color: 0xffffff // White base color
    });
    const blockObstacle = new THREE.Mesh(blockGeometry, blockMaterial);

    blockObstacle.position.set(lanes[laneidx], blockHeight / 2, blockZ);
    blockObstacle.castShadow = true;
    blockObstacle.receiveShadow = true;

    furthestSegment.add(blockObstacle);

    // Track as both an obstacle and a blockchain block
    const blockData = {
        mesh: blockObstacle,
        segmentGroup: furthestSegment,
        isBlockchainBlock: true,
        blockType: blockType
    };
    obstacles.push(blockData);
    blockchainBlocks.push(blockData);

    console.log(`${blockType.toUpperCase()} block spawned at lane`, laneidx, 'on furthest segment at z:', minZ);
}

// Connect to backend SSE stream for blockchain updates
function connectBlockchainStream() {
    // Don't connect if already connected
    if (eventSource) {
        console.log('🔗 Already connected to blockchain stream');
        return;
    }

    const sseUrl = `${API_URL}/blocks/stream`;
    console.log('🔗 Connecting to blockchain stream:', sseUrl);

    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
        console.log('✅ Connected to blockchain stream');
    };

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // Skip connection status messages
            if (data.status === 'connected') {
                console.log('📡 Stream connection confirmed');
                return;
            }

            // Skip if game is over (shouldn't happen, but safety check)
            if (gameOver) return;

            const { chain, blockNumber, txCount } = data;

            console.log(`New ${chain.toUpperCase()} block #${blockNumber} - ${txCount} txs`);

            // Add to feed
            addBlockToFeed(chain, txCount, blockNumber);

            // Spawn blockchain block obstacle
            spawnBlockObstacle(chain, txCount, blockNumber);
        } catch (error) {
            console.error('Error processing blockchain update:', error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('❌ Blockchain stream error:', error);
        disconnectBlockchainStream();

        // Only reconnect if game is still active
        if (!gameOver) {
            console.log('🔄 Reconnecting in 5 seconds...');
            reconnectTimeout = setTimeout(connectBlockchainStream, 5000);
        }
    };
}

// Disconnect from blockchain stream
function disconnectBlockchainStream() {
    if (eventSource) {
        console.log('🔌 Disconnecting from blockchain stream');
        eventSource.close();
        eventSource = null;
    }

    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
}

// Wallet and Leaderboard functionality
// Wallet state comes from React/RainbowKit
let connectedWallet = null;
let provider = null;

// Listen for wallet changes from React
window.addEventListener('walletChange', async (event) => {
    const { address, isConnected } = event.detail;

    if (isConnected && address) {
        connectedWallet = address;
        // Get provider from window.ethereum for signing
        if (window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
        }
        console.log('Wallet connected:', connectedWallet);
    } else {
        connectedWallet = null;
        provider = null;
        console.log('Wallet disconnected');
    }

    // Update game over UI if needed
    if (gameOver) {
        updateGameOverUI();
    }
});

// Submit score to backend
async function submitScore() {
    if (!connectedWallet) {
        alert('Please connect your wallet first!');
        return;
    }

    const submitBtn = document.getElementById('submitScoreBtn');
    const statusDiv = document.getElementById('submissionStatus');

    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        statusDiv.textContent = 'Please sign the message in your wallet...';
        statusDiv.style.color = '#ffff00';

        // Create message to sign
        const message = `I scored ${score} points in Vitalik Run!\n\nScore: ${score}\nETH Collected: ${ethCollected}\nBlocks Passed: ${obstaclesPassed}`;

        // Sign message
        const signer = await provider.getSigner();
        const signature = await signer.signMessage(message);

        statusDiv.textContent = 'Submitting score to leaderboard...';

        // Submit to backend
        const response = await fetch(`${API_URL}/submit-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: connectedWallet,
                score,
                ethCollected,
                blocksPassed: obstaclesPassed,
                signature,
                message
            })
        });

        const result = await response.json();

        if (response.ok) {
            statusDiv.textContent = `✅ Score submitted! Your rank: #${result.rank}`;
            statusDiv.style.color = '#00ff00';
            submitBtn.style.display = 'none';
        } else {
            statusDiv.textContent = `❌ ${result.error}`;
            statusDiv.style.color = '#ff0000';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Score';
        }
    } catch (error) {
        console.error('Error submitting score:', error);
        statusDiv.textContent = '❌ Failed to submit score. Please try again.';
        statusDiv.style.color = '#ff0000';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Score';
    }
}

// Fetch and display leaderboard
async function loadLeaderboard() {
    const modal = document.getElementById('leaderboardModal');
    const entriesDiv = document.getElementById('leaderboardEntries');

    modal.style.display = 'block';
    entriesDiv.innerHTML = '<div style="text-align: center; color: #00ffff; padding: 40px;">Loading...</div>';

    try {
        // Fetch top 10
        const response = await fetch(`${API_URL}/leaderboard?limit=10&offset=0`);
        const data = await response.json();

        if (data.leaderboard && data.leaderboard.length > 0) {
            const isMobile = window.innerWidth <= 768;

            let html = `
                <div style="display: grid; grid-template-columns: ${isMobile ? '50px 1fr 80px' : '60px 1fr 120px 150px'}; gap: ${isMobile ? '8px' : '10px'}; padding: 10px; background: rgba(0, 255, 255, 0.1); border-radius: 8px; margin-bottom: 10px; font-weight: bold; font-size: ${isMobile ? '13px' : '16px'};">
                    <div>Rank</div>
                    <div>Wallet</div>
                    <div>Score</div>
                    ${isMobile ? '' : '<div>Details</div>'}
                </div>
            `;

            // Display top 10
            data.leaderboard.forEach((entry, index) => {
                const rankEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                const address = entry.ens_name || `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}`;
                const isCurrentUser = entry.wallet_address.toLowerCase() === connectedWallet?.toLowerCase();

                if (isMobile) {
                    html += `
                        <div style="display: grid; grid-template-columns: 50px 1fr 80px; gap: 8px; padding: 12px 8px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${isCurrentUser ? '#00ff00' : '#627EEA'}; align-items: center; font-size: 13px;">
                            <div style="font-size: 18px;">${rankEmoji} #${entry.rank}</div>
                            <div style="color: #00ffff; font-size: 11px; overflow: hidden; text-overflow: ellipsis;">${address}${isCurrentUser ? ' (You)' : ''}</div>
                            <div style="font-weight: bold; color: #ffff00; font-size: 15px;">${entry.score}</div>
                        </div>
                    `;
                } else {
                    html += `
                        <div style="display: grid; grid-template-columns: 60px 1fr 120px 150px; gap: 10px; padding: 15px; background: rgba(255, 255, 255, 0.05); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${isCurrentUser ? '#00ff00' : '#627EEA'}; align-items: center;">
                            <div style="font-size: 20px;">${rankEmoji} #${entry.rank}</div>
                            <div style="color: #00ffff;">${address}${isCurrentUser ? ' (You)' : ''}</div>
                            <div style="font-weight: bold; color: #ffff00;">${entry.score}</div>
                            <div style="font-size: 12px; color: #aaa;">ETH: ${entry.eth_collected} | Blocks: ${entry.blocks_passed}</div>
                        </div>
                    `;
                }
            });

            // If user is connected and not in top 10, fetch and show their rank
            if (connectedWallet) {
                const userInTop10 = data.leaderboard.some(entry =>
                    entry.wallet_address.toLowerCase() === connectedWallet.toLowerCase()
                );

                if (!userInTop10) {
                    try {
                        const userResponse = await fetch(`${API_URL}/user-score/${connectedWallet}`);
                        if (userResponse.ok) {
                            const userData = await userResponse.json();
                            const address = userData.ens_name || `${userData.wallet_address.slice(0, 6)}...${userData.wallet_address.slice(-4)}`;

                            html += `
                                <div style="margin: 20px 0 10px; padding: 10px; text-align: center; color: #00ffff; font-style: italic; font-size: ${isMobile ? '12px' : '14px'};">
                                    ... your rank ...
                                </div>
                            `;

                            if (isMobile) {
                                html += `
                                    <div style="display: grid; grid-template-columns: 50px 1fr 80px; gap: 8px; padding: 12px 8px; background: rgba(0, 255, 0, 0.1); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #00ff00; align-items: center; font-size: 13px;">
                                        <div style="font-size: 18px;">#${userData.rank}</div>
                                        <div style="color: #00ffff; font-size: 11px; overflow: hidden; text-overflow: ellipsis;">${address} (You)</div>
                                        <div style="font-weight: bold; color: #ffff00; font-size: 15px;">${userData.score}</div>
                                    </div>
                                `;
                            } else {
                                html += `
                                    <div style="display: grid; grid-template-columns: 60px 1fr 120px 150px; gap: 10px; padding: 15px; background: rgba(0, 255, 0, 0.1); border-radius: 8px; margin-bottom: 8px; border-left: 3px solid #00ff00; align-items: center;">
                                        <div style="font-size: 20px;">#${userData.rank}</div>
                                        <div style="color: #00ffff;">${address} (You)</div>
                                        <div style="font-weight: bold; color: #ffff00;">${userData.score}</div>
                                        <div style="font-size: 12px; color: #aaa;">ETH: ${userData.eth_collected} | Blocks: ${userData.blocks_passed}</div>
                                    </div>
                                `;
                            }
                        }
                    } catch (userError) {
                        console.log('User not on leaderboard yet');
                    }
                }
            }

            entriesDiv.innerHTML = html;
        } else {
            entriesDiv.innerHTML = '<div style="text-align: center; color: #aaa; padding: 40px;">No scores yet. Be the first!</div>';
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
        entriesDiv.innerHTML = '<div style="text-align: center; color: #ff0000; padding: 40px;">Failed to load leaderboard.</div>';
    }
}

// Close leaderboard
function closeLeaderboard() {
    document.getElementById('leaderboardModal').style.display = 'none';
}

// Mute/Unmute toggle
function toggleMute() {
    isMuted = !isMuted;
    const muteBtn = document.getElementById('muteBtn');
    muteBtn.textContent = isMuted ? '🔇' : '🔊';

    // Control background music
    if (isMuted) {
        backgroundMusic.pause();
    } else if (!gameOver) {
        backgroundMusic.play().catch(e => console.log('Music play failed:', e));
    }
}

// Event listeners (wallet button is now handled by RainbowKit React component)
document.getElementById('muteBtn').addEventListener('click', toggleMute);
document.getElementById('submitScoreBtn').addEventListener('click', submitScore);
document.getElementById('connectWalletGameOverBtn').addEventListener('click', () => {
    // Open RainbowKit modal via exposed function
    if (window.openWalletModal) {
        window.openWalletModal();
    }
});
document.getElementById('leaderboardBtn').addEventListener('click', loadLeaderboard);
document.getElementById('closeLeaderboard').addEventListener('click', closeLeaderboard);

// Show submit button when game ends if wallet is connected
function updateGameOverUI() {
    const submitBtn = document.getElementById('submitScoreBtn');
    const connectWalletBtn = document.getElementById('connectWalletGameOverBtn');
    const statusDiv = document.getElementById('submissionStatus');

    if (connectedWallet) {
        submitBtn.style.display = 'inline-block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Score';
        connectWalletBtn.style.display = 'none';
        statusDiv.textContent = '';
    } else {
        submitBtn.style.display = 'none';
        connectWalletBtn.style.display = 'inline-block';
        statusDiv.textContent = '';
    }
}

// Start the game
init();

// Start background music (with user interaction fallback)
backgroundMusic.play().catch(e => {
    // Browser requires user interaction first - start on first click/keypress
    console.log('Music autoplay blocked, waiting for user interaction');
    const startMusic = () => {
        if (!isMuted) {
            backgroundMusic.play().catch(err => console.log('Music play failed:', err));
        }
        document.removeEventListener('click', startMusic);
        document.removeEventListener('keydown', startMusic);
    };
    document.addEventListener('click', startMusic);
    document.addEventListener('keydown', startMusic);
});

// Connect to blockchain stream on page load
connectBlockchainStream();

// Handle page visibility changes to disconnect when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('⏸️ Page hidden - disconnecting blockchain stream');
        disconnectBlockchainStream();
    } else if (!gameOver) {
        console.log('▶️ Page visible - reconnecting blockchain stream');
        connectBlockchainStream();
    }
});

// Disconnect stream when page is about to be closed
window.addEventListener('beforeunload', () => {
    disconnectBlockchainStream();
});
