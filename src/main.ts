import "./styles.css";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

type LimbRig = {
  leftLegs: THREE.Bone[];
  rightLegs: THREE.Bone[];
  leftArms: THREE.Bone[];
  rightArms: THREE.Bone[];
  tail: THREE.Bone[];
  spine: THREE.Bone[];
  head?: THREE.Bone;
};

type NpcKind = "crocodile" | "stalker" | "gull";
type PunchType = "jab" | "cross";
type PlayerCharacter = "rat" | "shrek";

type EnemyNpc = {
  id: string;
  kind: NpcKind;
  root: THREE.Group;
  body: THREE.Object3D;
  healthBar: THREE.Group;
  healthFill: THREE.Mesh;
  mixer?: THREE.AnimationMixer;
  heading: number;
  targetHeading: number;
  speed: number;
  turnTimer: number;
  walkPhase: number;
  hp: number;
  maxHp: number;
  hitRadius: number;
  attackCooldown: number;
  targetSearchTimer: number;
  cachedTarget?: EnemyNpc;
  targetPosition?: THREE.Vector3;
};

type NpcSpawnTimer = {
  time: number;
  kind: NpcKind;
};

type DancingCharacter = {
  root: THREE.Group;
  body: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  angle: number;
  radius: number;
  orbitSpeed: number;
  bobPhase: number;
};

type WallCollider = {
  box: THREE.Box3;
};

type NetworkPlayerState = {
  position: [number, number, number];
  yaw: number;
  rotationY: number;
  speed: number;
  weaponEquipped: boolean;
  kills: number;
  nickname: string;
  character: PlayerCharacter;
};

type RemotePlayer = {
  root: THREE.Group;
  avatar: THREE.Object3D;
  weapon?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  walkAction?: THREE.AnimationAction;
  nameTag: THREE.Sprite;
  targetPosition: THREE.Vector3;
  targetYaw: number;
  state: NetworkPlayerState;
  usingPlaceholder: boolean;
};

type MultiplayerMessage =
  | {
      type: "welcome";
      id: string;
      hostId: string | null;
      players: {
        id: string;
        state: NetworkPlayerState;
      }[];
    }
  | {
      type: "join";
      player: {
        id: string;
        state: NetworkPlayerState;
      };
    }
  | {
      type: "state";
      id: string;
      state: NetworkPlayerState;
    }
  | {
      type: "leave";
      id: string;
    }
  | {
      type: "host_update";
      hostId: string | null;
    }
  | {
      type: "sync_npcs";
      npcs: { id: string; kind: string; position: number[]; heading: number; hp: number }[];
    }
  | {
      type: "hit_npc";
      playerId: string;
      npcId: string;
      damage: number;
    };

declare global {
  interface Window {
    __TADEO_DEBUG__?: {
      playerPosition: [number, number, number];
      speed: number;
      sprinting: boolean;
      hasModel: boolean;
      hasRig: boolean;
      playerYaw: number;
      npcCount: number;
      maxNpcCount: number;
      spawnInterval: number;
      npcSpeedMultiplier: number;
      kills: number;
      coins: number;
      nickname: string;
      character: PlayerCharacter;
      modelBounds?: {
        minY: number;
        height: number;
      };
      weaponReady: boolean;
      weaponEquipped: boolean;
      punchReady: boolean;
      punchType: PunchType | null;
      arenaReady: boolean;
      wallColliderCount: number;
      arenaBounds: {
        halfX: number;
        halfZ: number;
      };
      npcHp: number[];
      npcKinds: NpcKind[];
      npcPositions: [number, number, number][];
      multiplayerConnected: boolean;
      multiplayerPlayers: number;
      multiplayerPlaceholders: number;
    };
    __TADEO_CAMERA__?: {
      yaw: number;
      pitch: number;
      distance: number;
      position: [number, number, number];
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const status = document.querySelector<HTMLDivElement>("#status");
const moveStick = document.querySelector<HTMLDivElement>("#move-stick");
const moveStickKnob = document.querySelector<HTMLDivElement>("#move-stick-knob");
const mobileAttackButton = document.querySelector<HTMLButtonElement>("#mobile-attack");
const mobileJumpButton = document.querySelector<HTMLButtonElement>("#mobile-jump");
const mobileWeaponButton = document.querySelector<HTMLButtonElement>("#mobile-weapon");
const mobileShopButton = document.querySelector<HTMLButtonElement>("#mobile-shop");
const nameGate = document.querySelector<HTMLFormElement>("#name-gate");
const nicknameInput = document.querySelector<HTMLInputElement>("#nickname-input");
const shopPanel = document.querySelector<HTMLDivElement>("#shop-panel");
const shopCopy = document.querySelector<HTMLDivElement>("#shop-copy");
const upgradeButton = document.querySelector<HTMLButtonElement>("#upgrade-button");

if (!canvas || !status) {
  throw new Error("Missing game canvas or HUD.");
}

const statusEl = status;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9db4b0);
scene.fog = new THREE.Fog(0x9db4b0, 32, 145);

const camera = new THREE.PerspectiveCamera(
  48,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);

camera.position.set(0, 3.7, 8.2);

const hemi = new THREE.HemisphereLight(0xf7eee1, 0x3d5147, 1.8);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff4dd, 3.2);
sun.position.set(4.5, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 32;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(180, 180),
  new THREE.MeshStandardMaterial({
    color: 0x3f8f35,
    roughness: 1,
    metalness: 0,
  }),
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const player = new THREE.Group();
scene.add(player);

const enemyNpcs: EnemyNpc[] = [];
const remotePlayers = new Map<string, RemotePlayer>();
const wallColliders: WallCollider[] = [];

const weaponMount = new THREE.Group();
weaponMount.visible = false;
player.add(weaponMount);

const keys = new Set<string>();
const clock = new THREE.Clock();

const velocity = new THREE.Vector3();
const move = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const aimTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const cameraTarget = new THREE.Vector3(0, 1.25, 0);
const yAxis = new THREE.Vector3(0, 1, 0);
const MODEL_FORWARD_OFFSET = Math.PI;

const baseBoneRotations = new Map<THREE.Bone, THREE.Euler>();

const raycaster = new THREE.Raycaster();
const shootOrigin = new THREE.Vector3();
const shootDirection = new THREE.Vector3();

const npcSpawnTimers: NpcSpawnTimer[] = [];

const tracerMaterial = new THREE.LineBasicMaterial({
  color: 0xffdf75,
  transparent: true,
  opacity: 0.9,
});

const gunshotAudio = new Audio("/assets/audio/gunshot.mp3");
gunshotAudio.preload = "auto";

let audioContext: AudioContext | undefined;
let gunshotBuffer: AudioBuffer | undefined;
let gunshotArrayBuffer: ArrayBuffer | undefined;
let audioUnlockPromise: Promise<void> | undefined;
let gunshotBufferPromise: Promise<void> | undefined;

let crocodileTemplate: THREE.Object3D | undefined;
let crocodileAnimationClips: THREE.AnimationClip[] = [];

let stalkerTemplate: THREE.Object3D | undefined;
let stalkerAnimationClips: THREE.AnimationClip[] = [];

let gullTemplate: THREE.Object3D | undefined;
let gullAnimationClips: THREE.AnimationClip[] = [];

let arenaModel: THREE.Object3D | undefined;
let model: THREE.Object3D | undefined;
let playerAnimationClips: THREE.AnimationClip[] = [];
const characterTemplates = new Map<PlayerCharacter, THREE.Object3D>();
const characterAnimationClips = new Map<PlayerCharacter, THREE.AnimationClip[]>();
let mixer: THREE.AnimationMixer | undefined;
let activeClip: THREE.AnimationAction | undefined;
let rig: LimbRig | undefined;
let backflipCharacter: THREE.Object3D | undefined;
let backflipMixer: THREE.AnimationMixer | undefined;

const dancingCharacters: DancingCharacter[] = [];

let weapon: THREE.Object3D | undefined;
let rightHandBone: THREE.Bone | undefined;

let isHost = false;
let hostId: string | undefined | null;
let weaponEquipped = true;
let playerCharacter: PlayerCharacter = "rat";
let unlockedShrek = false;
let nickname = `Player${Math.floor(Math.random() * 900 + 100)}`;

let walkTime = 0;

let cameraYaw = 0;
let cameraPitch = 0.42;
let cameraDistance = 2.25;


let weaponRecoil = 0;

let kills = 0;
let coins = 0;
let fireCooldown = 0;

let punchCooldown = 0;
let punchTimer = 0;
let activePunchType: PunchType | null = null;
let nextPunchType: PunchType = "jab";

const punchDuration = 0.34;
const punchHitMoment = 0.14;
const punchRange = 2.25;
const punchDamage = 28;
const punchCooldownTime = 0.38;
let punchDamageDone = false;

let pointerLocked = false;
let mouseHeld = false;
let mobileAttackHeld = false;
let touchLookPointerId: number | undefined;
let touchLookLastX = 0;
let touchLookLastY = 0;
let moveStickPointerId: number | undefined;
let mobileMoveRight = 0;
let mobileMoveForward = 0;

const mouseSensitivity = 0.0032;
const touchLookSensitivity = 0.006;
const moveStickRadius = 48;
const minCameraPitch = -0.5;
const maxCameraPitch = 1.25;

let verticalVelocity = 0;
let grounded = true;

const groundY = 0;
const gravity = 20;
const jumpStrength = 7;
player.position.y = groundY;
const spongeBobDanceCenter = new THREE.Vector3(3.4, groundY, -9.5);
const PLAYABLE_HALF_SIZE = 42;

const arenaBounds = {
  halfX: PLAYABLE_HALF_SIZE,
  halfZ: PLAYABLE_HALF_SIZE,
};

const npcSettings = {
  maxNpcCount: 10,
  spawnInterval: 1.2,
  npcSpeedMultiplier: 1,
  animationDistance: 14,
  targetSearchInterval: 0.45,
};

let autoSpawnTimer = npcSettings.spawnInterval;
let settingsPanel: HTMLDivElement | undefined;
let shopOpen = false;
let multiplayerSocket: WebSocket | undefined;
let multiplayerId: string | undefined;
let multiplayerConnected = false;
let multiplayerReconnectTimer: number | undefined;
let multiplayerSendTimer = 0;

createNpcSettingsPanel();
setupMobileControls();
setupNameGate();
setupUpgradeButton();

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  if (event.code === "Escape") {
    event.preventDefault();

    if (!event.repeat) {
      if (shopOpen) {
        setShopOpen(false);
        return;
      }

      toggleSettingsPanel();
      mouseHeld = false;

      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    }

    return;
  }

  keys.add(event.code);

  if (event.code === "Digit1") {
    event.preventDefault();

    if (!event.repeat) {
      toggleWeapon();
    }
  }

  if (event.code === "KeyE") {
    event.preventDefault();

    if (!event.repeat) {
      toggleShop();
    }
  }


  if (event.code === "Space") {
    event.preventDefault();

    if (grounded) {
      verticalVelocity = jumpStrength;
      grounded = false;
    }
  }

  if (event.code === "ControlLeft" || event.code === "ControlRight") {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") {
    if (touchLookPointerId !== event.pointerId || isSettingsPanelOpen()) {
      return;
    }

    const deltaX = event.clientX - touchLookLastX;
    const deltaY = event.clientY - touchLookLastY;
    touchLookLastX = event.clientX;
    touchLookLastY = event.clientY;

    cameraYaw -= deltaX * touchLookSensitivity;
    cameraPitch = THREE.MathUtils.clamp(
      cameraPitch + deltaY * touchLookSensitivity,
      minCameraPitch,
      maxCameraPitch,
    );
    return;
  }

  if (!pointerLocked) {
    return;
  }

  cameraYaw -= event.movementX * mouseSensitivity;

  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + event.movementY * mouseSensitivity,
    minCameraPitch,
    maxCameraPitch,
  );
});

canvas.addEventListener("pointerdown", (event) => {
  void unlockAudioContext();

  if (isSettingsPanelOpen() || shopOpen) {
    return;
  }

  if (event.pointerType === "touch") {
    touchLookPointerId = event.pointerId;
    touchLookLastX = event.clientX;
    touchLookLastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (!pointerLocked) {
    canvas.requestPointerLock();
    return;
  }

  mouseHeld = true;

  if (weaponEquipped) {
    shoot();
  } else {
    punch();
  }
});

document.addEventListener(
  "pointerdown",
  () => {
    void unlockAudioContext();
  },
  { passive: true },
);

document.addEventListener(
  "touchstart",
  () => {
    void unlockAudioContext();
  },
  { passive: true },
);

window.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch") {
    mouseHeld = false;
    mobileAttackHeld = false;
  }
});

window.addEventListener("blur", () => {
  mouseHeld = false;
  mobileAttackHeld = false;
  resetMobileMove();
});

canvas.addEventListener("pointerup", (event) => {
  if (touchLookPointerId === event.pointerId) {
    touchLookPointerId = undefined;
  }
});

canvas.addEventListener("pointercancel", (event) => {
  if (touchLookPointerId === event.pointerId) {
    touchLookPointerId = undefined;
  }
});

document.addEventListener("pointerlockchange", () => {
  const wasPointerLocked = pointerLocked;
  pointerLocked = document.pointerLockElement === canvas;

  if (!pointerLocked) {
    mouseHeld = false;

    if (wasPointerLocked && document.hasFocus() && !isSettingsPanelOpen() && !shopOpen) {
      setSettingsPanelOpen(true);
    }
  }
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const cameraProfile = getCameraProfile(playerCharacter);
    cameraDistance = THREE.MathUtils.clamp(
      cameraDistance + event.deltaY * 0.004,
      cameraProfile.minDistance,
      cameraProfile.maxDistance,
    );
  },
  { passive: false },
);

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

void loadArena();
void loadPlayerCharacter(playerCharacter);
void preloadCharacter("shrek");
void loadCrocodileNpcs();
void loadStalkerNpcs();
void loadGullNpcs();
void loadBackflipCharacter();
void loadDancingCharacters();
void loadDancingShrek();
void loadWeapon();
void preloadGunshotAudio();

animate();

function setupNameGate() {
  if (!nameGate || !nicknameInput) {
    connectMultiplayer();
    return;
  }

  nicknameInput.value = nickname;
  window.setTimeout(() => nicknameInput.focus(), 100);

  nameGate.addEventListener("submit", (event) => {
    event.preventDefault();
    nickname = sanitizeNickname(nicknameInput.value);
    nicknameInput.value = nickname;
    nameGate.classList.add("is-hidden");
    connectMultiplayer();
  });
}

function setupUpgradeButton() {
  shopPanel?.addEventListener("pointerdown", (event) => event.stopPropagation());
  shopPanel?.addEventListener("pointerup", (event) => event.stopPropagation());
  shopPanel?.addEventListener("click", (event) => event.stopPropagation());

  upgradeButton?.addEventListener("click", () => {
    if (unlockedShrek) {
      playerCharacter = playerCharacter === "shrek" ? "rat" : "shrek";
      void loadPlayerCharacter(playerCharacter);
      updateUpgradeButton();
      return;
    }

    if (coins < 5) {
      return;
    }

    coins -= 5;
    unlockedShrek = true;
    playerCharacter = "shrek";
    void loadPlayerCharacter(playerCharacter);
    updateUpgradeButton();
  });

  updateUpgradeButton();
}

function toggleShop() {
  setShopOpen(!shopOpen);
}

function setShopOpen(open: boolean) {
  shopOpen = open;
  shopPanel?.classList.toggle("is-open", open);

  if (open && document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function sanitizeNickname(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 18);
  return cleaned || nickname;
}

function updateUpgradeButton() {
  if (!upgradeButton) {
    return;
  }

  if (unlockedShrek) {
    upgradeButton.disabled = false;
    if (playerCharacter === "shrek") {
      upgradeButton.textContent = "Equip Black Rat";
      if (shopCopy) {
        shopCopy.textContent = "You're playing as Shrek Wazowski.";
      }
    } else {
      upgradeButton.textContent = "Equip Shrek Wazowski";
      if (shopCopy) {
        shopCopy.textContent = "You're playing as Black Rat.";
      }
    }
    return;
  }

  upgradeButton.textContent = `Upgrade ${coins}/5`;
  upgradeButton.disabled = coins < 5;

  if (shopCopy) {
    shopCopy.textContent =
      coins >= 5
        ? "Upgrade to Shrek Wazowski."
        : `Need ${5 - coins} more coin${5 - coins === 1 ? "" : "s"}.`;
  }
}

function setupMobileControls() {
  moveStick?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();

    moveStickPointerId = event.pointerId;
    moveStick.setPointerCapture(event.pointerId);
    updateMoveStick(event);
  });

  moveStick?.addEventListener("pointermove", (event) => {
    if (moveStickPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateMoveStick(event);
  });

  const releaseMoveStick = (event: PointerEvent) => {
    if (moveStickPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    resetMobileMove();
  };

  moveStick?.addEventListener("pointerup", releaseMoveStick);
  moveStick?.addEventListener("pointercancel", releaseMoveStick);

  mobileAttackButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void unlockAudioContext();
    mobileAttackButton.setPointerCapture(event.pointerId);
    mobileAttackHeld = true;
    mouseHeld = true;

    if (weaponEquipped) {
      shoot();
    } else {
      punch();
    }
  });

  const releaseAttack = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    mobileAttackHeld = false;
    mouseHeld = false;
  };

  mobileAttackButton?.addEventListener("pointerup", releaseAttack);
  mobileAttackButton?.addEventListener("pointercancel", releaseAttack);

  mobileJumpButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (grounded) {
      verticalVelocity = jumpStrength;
      grounded = false;
    }
  });

  mobileWeaponButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleWeapon();
  });

  mobileShopButton?.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleShop();
  });
}

function updateMoveStick(event: PointerEvent) {
  if (!moveStick || !moveStickKnob) {
    return;
  }

  const rect = moveStick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const rawX = event.clientX - centerX;
  const rawY = event.clientY - centerY;
  const distance = Math.min(moveStickRadius, Math.hypot(rawX, rawY));
  const angle = Math.atan2(rawY, rawX);
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;

  mobileMoveRight = x / moveStickRadius;
  mobileMoveForward = -y / moveStickRadius;
  moveStickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function resetMobileMove() {
  moveStickPointerId = undefined;
  mobileMoveRight = 0;
  mobileMoveForward = 0;

  if (moveStickKnob) {
    moveStickKnob.style.transform = "translate(-50%, -50%)";
  }
}

function createNpcSettingsPanel() {
  settingsPanel = document.createElement("div");
  settingsPanel.style.position = "fixed";
  settingsPanel.style.right = "14px";
  settingsPanel.style.top = "14px";
  settingsPanel.style.zIndex = "20";
  settingsPanel.style.width = "260px";
  settingsPanel.style.padding = "12px";
  settingsPanel.style.borderRadius = "14px";
  settingsPanel.style.background = "rgba(15, 20, 18, 0.78)";
  settingsPanel.style.color = "white";
  settingsPanel.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  settingsPanel.style.fontSize = "13px";
  settingsPanel.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";
  settingsPanel.style.backdropFilter = "blur(8px)";
  settingsPanel.style.userSelect = "none";
  settingsPanel.style.display = "none";

  settingsPanel.innerHTML = `
    <div style="font-weight:700;font-size:15px;margin-bottom:8px;">NPC Settings</div>
    <div style="opacity:.75;margin-bottom:10px;line-height:1.35;">Меняй прямо во время игры. Нажми Esc, чтобы открыть/закрыть.</div>
  `;

  settingsPanel.appendChild(
    createSettingsRow({
      label: "Макс. NPC",
      min: 1,
      max: 200,
      step: 1,
      value: npcSettings.maxNpcCount,
      format: (value) => String(Math.round(value)),
      onChange: (value) => {
        npcSettings.maxNpcCount = Math.round(value);
        trimNpcCountToLimit();
      },
    }),
  );

  settingsPanel.appendChild(
    createSettingsRow({
      label: "Спавн, сек",
      min: 0.3,
      max: 10,
      step: 0.1,
      value: npcSettings.spawnInterval,
      format: (value) => `${value.toFixed(1)}s`,
      onChange: (value) => {
        npcSettings.spawnInterval = Number(value.toFixed(1));
        autoSpawnTimer = Math.min(autoSpawnTimer, npcSettings.spawnInterval);
      },
    }),
  );

  settingsPanel.appendChild(
    createSettingsRow({
      label: "Скорость NPC",
      min: 0.2,
      max: 4,
      step: 0.1,
      value: npcSettings.npcSpeedMultiplier,
      format: (value) => `${value.toFixed(1)}x`,
      onChange: (value) => {
        npcSettings.npcSpeedMultiplier = Number(value.toFixed(1));
      },
    }),
  );

  settingsPanel.appendChild(
    createSettingsRow({
      label: "Дистанция анимаций",
      min: 4,
      max: 100,
      step: 1,
      value: npcSettings.animationDistance,
      format: (value) => `${Math.round(value)}m`,
      onChange: (value) => {
        npcSettings.animationDistance = Math.round(value);
      },
    }),
  );

  settingsPanel.appendChild(
    createSettingsRow({
      label: "Поиск цели",
      min: 0.15,
      max: 1.5,
      step: 0.05,
      value: npcSettings.targetSearchInterval,
      format: (value) => `${value.toFixed(2)}s`,
      onChange: (value) => {
        npcSettings.targetSearchInterval = Number(value.toFixed(2));
      },
    }),
  );

  settingsPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
  settingsPanel.addEventListener("pointerup", (event) => event.stopPropagation());
  settingsPanel.addEventListener("click", (event) => event.stopPropagation());
  settingsPanel.addEventListener("wheel", (event) => event.stopPropagation(), {
    passive: true,
  });

  document.body.appendChild(settingsPanel);
}

function createSettingsRow(options: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const row = document.createElement("label");
  row.style.display = "block";
  row.style.margin = "10px 0";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.gap = "10px";
  header.style.marginBottom = "5px";

  const title = document.createElement("span");
  title.textContent = options.label;

  const valueText = document.createElement("span");
  valueText.textContent = options.format(options.value);
  valueText.style.fontVariantNumeric = "tabular-nums";
  valueText.style.opacity = "0.9";

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.style.width = "100%";
  input.style.cursor = "pointer";

  input.addEventListener("input", () => {
    const value = Number(input.value);
    valueText.textContent = options.format(value);
    options.onChange(value);
  });

  header.append(title, valueText);
  row.append(header, input);

  return row;
}

function toggleSettingsPanel() {
  if (!settingsPanel) {
    return;
  }

  setSettingsPanelOpen(settingsPanel.style.display === "none");
}

function setSettingsPanelOpen(open: boolean) {
  if (!settingsPanel) {
    return;
  }

  settingsPanel.style.display = open ? "block" : "none";
}

function isSettingsPanelOpen() {
  return Boolean(settingsPanel && settingsPanel.style.display !== "none");
}


async function loadArena() {
  arenaModel = new THREE.Group();
  arenaModel.name = "Green floor arena";
  scene.add(arenaModel);

  arenaBounds.halfX = PLAYABLE_HALF_SIZE;
  arenaBounds.halfZ = PLAYABLE_HALF_SIZE;
  ground.visible = true;

  wallColliders.length = 0;
  addPerimeterWallColliders();
  console.info("Arena wall colliders:", wallColliders.length);
}

async function loadPlayerCharacter(character: PlayerCharacter) {
  const asset = await loadCharacterAsset(character);

  if (model) {
    player.remove(model);
  }

  mixer?.stopAllAction();
  model = SkeletonUtils.clone(asset.template);
  playerAnimationClips = asset.clips;
  (window as any).__TADEO_CLIPS = playerAnimationClips;
  normalizeCharacterModel(model, getPlayerTargetSize(character), getPlayerModelGroundOffset(character));
  player.add(model);
  applyCameraProfile(character);

  rig = findRig(model);
  cacheBindPose(model);
  (window as any).__TADEO_MODEL = model;
  rightHandBone = rig ? findBestHandBone(rig.rightArms) : undefined;
  attachWeaponToHand();

  mixer = undefined;
  activeClip = undefined;

  if (playerAnimationClips.length > 0) {
    mixer = new THREE.AnimationMixer(model);

    const walkClip =
      playerAnimationClips.find((clip) => /run_a1|run/i.test(clip.name) && !/start|end/i.test(clip.name)) ??
      playerAnimationClips.find((clip) => /walk|move|dance/i.test(clip.name) && !/start|end/i.test(clip.name)) ??
      playerAnimationClips.find((clip) => /walk|run|move|dance/i.test(clip.name)) ??
      playerAnimationClips[0];

    activeClip = mixer.clipAction(walkClip);
    activeClip.play();
  }

  statusEl.textContent =
    character === "shrek" ? "Shrek Wazowski ready" : "Black rat ready";
  refreshRemotePlayerAvatars();
  sendMultiplayerStateNow();
}

async function preloadCharacter(character: PlayerCharacter) {
  await loadCharacterAsset(character);
  refreshRemotePlayerAvatars();
}

async function loadCharacterAsset(character: PlayerCharacter) {
  const existingTemplate = characterTemplates.get(character);

  if (existingTemplate) {
    return {
      template: existingTemplate,
      clips: characterAnimationClips.get(character) ?? [],
    };
  }

  const loader = new GLTFLoader();
  const path =
    character === "shrek"
      ? "/assets/source/shrek_wazowski.glb"
      : "/assets/source/black_rat__free_download.glb";
  const gltf = await loader.loadAsync(path);

  // Strip position tracks to prevent the character from floating 
  // due to baked root motion or displacement in the animation.
  gltf.animations.forEach((clip) => {
    clip.tracks = clip.tracks.filter((track) => !track.name.includes(".position"));
  });

  characterTemplates.set(character, gltf.scene);
  characterAnimationClips.set(character, gltf.animations);

  return {
    template: gltf.scene,
    clips: gltf.animations,
  };
}

function getPlayerTargetSize(character: PlayerCharacter) {
  return character === "shrek" ? 1.2 : 1.8;
}

function getPlayerModelGroundOffset(character: PlayerCharacter) {
  return 0;
}

function normalizeCharacterModel(
  root: THREE.Object3D,
  targetSize: number,
  groundOffset = 0,
) {
  if (targetSize === 1.8) {
    // Bypass bounding box calculation for the rat, as it contains a broken geometry bounding box
    root.scale.setScalar(0.4);
    root.position.setScalar(0);
    root.updateMatrixWorld(true);
    root.userData.baseY = 0;
    prepareModelMaterials(root);
    return;
  }

  // Remove cameras, lights, and empty groups that might bloat the bounding box
  const toRemove: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (
      (child instanceof THREE.Camera) ||
      (child instanceof THREE.Light) ||
      (child.name.toLowerCase().includes("camera"))
    ) {
      toRemove.push(child);
    }
  });
  toRemove.forEach((c) => c.removeFromParent());

  // Compute bounding box strictly from visible meshes
  const box = new THREE.Box3();
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      box.expandByObject(child);
    }
  });

  if (box.isEmpty()) {
    box.setFromObject(root);
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);

  root.scale.setScalar(scale);
  root.position.sub(center.multiplyScalar(scale));
  root.updateMatrixWorld(true);

  snapVisualToParentGround(root, groundOffset);
  root.userData.baseY = root.position.y;
  prepareModelMaterials(root);
}

function applyCameraProfile(character: PlayerCharacter) {
  const profile = getCameraProfile(character);
  cameraDistance = profile.distance;
  cameraPitch = profile.pitch;
}

function getCameraProfile(character: PlayerCharacter) {
  return character === "shrek"
    ? {
        distance: 4.0,
        minDistance: 3.0,
        maxDistance: 5.4,
        shoulderHeight: 1.8,
        shoulderOffset: 0.62,
        lookDistance: 16,
        pitch: 0.34,
      }
    : {
        distance: 1.5,
        minDistance: 1.0,
        maxDistance: 2.4,
        shoulderHeight: 0.6,
        shoulderOffset: 0.25,
        lookDistance: 5,
        pitch: 0.15,
      };
}

function snapVisualToParentGround(root: THREE.Object3D, offset = 0) {
  root.updateMatrixWorld(true);
  
  let hiddenWeapon = false;
  if (weapon && weapon.parent && root === model) {
    hiddenWeapon = weapon.visible;
    weapon.visible = false;
  }

  const box = new THREE.Box3();
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.visible) {
      box.expandByObject(child);
    }
  });

  if (hiddenWeapon && weapon) {
    weapon.visible = true;
  }

  if (box.isEmpty()) {
    return;
  }

  const parentWorldY = root.parent
    ? root.parent.getWorldPosition(new THREE.Vector3()).y
    : 0;
  root.position.y += parentWorldY + offset - box.min.y;
  root.updateMatrixWorld(true);
}

function getModelDebugBounds() {
  if (!model) {
    return undefined;
  }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  return {
    minY: Number(box.min.y.toFixed(3)),
    height: Number(size.y.toFixed(3)),
  };
}

async function loadCrocodileNpcs() {
  const loader = new GLTFLoader();

  const gltf = await loader.loadAsync("/assets/source/rock_fight.glb");

  crocodileTemplate = gltf.scene;
  crocodileAnimationClips = gltf.animations;

  const spawnPoints = [
    new THREE.Vector3(-6.5, groundY, -6),
    new THREE.Vector3(5.5, groundY, -5.5),
    new THREE.Vector3(-7, groundY, 4.8),
    new THREE.Vector3(7.2, groundY, 4.3),
  ];

  spawnPoints.forEach((position, index) => {
    spawnNpc("crocodile", position, (index / spawnPoints.length) * Math.PI * 2, index);
  });
}

async function loadStalkerNpcs() {
  const loader = new GLTFLoader();

  const gltf = await loader.loadAsync(
    "/assets/source/chubby_woman_ai_stalker.glb",
  );

  stalkerTemplate = gltf.scene;
  stalkerAnimationClips = gltf.animations;

  const spawnPoints = [
    new THREE.Vector3(0, groundY, -6.5),
    new THREE.Vector3(-6.5, groundY, 0),
    new THREE.Vector3(6.5, groundY, 0),
  ];

  spawnPoints.forEach((position, index) => {
    spawnNpc("stalker", position, Math.random() * Math.PI * 2, index);
  });
}

async function loadGullNpcs() {
  const loader = new GLTFLoader();

  const gltf = await loader.loadAsync("/assets/source/g-gull.glb");

  gullTemplate = gltf.scene;
  gullAnimationClips = gltf.animations;

  const spawnPoints = [
    new THREE.Vector3(-4.5, getNpcBaseY("gull"), -3.2),
    new THREE.Vector3(4.5, getNpcBaseY("gull"), 3.2),
  ];

  spawnPoints.forEach((position, index) => {
    spawnNpc("gull", position, Math.random() * Math.PI * 2, index);
  });
}

async function loadBackflipCharacter() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/source/backflip_spongebob.glb");

  backflipCharacter = gltf.scene;
  normalizeModel(backflipCharacter, 3.1);
  backflipCharacter.position.copy(spongeBobDanceCenter);
  backflipCharacter.rotation.y = Math.PI;

  backflipCharacter.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });

  scene.add(backflipCharacter);

  if (gltf.animations.length > 0) {
    backflipMixer = new THREE.AnimationMixer(backflipCharacter);
    const action = backflipMixer.clipAction(gltf.animations[0]);
    action.play();
  }
}

async function loadDancingCharacters() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/source/hip_hop_dancing_spongebob.glb");
  const clips = gltf.animations;
  const dancerCount = 5;

  for (let index = 0; index < dancerCount; index += 1) {
    const angle = (index / dancerCount) * Math.PI * 2;
    const root = new THREE.Group();
    const body = SkeletonUtils.clone(gltf.scene);

    normalizeModel(body, 2.15);
    optimizeNpcModel(body);

    body.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });

    root.add(body);
    root.position.set(
      spongeBobDanceCenter.x + Math.sin(angle) * 4.0,
      groundY,
      spongeBobDanceCenter.z + Math.cos(angle) * 4.0,
    );
    root.lookAt(spongeBobDanceCenter.x, root.position.y, spongeBobDanceCenter.z);

    scene.add(root);

    const dancerMixer = clips.length > 0 ? new THREE.AnimationMixer(body) : undefined;

    if (dancerMixer) {
      const clip =
        clips.find((animation) => /dance|hip|hop|move/i.test(animation.name)) ??
        clips[0];
      const action = dancerMixer.clipAction(clip);
      action.time = index * 0.17;
      action.play();
    }

    dancingCharacters.push({
      root,
      body,
      mixer: dancerMixer,
      angle,
      radius: 4.0 + (index % 2) * 0.35,
      orbitSpeed: 0.18,
      bobPhase: index * Math.PI * 0.4,
    });
  }
}

async function loadDancingShrek() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/source/shrek_dancing.glb");
  const root = new THREE.Group();
  const body = gltf.scene;

  normalizeModel(body, 2.85);
  optimizeNpcModel(body);

  body.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });

  root.add(body);
  root.position.set(spongeBobDanceCenter.x - 5.2, groundY, spongeBobDanceCenter.z + 1.4);
  root.lookAt(spongeBobDanceCenter.x, root.position.y, spongeBobDanceCenter.z);
  scene.add(root);

  const dancerMixer =
    gltf.animations.length > 0 ? new THREE.AnimationMixer(body) : undefined;

  if (dancerMixer) {
    const clip =
      gltf.animations.find((animation) => /dance|idle|move/i.test(animation.name)) ??
      gltf.animations[0];
    const action = dancerMixer.clipAction(clip);
    action.play();
  }

  dancingCharacters.push({
    root,
    body,
    mixer: dancerMixer,
    angle: Math.PI * 1.35,
    radius: 5.35,
    orbitSpeed: 0.08,
    bobPhase: Math.PI * 0.2,
  });
}

async function loadWeapon() {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync("/assets/source/ak-47.glb");

  const gunModel = gltf.scene;
  normalizeModel(gunModel, 2.2);

  weapon = new THREE.Group();
  weapon.add(gunModel);

  gunModel.position.set(0, 0, 0);
  gunModel.rotation.set(0, 0, 0);

  weapon.position.set(0, 0, 0);
  weapon.rotation.set(-0.08, Math.PI * 1.5, -0.12);

  weaponMount.add(weapon);
  weaponMount.visible = weaponEquipped;

  attachWeaponToHand();
  refreshRemotePlayerWeapons();
}

function spawnNpc(
  kind: NpcKind,
  position?: THREE.Vector3,
  heading?: number,
  variant = enemyNpcs.length,
) {
  if (enemyNpcs.length >= npcSettings.maxNpcCount) {
    return false;
  }
  const template = getNpcTemplate(kind);
  const animationClips = getNpcAnimationClips(kind);

  if (!template) {
    return false;
  }

  const npcRoot = new THREE.Group();
  const body = SkeletonUtils.clone(template);

  if (kind === "crocodile") {
    normalizeModel(body, 2.35);
  } else if (kind === "gull") {
    normalizeModel(body, 2.55);
    body.rotation.y = Math.PI;
  } else {
    normalizeModel(body, 3.05);

    // Если женщина идёт спиной вперёд, раскомментируй:
    // body.rotation.y = Math.PI;
  }

  optimizeNpcModel(body);

  npcRoot.add(body);
  npcRoot.position.copy(position ?? randomSpawnPosition());
  npcRoot.position.y = position?.y ?? getNpcBaseY(kind);
  constrainPositionToArena(npcRoot.position, getNpcCollisionRadius(kind));
  resolveWallCollisions(npcRoot.position, getNpcCollisionRadius(kind));
  npcRoot.rotation.y = heading ?? Math.random() * Math.PI * 2;

  scene.add(npcRoot);

  const healthBar = createHealthBar();
  healthBar.position.set(0, getNpcHealthBarY(kind), 0);
  npcRoot.add(healthBar);

  const npcMixer =
    animationClips.length > 0 ? new THREE.AnimationMixer(body) : undefined;

  if (npcMixer) {
    const clip =
      animationClips.find((animation) =>
        /walk|run|crawl|move/i.test(animation.name),
      ) ?? animationClips[0];

    const action = npcMixer.clipAction(clip);
    action.play();
  }

  const baseSpeed =
    kind === "crocodile"
      ? 0.52 + (variant % 4) * 0.09
      : kind === "gull"
        ? 1.05 + (variant % 3) * 0.12
        : 0.42 + (variant % 3) * 0.05;

  enemyNpcs.push({
    id: window.crypto.randomUUID(),
    kind,
    root: npcRoot,
    body,
    healthBar,
    healthFill: healthBar.userData.fill as THREE.Mesh,
    mixer: npcMixer,
    heading: npcRoot.rotation.y,
    targetHeading: npcRoot.rotation.y,
    speed: baseSpeed,
    turnTimer: 1 + (variant % 4) * 0.7,
    walkPhase: variant * Math.PI * 0.5,
    hp: getNpcMaxHp(kind),
    maxHp: getNpcMaxHp(kind),
    hitRadius: getNpcHitRadius(kind),
    attackCooldown: THREE.MathUtils.randFloat(0, 0.5),
    targetSearchTimer: THREE.MathUtils.randFloat(0, npcSettings.targetSearchInterval),
    cachedTarget: undefined,
  });

  return true;
}

function getNpcTemplate(kind: NpcKind) {
  if (kind === "crocodile") {
    return crocodileTemplate;
  }

  if (kind === "gull") {
    return gullTemplate;
  }

  return stalkerTemplate;
}

function getNpcAnimationClips(kind: NpcKind) {
  if (kind === "crocodile") {
    return crocodileAnimationClips;
  }

  if (kind === "gull") {
    return gullAnimationClips;
  }

  return stalkerAnimationClips;
}

function getNpcBaseY(kind: NpcKind) {
  return kind === "gull" ? groundY + 2.65 : groundY;
}

function getNpcHealthBarY(kind: NpcKind) {
  if (kind === "crocodile") {
    return 2.55;
  }

  if (kind === "gull") {
    return 1.0;
  }

  return 3.05;
}

function getNpcCollisionRadius(kind: NpcKind) {
  return kind === "crocodile" ? 0.82 : kind === "gull" ? 0.7 : 1.45;
}

function getNpcHitRadius(kind: NpcKind) {
  return kind === "crocodile" ? 0.85 : kind === "gull" ? 0.75 : 1.1;
}

function getNpcMaxHp(kind: NpcKind) {
  return kind === "crocodile" ? 100 : kind === "gull" ? 55 : 85;
}

function optimizeNpcModel(root: THREE.Object3D) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
    }
  });
}

function normalizeModel(root: THREE.Object3D, targetSize = 2.35) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);

  root.scale.setScalar(scale);
  root.position.sub(center.multiplyScalar(scale));

  root.updateMatrixWorld(true);
  root.position.y -= findLandscapeWalkableY(root);

  prepareModelMaterials(root);
}

function prepareModelMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;

      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

      for (const material of materials) {
        if ("map" in material && material.map instanceof THREE.Texture) {
          material.map.colorSpace = THREE.SRGBColorSpace;
        }

        if ("roughness" in material) {
          material.roughness = 0.72;
        }

        material.needsUpdate = true;
      }
    }
  });
}

function normalizeArena(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.z);
  const scale = largestAxis > 0 ? 34 / largestAxis : 1;

  root.scale.setScalar(scale);
  root.position.sub(center.multiplyScalar(scale));

  const postBox = new THREE.Box3().setFromObject(root);
  root.position.y -= postBox.min.y;

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  arenaBounds.halfX = PLAYABLE_HALF_SIZE;
  arenaBounds.halfZ = PLAYABLE_HALF_SIZE;

  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if ("map" in material && material.map instanceof THREE.Texture) {
          material.map.colorSpace = THREE.SRGBColorSpace;
        }

        if ("roughness" in material && typeof material.roughness === "number") {
          material.roughness = Math.max(material.roughness, 0.72);
        }

        material.needsUpdate = true;
      }
    }
  });
}

function findLandscapeWalkableY(root: THREE.Object3D) {
  const fallbackBox = new THREE.Box3().setFromObject(root);
  const floorCandidates: Array<{ y: number; footprint: number }> = [];

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }

    const box = new THREE.Box3().setFromObject(child);

    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const footprint = size.x * size.z;
    const isFlatSurface = size.y <= 1.2;

    if (!isFlatSurface || footprint < 16) {
      return;
    }

    floorCandidates.push({
      y: box.max.y,
      footprint,
    });
  });

  if (floorCandidates.length === 0) {
    console.info("Landscape walkable floor Y:", fallbackBox.min.y.toFixed(3));

    return fallbackBox.min.y;
  }

  const biggestFootprint = Math.max(
    ...floorCandidates.map((candidate) => candidate.footprint),
  );
  const usefulFloors = floorCandidates.filter(
    (candidate) => candidate.footprint >= biggestFootprint * 0.08,
  );
  const bestFloorY = Math.max(...usefulFloors.map((candidate) => candidate.y));

  console.info("Landscape walkable floor Y:", bestFloorY.toFixed(3));

  return bestFloorY;
}

function buildArenaWallColliders(root: THREE.Object3D) {
  wallColliders.length = 0;
  root.updateMatrixWorld(true);

  addPerimeterWallColliders();

  console.info("Arena wall colliders:", wallColliders.length);
}

function addPerimeterWallColliders() {
  const thickness = 2.5;
  const height = 5.0;
  const yMin = -0.25;
  const yMax = height;
  const x = arenaBounds.halfX;
  const z = arenaBounds.halfZ;

  wallColliders.push(
    {
      box: new THREE.Box3(
        new THREE.Vector3(-x - thickness, yMin, -z - thickness),
        new THREE.Vector3(x + thickness, yMax, -z),
      ),
    },
    {
      box: new THREE.Box3(
        new THREE.Vector3(-x - thickness, yMin, z),
        new THREE.Vector3(x + thickness, yMax, z + thickness),
      ),
    },
    {
      box: new THREE.Box3(
        new THREE.Vector3(-x - thickness, yMin, -z - thickness),
        new THREE.Vector3(-x, yMax, z + thickness),
      ),
    },
    {
      box: new THREE.Box3(
        new THREE.Vector3(x, yMin, -z - thickness),
        new THREE.Vector3(x + thickness, yMax, z + thickness),
      ),
    },
  );
}

function findRig(root: THREE.Object3D): LimbRig | undefined {
  const bones: THREE.Bone[] = [];

  root.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      bones.push(child as THREE.Bone);
    }
  });

  if (bones.length === 0) {
    return undefined;
  }

  const by = (patterns: RegExp[]) =>
    bones.filter((bone) => patterns.some((pattern) => pattern.test(bone.name)));

  const leftLegs = by([/(left|_l|\.l).*?(leg|thigh|calf|shin|foot)/i]);
  const rightLegs = by([/(right|_r|\.r).*?(leg|thigh|calf|shin|foot)/i]);
  const leftArms = by([/(left|_l|\.l).*?(arm|forearm|hand|wrist)/i]);
  const rightArms = by([/(right|_r|\.r).*?(arm|forearm|hand|wrist)/i]);
  const tail = by([/tail/i]);
  const spine = by([/spine|chest|body/i]);
  const head = bones.find((bone) => /head|neck/i.test(bone.name));

  console.info(
    "FBX bones:",
    bones.map((bone) => bone.name),
  );

  return {
    leftLegs,
    rightLegs,
    leftArms,
    rightArms,
    tail,
    spine,
    head,
  };
}

function cacheBindPose(root: THREE.Object3D) {
  baseBoneRotations.clear();

  root.traverse((child) => {
    if ((child as THREE.Bone).isBone) {
      const bone = child as THREE.Bone;
      baseBoneRotations.set(bone, bone.rotation.clone());
    }
  });
}

function boneDepth(bone: THREE.Bone) {
  let depth = 0;
  let current: THREE.Object3D | null = bone;

  while (current.parent) {
    depth += 1;
    current = current.parent;
  }

  return depth;
}

function orderBonesByDepth(bones: THREE.Bone[]) {
  return [...bones].sort((a, b) => boneDepth(a) - boneDepth(b));
}

function findBestHandBone(armBones: THREE.Bone[]) {
  const handCandidates = armBones.filter((bone) =>
    /hand|wrist|palm/i.test(bone.name),
  );

  const candidates = handCandidates.length > 0 ? handCandidates : armBones;
  const ordered = orderBonesByDepth(candidates);

  return ordered[ordered.length - 1];
}

function attachWeaponToHand() {
  if (!weapon || !model) {
    return;
  }
  
  if (rightHandBone) {
    rightHandBone.add(weapon);
  } else {
    model.add(weapon);
    weapon.position.set(0, 0.5, 0); // basic fallback offset
  }

  if (weaponMount.parent) {
    weaponMount.parent.remove(weaponMount);
  }

  player.add(weaponMount);

  weaponMount.position.set(0.35, 0.68, -1.05);
  weaponMount.rotation.set(-0.22, -0.32, -0.52);
  weaponMount.scale.setScalar(0.48);

  weaponMount.visible = weaponEquipped;

  weapon.position.set(0, 0, 0);
  weapon.rotation.set(-0.08, Math.PI * 1.5, -0.16);
}

function toggleWeapon() {
  weaponEquipped = !weaponEquipped;
  weaponMount.visible = weaponEquipped;

  if (weaponEquipped) {
    punchTimer = 0;
    punchCooldown = 0;
    punchDamageDone = false;
    activePunchType = null;
  } else {
    mouseHeld = false;
    weaponRecoil = 0;
  }

  statusEl.textContent = weaponEquipped
    ? `Weapon: ON | Kills: ${kills} | NPC: ${enemyNpcs.length}`
    : `Fists | Kills: ${kills} | NPC: ${enemyNpcs.length}`;
}

function getMultiplayerUrl() {
  const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const isViteDevServer =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";
  const host = isViteDevServer
    ? `${window.location.hostname}:8787`
    : window.location.host;

  return `${protocol}//${host}/multiplayer`;
}

function connectMultiplayer() {
  const url = getMultiplayerUrl();

  try {
    multiplayerSocket = new WebSocket(url);
  } catch {
    scheduleMultiplayerReconnect();
    return;
  }

  multiplayerSocket.addEventListener("open", () => {
    multiplayerConnected = true;
    multiplayerSendTimer = 0;
    sendMultiplayerStateNow();
  });

  multiplayerSocket.addEventListener("message", (event) => {
    let message: MultiplayerMessage;

    try {
      message = JSON.parse(String(event.data)) as MultiplayerMessage;
    } catch {
      return;
    }

    handleMultiplayerMessage(message);
  });

  multiplayerSocket.addEventListener("close", () => {
    multiplayerConnected = false;
    multiplayerId = undefined;
    clearRemotePlayers();
    scheduleMultiplayerReconnect();
  });

  multiplayerSocket.addEventListener("error", () => {
    multiplayerConnected = false;
  });
}

function scheduleMultiplayerReconnect() {
  if (multiplayerReconnectTimer !== undefined) {
    return;
  }

  multiplayerReconnectTimer = window.setTimeout(() => {
    multiplayerReconnectTimer = undefined;
    connectMultiplayer();
  }, 1800);
}

function handleMultiplayerMessage(message: MultiplayerMessage) {
  if (message.type === "welcome") {
    multiplayerId = message.id;
    hostId = message.hostId;
    isHost = multiplayerId === hostId;

    for (const playerMessage of message.players) {
      if (playerMessage.id !== multiplayerId) {
        upsertRemotePlayer(playerMessage.id, playerMessage.state);
      }
    }

    return;
  }

  if (message.type === "host_update") {
    hostId = message.hostId;
    isHost = multiplayerId === hostId;
    return;
  }

  if (message.type === "sync_npcs") {
    if (isHost) return;

    // Remove NPCs that are not in the sync
    const syncedIds = new Set(message.npcs.map(n => n.id));
    for (let i = enemyNpcs.length - 1; i >= 0; i--) {
      if (!syncedIds.has(enemyNpcs[i].id)) {
        removeNpcVisuals(enemyNpcs[i]);
        enemyNpcs.splice(i, 1);
      }
    }

    // Add or update NPCs
    for (const data of message.npcs) {
      const existing = enemyNpcs.find(n => n.id === data.id);
      if (existing) {
        existing.targetPosition = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
        existing.targetHeading = data.heading;
        existing.hp = data.hp;
        updateHealthBar(existing);
      } else {
        // Spawn visual for new NPC
        spawnNpc(data.kind as NpcKind, new THREE.Vector3(data.position[0], data.position[1], data.position[2]), data.heading);
        const newlySpawned = enemyNpcs[enemyNpcs.length - 1];
        if (newlySpawned) {
          newlySpawned.id = data.id; // overwrite the local random id with the synced id
          newlySpawned.hp = data.hp;
          updateHealthBar(newlySpawned);
        }
      }
    }

    return;
  }

  if (message.type === "hit_npc") {
    if (!isHost) return;
    const target = enemyNpcs.find((n) => n.id === message.npcId);
    if (target) {
      damageNpc(target, message.damage, false);
    }
    return;
  }

  if (message.type === "join") {
    if (message.player.id !== multiplayerId) {
      upsertRemotePlayer(message.player.id, message.player.state);
    }

    return;
  }

  if (message.type === "state") {
    if (message.id !== multiplayerId) {
      upsertRemotePlayer(message.id, message.state);
    }

    return;
  }

  if (message.type === "leave") {
    removeRemotePlayer(message.id);
  }
}

function removeNpcVisuals(npc: EnemyNpc) {
  if (npc.mixer) {
    npc.mixer.stopAllAction();
  }
  scene.remove(npc.root);
}

function createRemotePlayerAvatar(id: string, state: NetworkPlayerState) {
  normalizeNetworkPlayerState(state);

  const root = new THREE.Group();
  root.name = `remote-player-${id}`;

  const avatar = createRemoteAvatarObject(id, state.character);
  root.add(avatar);

  const remoteWeapon = createRemoteWeaponObject();

  if (remoteWeapon) {
    root.add(remoteWeapon);
    remoteWeapon.visible = state.weaponEquipped;
  }

  const remotePlayer = {
    root,
    avatar,
    weapon: remoteWeapon,
    mixer: createRemoteMixer(avatar, state.character),
    nameTag: createNameTag(state.nickname),
    targetPosition: new THREE.Vector3(...state.position),
    targetYaw: getRemoteDisplayYaw(state),
    state,
    usingPlaceholder: Boolean(avatar.userData.isPlaceholder),
  };

  root.position.copy(remotePlayer.targetPosition);
  root.rotation.y = remotePlayer.targetYaw;
  remotePlayer.nameTag.position.set(0, getRemoteNameTagY(state.character), 0);
  root.add(remotePlayer.nameTag);
  scene.add(root);

  return remotePlayer;
}

function createRemoteAvatarObject(id: string, character: PlayerCharacter) {
  const template = characterTemplates.get(character);

  if (template) {
    const clone = SkeletonUtils.clone(template);
    clone.name = `remote-tadeo-${id}`;
    normalizeCharacterModel(
      clone,
      getPlayerTargetSize(character),
      getPlayerModelGroundOffset(character),
    );
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    return clone;
  }

  return createRemotePlaceholder(id);
}

function createRemotePlaceholder(id: string) {
  const placeholder = new THREE.Group();
  placeholder.userData.isPlaceholder = true;

  const hue = hashString(id) % 360;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${hue}, 66%, 54%)`),
    roughness: 0.58,
    metalness: 0.04,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.1, 8, 16), bodyMaterial);
  body.position.y = 0.92;
  body.castShadow = true;
  body.userData.isPlaceholder = true;
  placeholder.add(body);
  placeholder.userData.placeholderMesh = body;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), bodyMaterial);
  head.position.y = 1.72;
  head.castShadow = true;
  head.userData.isPlaceholder = true;
  placeholder.add(head);

  return placeholder;
}

function createRemoteWeaponObject() {
  const remoteWeapon = weapon ? SkeletonUtils.clone(weapon) : createRemoteWeaponPlaceholder();

  remoteWeapon.position.set(0.34, 1.18, -0.38);
  remoteWeapon.rotation.set(-0.18, Math.PI * 1.5, -0.36);
  remoteWeapon.scale.setScalar(0.42);

  remoteWeapon.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });

  return remoteWeapon;
}

function createRemoteWeaponPlaceholder() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x222826,
    roughness: 0.75,
  });

  const weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.78), material);
  weaponMesh.castShadow = true;
  weaponMesh.userData.isPlaceholder = true;

  return weaponMesh;
}

function createRemoteMixer(avatar: THREE.Object3D, character: PlayerCharacter) {
  const clips = characterAnimationClips.get(character) ?? [];

  if (clips.length === 0 || avatar.userData.isPlaceholder) {
    return undefined;
  }

  const remoteMixer = new THREE.AnimationMixer(avatar);
  const walkClip =
    clips.find((clip) => /run_a1|run/i.test(clip.name) && !/start|end/i.test(clip.name)) ??
    clips.find((clip) => /walk|move|dance/i.test(clip.name) && !/start|end/i.test(clip.name)) ??
    clips.find((clip) => /walk|run|move|dance/i.test(clip.name)) ??
    clips[0];
  const walkAction = remoteMixer.clipAction(walkClip);
  walkAction.play();

  return remoteMixer;
}

function createNameTag(text: string) {
  const canvasElement = document.createElement("canvas");
  canvasElement.width = 512;
  canvasElement.height = 128;
  const context = canvasElement.getContext("2d");

  if (!context) {
    throw new Error("Could not create nickname canvas.");
  }

  context.clearRect(0, 0, canvasElement.width, canvasElement.height);
  context.fillStyle = "rgba(12, 17, 15, 0.72)";
  roundRect(context, 26, 24, 460, 70, 14);
  context.fill();
  context.font = "800 40px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f6f1e8";
  context.fillText(text, canvasElement.width / 2, 59, 420);

  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.4, 0.6, 1);

  return sprite;
}

function updateNameTag(sprite: THREE.Sprite, text: string) {
  const material = sprite.material as THREE.SpriteMaterial;
  material.map?.dispose();
  material.dispose();
  const nextTag = createNameTag(text);
  sprite.material = nextTag.material;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getRemoteNameTagY(character: PlayerCharacter) {
  return character === "shrek" ? 3.75 : 2.2;
}

function refreshRemotePlayerAvatars() {
  if (!model) {
    return;
  }

  for (const [id, remotePlayer] of remotePlayers) {
    const template = characterTemplates.get(remotePlayer.state.character);

    if (!template || !remotePlayer.usingPlaceholder) {
      continue;
    }

    remotePlayer.root.remove(remotePlayer.avatar);
    disposePlaceholderObject(remotePlayer.avatar);

    const avatar = createRemoteAvatarObject(id, remotePlayer.state.character);
    remotePlayer.avatar = avatar;
    remotePlayer.usingPlaceholder = false;
    remotePlayer.mixer = createRemoteMixer(avatar, remotePlayer.state.character);
    remotePlayer.root.add(avatar);
  }
}

function refreshRemotePlayerWeapons() {
  if (!weapon) {
    return;
  }

  for (const remotePlayer of remotePlayers.values()) {
    if (remotePlayer.weapon && !remotePlayer.weapon.userData.isPlaceholder) {
      continue;
    }

    if (remotePlayer.weapon) {
      remotePlayer.root.remove(remotePlayer.weapon);
      disposePlaceholderObject(remotePlayer.weapon);
    }

    remotePlayer.weapon = createRemoteWeaponObject();
    remotePlayer.weapon.visible = remotePlayer.state.weaponEquipped;
    remotePlayer.root.add(remotePlayer.weapon);
  }
}

function upsertRemotePlayer(id: string, state: NetworkPlayerState) {
  normalizeNetworkPlayerState(state);
  state.nickname = sanitizeNickname(state.nickname ?? "Player");
  state.character = state.character === "shrek" ? "shrek" : "rat";
  let remotePlayer = remotePlayers.get(id);

  if (!remotePlayer) {
    remotePlayer = createRemotePlayerAvatar(id, state);
    remotePlayers.set(id, remotePlayer);
  }

  const changedCharacter = remotePlayer.state.character !== state.character;
  const changedNickname = remotePlayer.state.nickname !== state.nickname;
  remotePlayer.state = state;
  remotePlayer.targetPosition.set(...state.position);
  remotePlayer.targetYaw = getRemoteDisplayYaw(state);

  if (changedCharacter || remotePlayer.usingPlaceholder) {
    replaceRemoteAvatar(id, remotePlayer, state.character);
  }

  if (changedNickname) {
    updateNameTag(remotePlayer.nameTag, state.nickname);
  }
  remotePlayer.nameTag.position.y = getRemoteNameTagY(state.character);

  if (remotePlayer.weapon) {
    remotePlayer.weapon.visible = state.weaponEquipped;
  }
}

function replaceRemoteAvatar(
  id: string,
  remotePlayer: RemotePlayer,
  character: PlayerCharacter,
) {
  const template = characterTemplates.get(character);

  if (!template && !remotePlayer.usingPlaceholder) {
    return;
  }

  remotePlayer.root.remove(remotePlayer.avatar);
  disposePlaceholderObject(remotePlayer.avatar);
  remotePlayer.mixer?.stopAllAction();

  const avatar = createRemoteAvatarObject(id, character);
  remotePlayer.avatar = avatar;
  remotePlayer.usingPlaceholder = Boolean(avatar.userData.isPlaceholder);
  remotePlayer.mixer = createRemoteMixer(avatar, character);
  remotePlayer.root.add(avatar);
}

function normalizeNetworkPlayerState(state: NetworkPlayerState) {
  const networkYaw = getNetworkStateYaw(state);

  state.yaw = networkYaw;
  state.rotationY = networkYaw;
}

function getNetworkStateYaw(state: Partial<NetworkPlayerState>) {
  return Number.isFinite(state.rotationY)
    ? Number(state.rotationY)
    : Number.isFinite(state.yaw)
      ? Number(state.yaw)
      : 0;
}

function getRemoteDisplayYaw(state: NetworkPlayerState) {
  return getNetworkStateYaw(state) + MODEL_FORWARD_OFFSET;
}

function removeRemotePlayer(id: string) {
  const remotePlayer = remotePlayers.get(id);

  if (!remotePlayer) {
    return;
  }

  scene.remove(remotePlayer.root);
  const nameMaterial = remotePlayer.nameTag.material as THREE.SpriteMaterial;
  nameMaterial.map?.dispose();
  nameMaterial.dispose();
  disposePlaceholderObject(remotePlayer.root);
  remotePlayers.delete(id);
}

function disposePlaceholderObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (!mesh.isMesh || !mesh.userData.isPlaceholder) {
      return;
    }

    mesh.geometry.dispose();

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material.dispose());
  });
}

function clearRemotePlayers() {
  for (const id of remotePlayers.keys()) {
    removeRemotePlayer(id);
  }
}

function updateMultiplayer(delta: number) {
  for (const remotePlayer of remotePlayers.values()) {
    remotePlayer.root.position.lerp(
      remotePlayer.targetPosition,
      1 - Math.pow(0.0008, delta),
    );
    remotePlayer.root.rotation.y = lerpAngle(
      remotePlayer.root.rotation.y,
      remotePlayer.targetYaw,
      1 - Math.pow(0.0008, delta),
    );
    remotePlayer.mixer?.update(delta);

    if (remotePlayer.avatar.userData.isPlaceholder) {
      remotePlayer.avatar.scale.y =
        1 + Math.sin(clock.elapsedTime * 8) * remotePlayer.state.speed * 0.012;
    }
  }

  multiplayerSendTimer -= delta;

  if (
    multiplayerSendTimer > 0 ||
    !multiplayerSocket ||
    multiplayerSocket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  multiplayerSendTimer = 1 / 14;

  multiplayerSocket.send(JSON.stringify({
    type: "state",
    state: createLocalNetworkState(),
  }));

  if (isHost && enemyNpcs.length > 0) {
    multiplayerSocket.send(JSON.stringify({
      type: "sync_npcs",
      npcs: enemyNpcs.map((npc) => ({
        id: npc.id,
        kind: npc.kind,
        position: [
          Number(npc.root.position.x.toFixed(3)),
          Number(npc.root.position.y.toFixed(3)),
          Number(npc.root.position.z.toFixed(3)),
        ],
        heading: Number(npc.heading.toFixed(3)),
        hp: npc.hp,
      })),
    }));
  }
}

function sendMultiplayerStateNow() {
  if (!multiplayerSocket || multiplayerSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  multiplayerSocket.send(JSON.stringify({
    type: "state",
    state: createLocalNetworkState(),
  }));
}

function createLocalNetworkState(): NetworkPlayerState {
  const rotationY = Number(player.rotation.y.toFixed(3));

  return {
    position: [
      Number(player.position.x.toFixed(3)),
      Number(player.position.y.toFixed(3)),
      Number(player.position.z.toFixed(3)),
    ],
    yaw: rotationY,
    rotationY,
    speed: Number(velocity.length().toFixed(3)),
    weaponEquipped,
    kills,
    nickname,
    character: playerCharacter,
  };
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.033);

  fireCooldown = Math.max(0, fireCooldown - delta);
  weaponRecoil = Math.max(0, weaponRecoil - delta * 8);

  punchCooldown = Math.max(0, punchCooldown - delta);
  punchTimer = Math.max(0, punchTimer - delta);

  if (activePunchType && punchTimer <= 0) {
    activePunchType = null;
  }

  if (activePunchType && punchTimer <= punchDuration - punchHitMoment && !punchDamageDone) {
    punchDamageDone = true;
    applyPunchDamage();
  }

  if (mouseHeld && (pointerLocked || mobileAttackHeld)) {
    if (weaponEquipped) {
      shoot();
    } else {
      punch();
    }
  }

  backflipMixer?.update(delta);
  updateDancingCharacters(delta);
  updateSpawnTimers(delta);
  updateAutoSpawner(delta);
  updateMovement(delta);
  updateMultiplayer(delta);
  updateNpcs(delta);
  updateCombatHud();

  renderer.render(scene, camera);
}

function updateDancingCharacters(delta: number) {
  for (const dancer of dancingCharacters) {
    dancer.mixer?.update(delta);
    dancer.angle += dancer.orbitSpeed * delta;

    dancer.root.position.x = spongeBobDanceCenter.x + Math.sin(dancer.angle) * dancer.radius;
    dancer.root.position.z = spongeBobDanceCenter.z + Math.cos(dancer.angle) * dancer.radius;
    dancer.root.position.y = groundY + Math.abs(Math.sin(clock.elapsedTime * 3.2 + dancer.bobPhase)) * 0.12;

    dancer.root.lookAt(spongeBobDanceCenter.x, dancer.root.position.y, spongeBobDanceCenter.z);
    dancer.body.rotation.z = Math.sin(clock.elapsedTime * 4.6 + dancer.bobPhase) * 0.08;
  }
}

function updateNpcs(delta: number) {
  for (const npc of [...enemyNpcs]) {
    if (!enemyNpcs.includes(npc)) {
      continue;
    }

    npc.attackCooldown = Math.max(0, npc.attackCooldown - delta);

    if (isHost) {
      if (npc.kind === "crocodile") {
        updateCrocodileNpc(npc, delta);
      } else if (npc.kind === "gull") {
        updateGullNpc(npc, delta);
      } else {
        updateStalkerNpc(npc, delta);
      }
    } else {
      // If client, we lerp to target position and rotation, which we will store in npc.targetPosition
      if (npc.targetPosition) {
        npc.root.position.lerp(npc.targetPosition, 1 - Math.pow(0.001, delta));
      }
      if (npc.targetHeading !== undefined) {
        npc.heading = THREE.MathUtils.lerp(npc.heading, npc.targetHeading, 1 - Math.pow(0.001, delta));
        npc.root.rotation.y = npc.heading;
      }
    }

    const distanceToPlayer = npc.root.position.distanceTo(player.position);
    const shouldAnimate = distanceToPlayer <= npcSettings.animationDistance;

    if (shouldAnimate) {
      animateNpcBody(npc, delta);
      npc.mixer?.update(delta);
    } else {
      npc.root.position.y = getNpcBaseY(npc.kind);
    }

    if (distanceToPlayer <= npcSettings.animationDistance * 1.6) {
      npc.healthBar.visible = true;
      npc.healthBar.lookAt(camera.position);
    } else {
      npc.healthBar.visible = false;
    }
  }
}

function updateCrocodileNpc(npc: EnemyNpc, delta: number) {
  const target = getCachedNearestNpcOfKind(npc, "stalker", delta);

  if (!target) {
    updateWanderingNpc(npc, delta);
    return;
  }

  const toTarget = target.root.position.clone().sub(npc.root.position);
  toTarget.y = 0;

  const distance = toTarget.length();

  if (distance > 0.001) {
    const direction = toTarget.clone().normalize();
    npc.targetHeading = Math.atan2(direction.x, direction.z);
  }

  npc.heading = lerpAngle(
    npc.heading,
    npc.targetHeading,
    1 - Math.pow(0.01, delta),
  );

  npc.root.rotation.y = npc.heading;

  const attackRange = 1.35 + target.hitRadius;

  if (distance > attackRange) {
    const chaseSpeed = npc.speed * 1.65 * npcSettings.npcSpeedMultiplier;

    moveNpcWithCollision(
      npc,
      Math.sin(npc.heading) * chaseSpeed * delta,
      Math.cos(npc.heading) * chaseSpeed * delta,
    );
  } else {
    attackStalker(npc, target);
  }
}

function updateGullNpc(npc: EnemyNpc, delta: number) {
  const target = getCachedNearestNpcOfKind(npc, "stalker", delta);

  if (!target) {
    updateWanderingNpc(npc, delta);
    return;
  }

  const toTarget = target.root.position.clone().sub(npc.root.position);
  toTarget.y = 0;

  const distance = toTarget.length();

  if (distance > 0.001) {
    const direction = toTarget.clone().normalize();
    npc.targetHeading = Math.atan2(direction.x, direction.z);
  }

  npc.heading = lerpAngle(
    npc.heading,
    npc.targetHeading,
    1 - Math.pow(0.006, delta),
  );

  npc.root.rotation.y = npc.heading;

  const attackRange = 0.85 + target.hitRadius;

  if (distance > attackRange) {
    const chaseSpeed = npc.speed * 1.85 * npcSettings.npcSpeedMultiplier;

    moveNpcWithCollision(
      npc,
      Math.sin(npc.heading) * chaseSpeed * delta,
      Math.cos(npc.heading) * chaseSpeed * delta,
    );
  } else {
    attackStalker(npc, target);
  }
}

function updateStalkerNpc(npc: EnemyNpc, delta: number) {
  const threat = getCachedNearestThreat(npc, delta);

  if (!threat) {
    updateWanderingNpc(npc, delta);
    return;
  }

  const awayFromThreat = npc.root.position.clone().sub(threat.root.position);
  awayFromThreat.y = 0;

  const distance = awayFromThreat.length();
  const fleeRadius = 7.5;
  const panicRadius = 3.2;

  if (distance <= 0.0001 || distance > fleeRadius) {
    updateWanderingNpc(npc, delta);
    return;
  }

  awayFromThreat.normalize();

  const distanceFromCenter = Math.hypot(
    npc.root.position.x,
    npc.root.position.z,
  );

  const wallAvoidRadius = Math.min(arenaBounds.halfX, arenaBounds.halfZ) - 2.1;

  if (distanceFromCenter > wallAvoidRadius) {
    const toCenter = new THREE.Vector3(
      -npc.root.position.x,
      0,
      -npc.root.position.z,
    ).normalize();

    awayFromThreat
      .multiplyScalar(0.45)
      .add(toCenter.multiplyScalar(0.55))
      .normalize();
  }

  npc.targetHeading = Math.atan2(awayFromThreat.x, awayFromThreat.z);

  npc.heading = lerpAngle(
    npc.heading,
    npc.targetHeading,
    1 - Math.pow(0.002, delta),
  );

  npc.root.rotation.y = npc.heading;

  const runMultiplier = distance < panicRadius ? 1.55 : 1.25;
  const fleeSpeed = npc.speed * runMultiplier * npcSettings.npcSpeedMultiplier;

  moveNpcWithCollision(
    npc,
    Math.sin(npc.heading) * fleeSpeed * delta,
    Math.cos(npc.heading) * fleeSpeed * delta,
  );
}

function updateWanderingNpc(npc: EnemyNpc, delta: number) {
  npc.turnTimer -= delta;

  const distanceFromCenter = Math.hypot(
    npc.root.position.x,
    npc.root.position.z,
  );

  const wallAvoidRadius = Math.min(arenaBounds.halfX, arenaBounds.halfZ) - 1.8;

  if (distanceFromCenter > wallAvoidRadius) {
    npc.targetHeading = Math.atan2(-npc.root.position.x, -npc.root.position.z);
    npc.turnTimer = 1.8;
  } else if (npc.turnTimer <= 0) {
    npc.targetHeading += THREE.MathUtils.randFloat(-1.15, 1.15);
    npc.turnTimer = THREE.MathUtils.randFloat(1.8, 4.2);
  }

  npc.heading = lerpAngle(
    npc.heading,
    npc.targetHeading,
    1 - Math.pow(0.02, delta),
  );

  npc.root.rotation.y = npc.heading;

  moveNpcWithCollision(
    npc,
    Math.sin(npc.heading) * npc.speed * npcSettings.npcSpeedMultiplier * delta,
    Math.cos(npc.heading) * npc.speed * npcSettings.npcSpeedMultiplier * delta,
  );
}

function moveNpcWithCollision(npc: EnemyNpc, dx: number, dz: number) {
  const oldX = npc.root.position.x;
  const oldZ = npc.root.position.z;
  const radius = getNpcCollisionRadius(npc.kind);

  const hitSomething = moveCharacterWithCollision(
    npc.root.position,
    new THREE.Vector3(dx, 0, dz),
    radius,
  );

  if (hitSomething) {
    const movedAfterClamp = Math.hypot(
      npc.root.position.x - oldX,
      npc.root.position.z - oldZ,
    ) > 0.001;

    if (!movedAfterClamp) {
      npc.root.position.x = oldX;
      npc.root.position.z = oldZ;
      keepInsideArena(npc.root.position, radius);
    }

    npc.targetHeading = Math.atan2(-npc.root.position.x, -npc.root.position.z);
    npc.targetHeading += THREE.MathUtils.randFloat(-0.75, 0.75);
    npc.heading = lerpAngle(npc.heading, npc.targetHeading, 0.35);
    npc.root.rotation.y = npc.heading;
    npc.turnTimer = 0.45;
  }
}


function animateNpcBody(npc: EnemyNpc, delta: number) {
  npc.walkPhase += delta * (2.8 + npc.speed * npcSettings.npcSpeedMultiplier);

  if (npc.kind === "crocodile") {
    npc.root.position.y = groundY + Math.abs(Math.sin(npc.walkPhase * 2)) * 0.025;
  } else if (npc.kind === "gull") {
    npc.root.position.y = getNpcBaseY("gull") + Math.sin(npc.walkPhase * 2.2) * 0.22;
    npc.body.rotation.z = Math.sin(npc.walkPhase * 4.8) * 0.18;
    npc.body.rotation.x = Math.sin(npc.walkPhase * 2.4) * 0.08;
  } else {
    npc.root.position.y = groundY + Math.abs(Math.sin(npc.walkPhase * 2)) * 0.035;
    npc.body.rotation.z = Math.sin(npc.walkPhase * 2) * 0.025;
    npc.body.rotation.x = Math.sin(npc.walkPhase) * 0.015;
  }
}


function getCachedNearestNpcOfKind(npc: EnemyNpc, kind: NpcKind, delta: number) {
  npc.targetSearchTimer -= delta;

  const cachedIsValid =
    npc.cachedTarget &&
    enemyNpcs.includes(npc.cachedTarget) &&
    npc.cachedTarget.kind === kind;

  if (npc.targetSearchTimer <= 0 || !cachedIsValid) {
    npc.cachedTarget = findNearestNpcOfKind(kind, npc.root.position);
    npc.targetSearchTimer = npcSettings.targetSearchInterval + Math.random() * 0.12;
  }

  return npc.cachedTarget;
}

function getCachedNearestThreat(npc: EnemyNpc, delta: number) {
  npc.targetSearchTimer -= delta;

  const cachedIsValid =
    npc.cachedTarget &&
    enemyNpcs.includes(npc.cachedTarget) &&
    (npc.cachedTarget.kind === "crocodile" || npc.cachedTarget.kind === "gull");

  if (npc.targetSearchTimer <= 0 || !cachedIsValid) {
    npc.cachedTarget = findNearestThreat(npc.root.position);
    npc.targetSearchTimer = npcSettings.targetSearchInterval + Math.random() * 0.12;
  }

  return npc.cachedTarget;
}

function findNearestThreat(position: THREE.Vector3) {
  let best:
    | {
        npc: EnemyNpc;
        distance: number;
      }
    | undefined;

  for (const npc of enemyNpcs) {
    if (npc.kind !== "crocodile" && npc.kind !== "gull") {
      continue;
    }

    const distance = npc.root.position.distanceTo(position);

    if (!best || distance < best.distance) {
      best = { npc, distance };
    }
  }

  return best?.npc;
}

function findNearestNpcOfKind(kind: NpcKind, position: THREE.Vector3) {
  let best:
    | {
        npc: EnemyNpc;
        distance: number;
      }
    | undefined;

  for (const npc of enemyNpcs) {
    if (npc.kind !== kind) {
      continue;
    }

    const distance = npc.root.position.distanceTo(position);

    if (!best || distance < best.distance) {
      best = {
        npc,
        distance,
      };
    }
  }

  return best?.npc;
}

function attackStalker(attacker: EnemyNpc, target: EnemyNpc) {
  if (attacker.attackCooldown > 0) {
    return;
  }

  attacker.attackCooldown = attacker.kind === "gull" ? 0.72 : 0.95;

  const damage = attacker.kind === "gull" ? 12 : 18;
  damageNpc(target, damage, false);

  spawnBiteImpact(target.root.position.clone());
}

function spawnBiteImpact(position: THREE.Vector3) {
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff6038,
      transparent: true,
      opacity: 0.95,
    }),
  );

  impact.position.copy(position);
  impact.position.y += 0.85;
  scene.add(impact);

  window.setTimeout(() => {
    scene.remove(impact);
    impact.geometry.dispose();
    (impact.material as THREE.Material).dispose();
  }, 110);
}

function updateSpawnTimers(delta: number) {
  for (let index = npcSpawnTimers.length - 1; index >= 0; index -= 1) {
    npcSpawnTimers[index].time -= delta;

    if (npcSpawnTimers[index].time > 0) {
      continue;
    }

    if (enemyNpcs.length >= npcSettings.maxNpcCount) {
      npcSpawnTimers[index].time = Math.max(0.35, npcSettings.spawnInterval);
      continue;
    }

    const kind = npcSpawnTimers[index].kind;
    const spawned = spawnNpc(kind);

    if (spawned) {
      npcSpawnTimers.splice(index, 1);
    } else {
      npcSpawnTimers[index].time = Math.max(0.35, npcSettings.spawnInterval);
    }
  }
}

function updateAutoSpawner(delta: number) {
  if (!isHost) {
    return;
  }

  if (enemyNpcs.length >= npcSettings.maxNpcCount) {
    autoSpawnTimer = Math.min(autoSpawnTimer, npcSettings.spawnInterval);
    return;
  }

  autoSpawnTimer -= delta;

  if (autoSpawnTimer > 0) {
    return;
  }

  autoSpawnTimer = npcSettings.spawnInterval;
  spawnRandomNpc();
}

function spawnRandomNpc() {
  const crocodileReady = Boolean(crocodileTemplate);
  const stalkerReady = Boolean(stalkerTemplate);
  const gullReady = Boolean(gullTemplate);

  if (!crocodileReady && !stalkerReady && !gullReady) {
    return false;
  }

  const crocodileCount = enemyNpcs.filter((npc) => npc.kind === "crocodile").length;
  const stalkerCount = enemyNpcs.filter((npc) => npc.kind === "stalker").length;
  const gullCount = enemyNpcs.filter((npc) => npc.kind === "gull").length;
  const readyKinds: NpcKind[] = [];

  if (crocodileReady) {
    readyKinds.push("crocodile");
  }

  if (stalkerReady) {
    readyKinds.push("stalker");
  }

  if (gullReady) {
    readyKinds.push("gull");
  }

  const counts: Record<NpcKind, number> = {
    crocodile: crocodileCount,
    stalker: stalkerCount,
    gull: gullCount,
  };
  const kind = readyKinds.sort((a, b) => counts[a] - counts[b])[0];

  return spawnNpc(kind);
}

function trimNpcCountToLimit() {
  while (enemyNpcs.length > npcSettings.maxNpcCount) {
    const npc = enemyNpcs[enemyNpcs.length - 1];
    removeNpcWithoutRespawn(npc);
  }
}

function removeNpcWithoutRespawn(npc: EnemyNpc) {
  const index = enemyNpcs.indexOf(npc);

  if (index >= 0) {
    enemyNpcs.splice(index, 1);
  }

  npc.mixer?.stopAllAction();
  scene.remove(npc.root);
}

function moveCharacterWithCollision(
  position: THREE.Vector3,
  deltaMove: THREE.Vector3,
  radius: number,
) {
  let collided = false;

  if (deltaMove.x !== 0) {
    position.x += deltaMove.x;
    collided = keepInsideArena(position, radius) || collided;
  }

  if (deltaMove.z !== 0) {
    position.z += deltaMove.z;
    collided = keepInsideArena(position, radius) || collided;
  }

  collided = keepInsideArena(position, radius) || collided;

  return collided;
}

function keepInsideArena(position: THREE.Vector3, radius: number) {
  let collided = constrainPositionToArena(position, radius);
  collided = resolveWallCollisions(position, radius) || collided;
  collided = constrainPositionToArena(position, radius) || collided;

  return collided;
}

function updateMovement(delta: number) {
  move.set(0, 0, 0);

  forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  right.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

  if (keys.has("KeyW") || keys.has("ArrowUp")) {
    move.add(forward);
  }

  if (keys.has("KeyS") || keys.has("ArrowDown")) {
    move.sub(forward);
  }

  if (keys.has("KeyD") || keys.has("ArrowRight")) {
    move.add(right);
  }

  if (keys.has("KeyA") || keys.has("ArrowLeft")) {
    move.sub(right);
  }

  if (Math.abs(mobileMoveForward) > 0.05 || Math.abs(mobileMoveRight) > 0.05) {
    move.addScaledVector(forward, mobileMoveForward);
    move.addScaledVector(right, mobileMoveRight);
  }

  const moving = move.lengthSq() > 0;
  const mobileMoveAmount = Math.min(
    1,
    Math.hypot(mobileMoveForward, mobileMoveRight),
  );

  if (moving) {
    move.normalize();
  }

  const sprinting =
    moving &&
    (keys.has("ControlLeft") ||
      keys.has("ControlRight") ||
      mobileMoveAmount > 0.82);

  const maxSpeed = sprinting ? 6.2 : 3.4;
  const speed = moving ? maxSpeed : 0;

  velocity.lerp(move.multiplyScalar(speed), 1 - Math.pow(0.001, delta));

  const playerHitSomething = moveCharacterWithCollision(
    player.position,
    velocity.clone().multiplyScalar(delta),
    0.72,
  );

  if (playerHitSomething) {
    velocity.x = 0;
    velocity.z = 0;
  }

  verticalVelocity -= gravity * delta;
  player.position.y += verticalVelocity * delta;

  if (player.position.y <= groundY) {
    player.position.y = groundY;
    verticalVelocity = 0;
    grounded = true;
  }

  const target = new THREE.Quaternion().setFromAxisAngle(
    yAxis,
    cameraYaw + Math.PI,
  );

  player.quaternion.slerp(target, 1 - Math.pow(0.0001, delta));

  const motionAmount = THREE.MathUtils.clamp(velocity.length() / maxSpeed, 0, 1);

  if (mixer && activeClip) {
    activeClip.timeScale = THREE.MathUtils.lerp(
      0.15,
      sprinting ? 1.55 : 1,
      motionAmount,
    );
    activeClip.weight = motionAmount;
    mixer.update(delta);
  } else {
    updateProceduralWalk(delta, motionAmount);
  }

  if (model && playerCharacter !== "rat") {
    snapVisualToParentGround(model, getPlayerModelGroundOffset(playerCharacter));
  }

  const cameraHorizontal = Math.cos(cameraPitch) * cameraDistance;
  const cameraVertical = Math.sin(cameraPitch) * cameraDistance;
  const cameraProfile = getCameraProfile(playerCharacter);

  const shoulderOrigin = player.position
    .clone()
    .addScaledVector(right, cameraProfile.shoulderOffset);
  shoulderOrigin.y += cameraProfile.shoulderHeight;

  desiredCamera.copy(shoulderOrigin).addScaledVector(forward, -cameraHorizontal);
  desiredCamera.y += cameraVertical;
  desiredCamera.y = Math.max(desiredCamera.y, player.position.y + 0.55);

  aimTarget.copy(shoulderOrigin).addScaledVector(forward, cameraProfile.lookDistance);
  aimTarget.y -= Math.sin(cameraPitch) * cameraProfile.lookDistance;

  camera.position.lerp(desiredCamera, 1 - Math.pow(0.01, delta));
  cameraTarget.lerp(aimTarget, 1 - Math.pow(0.015, delta));

  lookTarget.copy(cameraTarget);
  camera.lookAt(lookTarget);

  updateWeaponPose();
  updateFistPose();

  window.__TADEO_DEBUG__ = {
    playerPosition: [
      Number(player.position.x.toFixed(3)),
      Number(player.position.y.toFixed(3)),
      Number(player.position.z.toFixed(3)),
    ],
    speed: Number(velocity.length().toFixed(3)),
    sprinting,
    hasModel: Boolean(model),
    hasRig: Boolean(rig),
    playerYaw: Number(player.rotation.y.toFixed(3)),
    npcCount: enemyNpcs.length,
    maxNpcCount: npcSettings.maxNpcCount,
    spawnInterval: Number(npcSettings.spawnInterval.toFixed(2)),
    npcSpeedMultiplier: Number(npcSettings.npcSpeedMultiplier.toFixed(2)),
    kills,
    coins,
    nickname,
    character: playerCharacter,
    modelBounds: getModelDebugBounds(),
    weaponReady: Boolean(weapon),
    weaponEquipped,
    punchReady: punchCooldown <= 0,
    punchType: activePunchType,
    arenaReady: Boolean(arenaModel),
    wallColliderCount: wallColliders.length,
    arenaBounds: {
      halfX: Number(arenaBounds.halfX.toFixed(3)),
      halfZ: Number(arenaBounds.halfZ.toFixed(3)),
    },
    npcHp: enemyNpcs.map((npc) => npc.hp),
    npcKinds: enemyNpcs.map((npc) => npc.kind),
    npcPositions: enemyNpcs.map((npc) => [
      Number(npc.root.position.x.toFixed(3)),
      Number(npc.root.position.y.toFixed(3)),
      Number(npc.root.position.z.toFixed(3)),
    ]),
    multiplayerConnected,
    multiplayerPlayers: remotePlayers.size + (multiplayerConnected ? 1 : 0),
    multiplayerPlaceholders: [...remotePlayers.values()].filter(
      (remotePlayer) => remotePlayer.usingPlaceholder,
    ).length,
  };

  window.__TADEO_CAMERA__ = {
    yaw: Number(cameraYaw.toFixed(3)),
    pitch: Number(cameraPitch.toFixed(3)),
    distance: Number(cameraDistance.toFixed(3)),
    position: [
      Number(camera.position.x.toFixed(3)),
      Number(camera.position.y.toFixed(3)),
      Number(camera.position.z.toFixed(3)),
    ],
  };
}

function updateWeaponPose() {
  if (!weapon) {
    return;
  }

  weaponMount.visible = weaponEquipped;

  if (!weaponEquipped) {
    return;
  }

  if (weaponMount.parent !== player) {
    attachWeaponToHand();
  }

  weaponMount.position.set(0.35, 0.68, -1.05);
  weaponMount.rotation.x = -0.22 - weaponRecoil;
  weaponMount.rotation.y = -0.32;
  weaponMount.rotation.z = -0.52;
  weaponMount.scale.setScalar(0.48);

  weapon.rotation.set(-0.08, Math.PI * 1.5, -0.16);
  updateWeaponArmPose();
}

function updateFistPose() {
  if (!rig || weaponEquipped) {
    return;
  }

  const leftChain = orderBonesByDepth(rig.leftArms);
  const rightChain = orderBonesByDepth(rig.rightArms);

  const progress = activePunchType && punchTimer > 0
    ? 1 - punchTimer / punchDuration
    : 0;

  const strike = activePunchType ? getPunchStrike(progress) : 0;
  const boxerBounce = Math.sin(walkTime * 2.1) * 0.035;
  const breathing = Math.sin(walkTime * 1.7) * 0.04;

  applyGuardArmPose(leftChain, -1, boxerBounce + breathing);
  applyGuardArmPose(rightChain, 1, -boxerBounce + breathing);

  let torsoTurn = 0;
  let torsoLean = 0;
  let shoulderDip = 0;

  if (activePunchType === "jab") {
    applyPunchArmPose(leftChain, -1, strike, 0.85);
    applySupportArmGuard(rightChain, 1, strike, 0.18);

    torsoTurn = -0.16 * strike;
    torsoLean = -0.04 * strike;
    shoulderDip = 0.06 * strike;
  } else if (activePunchType === "cross") {
    applyPunchArmPose(rightChain, 1, strike, 1.15);
    applySupportArmGuard(leftChain, -1, strike, 0.28);

    torsoTurn = 0.28 * strike;
    torsoLean = -0.08 * strike;
    shoulderDip = -0.08 * strike;
  }

  if (rig.spine.length > 0) {
    rig.spine.forEach((bone, index) => {
      const falloff = 1 / (index + 1);
      bone.rotation.y += torsoTurn * falloff;
      bone.rotation.z += torsoLean * falloff;
      bone.rotation.x += shoulderDip * falloff;
    });
  }

  if (rig.head) {
    rig.head.rotation.x += 0.08;
    rig.head.rotation.y += torsoTurn * 0.18;
  }
}

function updateWeaponArmPose() {
  if (!rig) {
    return;
  }

  const leftChain = orderBonesByDepth(rig.leftArms);
  const rightChain = orderBonesByDepth(rig.rightArms);
  const breathing = Math.sin(walkTime * 1.7) * 0.025;

  applyRifleArmPose(rightChain, 1, breathing);
  applyRifleArmPose(leftChain, -1, -breathing);

  rig.spine.forEach((bone, index) => {
    restoreBone(bone);
    bone.rotation.y += 0.08 - index * 0.015;
    bone.rotation.x += -0.03;
  });
}

function applyRifleArmPose(
  armBones: THREE.Bone[],
  side: number,
  sway: number,
) {
  const upper = armBones[0];
  const lower = armBones[1];
  const hand = armBones[armBones.length - 1];

  if (upper) {
    restoreBone(upper);
    upper.rotation.x += -0.92 + sway;
    upper.rotation.y += side * 0.42;
    upper.rotation.z += side * (side > 0 ? 0.38 : 0.72);
  }

  if (lower) {
    restoreBone(lower);
    lower.rotation.x += -0.62;
    lower.rotation.y += side * 0.22;
    lower.rotation.z += side * (side > 0 ? -0.16 : 0.28);
  }

  if (hand && hand !== upper && hand !== lower) {
    restoreBone(hand);
    hand.rotation.x += -0.12;
    hand.rotation.y += side * 0.2;
    hand.rotation.z += side * 0.28;
  }
}

function applyGuardArmPose(
  armBones: THREE.Bone[],
  side: number,
  sway: number,
) {
  const upper = armBones[0];
  const lower = armBones[1];
  const hand = armBones[armBones.length - 1];

  if (upper) {
    restoreBone(upper);
    upper.rotation.x += -0.6 + sway * 0.25;
    upper.rotation.y += -side * 0.28;
    upper.rotation.z += side * 0.72;
  }

  if (lower) {
    restoreBone(lower);
    lower.rotation.x += -1.15;
    lower.rotation.y += -side * 0.1;
    lower.rotation.z += side * 0.12;
  }

  if (hand && hand !== upper && hand !== lower) {
    restoreBone(hand);
    hand.rotation.x += 0.2;
    hand.rotation.y += -side * 0.08;
    hand.rotation.z += side * 0.18;
  }
}

function applyPunchArmPose(
  armBones: THREE.Bone[],
  side: number,
  strike: number,
  reachMultiplier: number,
) {
  const upper = armBones[0];
  const lower = armBones[1];
  const hand = armBones[armBones.length - 1];

  if (upper) {
    upper.rotation.x += -0.72 * strike * reachMultiplier;
    upper.rotation.y += side * 0.56 * strike * reachMultiplier;
    upper.rotation.z += -side * 0.58 * strike * reachMultiplier;
  }

  if (lower) {
    lower.rotation.x += 1.0 * strike * reachMultiplier;
    lower.rotation.y += side * 0.18 * strike;
    lower.rotation.z += -side * 0.14 * strike;
  }

  if (hand && hand !== upper && hand !== lower) {
    hand.rotation.x += -0.25 * strike * reachMultiplier;
    hand.rotation.y += side * 0.14 * strike;
    hand.rotation.z += -side * 0.28 * strike;
  }
}

function applySupportArmGuard(
  armBones: THREE.Bone[],
  side: number,
  strike: number,
  tighten: number,
) {
  const upper = armBones[0];
  const lower = armBones[1];
  const hand = armBones[armBones.length - 1];

  if (upper) {
    upper.rotation.x += 0.08 * strike;
    upper.rotation.y += side * tighten;
    upper.rotation.z += side * 0.08 * strike;
  }

  if (lower) {
    lower.rotation.x += -0.1 * strike;
    lower.rotation.z += side * 0.08 * strike;
  }

  if (hand && hand !== upper && hand !== lower) {
    hand.rotation.x += 0.05 * strike;
    hand.rotation.z += side * 0.05 * strike;
  }
}

function getPunchStrike(progress: number) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);

  if (t <= 0.38) {
    return easeOutCubic(t / 0.38);
  }

  return 1 - easeInOutSine((t - 0.38) / 0.62);
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function updateProceduralWalk(delta: number, amount: number) {
  walkTime += delta * THREE.MathUtils.lerp(1.2, 7.5, amount);

  const stride = Math.sin(walkTime) * amount;
  const counterStride = Math.sin(walkTime + Math.PI) * amount;
  const bob = Math.abs(Math.sin(walkTime * 2)) * 0.035 * amount;

  if (model) {
    const baseY = model.userData.baseY ?? 0;
    model.position.y = baseY + bob;
    model.rotation.z = Math.sin(walkTime * 2) * 0.025 * amount;
  }

  if (!rig) {
    return;
  }

  poseBones(rig.leftLegs, stride, 0.62);
  poseBones(rig.rightLegs, counterStride, 0.62);

  if (!weaponEquipped) {
    poseBones(rig.leftArms, counterStride, 0.42);
    poseBones(rig.rightArms, stride, 0.42);
  }

  rig.tail.forEach((bone, index) => {
    restoreBone(bone);
    bone.rotation.y += Math.sin(walkTime * 1.6 + index * 0.5) * 0.18 * amount;
  });

  rig.spine.forEach((bone, index) => {
    restoreBone(bone);
    bone.rotation.y += Math.sin(walkTime * 2 + index * 0.7) * 0.035 * amount;
  });

  if (rig.head) {
    restoreBone(rig.head);
    rig.head.rotation.x += Math.sin(walkTime * 2 + 0.4) * 0.035 * amount;
  }
}

function poseBones(bones: THREE.Bone[], phase: number, strength: number) {
  bones.forEach((bone, index) => {
    if (!restoreBone(bone)) {
      return;
    }

    const falloff = 1 / (index + 1);
    bone.rotation.x += -phase * strength * falloff;
  });
}

function restoreBone(bone: THREE.Bone) {
  const baseRotation = baseBoneRotations.get(bone);

  if (!baseRotation) {
    return false;
  }

  bone.rotation.copy(baseRotation);
  return true;
}

function shoot() {
  if (fireCooldown > 0 || !weapon || !weaponEquipped) {
    return;
  }

  fireCooldown = 0.09;

  playGunshot();

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  shootOrigin.copy(raycaster.ray.origin);
  shootDirection.copy(raycaster.ray.direction);

  const hit = findShotHit() ?? findPreciseHitboxHit();

  if (hit) {
    damageNpc(hit.npc, 34);
    spawnTracer(hit.point);
  } else {
    spawnTracer(shootOrigin.clone().addScaledVector(shootDirection, 22));
  }

  weaponRecoil = 0.16;
}

function punch() {
  if (weaponEquipped || punchCooldown > 0) {
    return;
  }

  activePunchType = nextPunchType;
  nextPunchType = nextPunchType === "jab" ? "cross" : "jab";

  punchTimer = punchDuration;
  punchCooldown = punchCooldownTime;
  punchDamageDone = false;
}

function applyPunchDamage() {
  if (weaponEquipped || !activePunchType) {
    return;
  }

  const attackDirection = new THREE.Vector3(
    -Math.sin(cameraYaw),
    0,
    -Math.cos(cameraYaw),
  ).normalize();

  let best:
    | {
        npc: EnemyNpc;
        distance: number;
      }
    | undefined;

  for (const npc of enemyNpcs) {
    const toNpc = npc.root.position.clone().sub(player.position);
    toNpc.y = 0;

    const distance = toNpc.length();

    if (distance <= 0.001 || distance > punchRange + npc.hitRadius * 0.25) {
      continue;
    }

    const directionToNpc = toNpc.normalize();
    const facing = attackDirection.dot(directionToNpc);

    if (facing < 0.35) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = {
        npc,
        distance,
      };
    }
  }

  if (!best) {
    return;
  }

  damageNpc(best.npc, punchDamage);
  spawnPunchImpact(best.npc.root.position.clone());
}

function spawnPunchImpact(position: THREE.Vector3) {
  const impact = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 12),
    new THREE.MeshBasicMaterial({
      color: 0xfff1a8,
      transparent: true,
      opacity: 0.9,
    }),
  );

  impact.position.copy(position);
  impact.position.y += 0.75;
  scene.add(impact);

  window.setTimeout(() => {
    scene.remove(impact);
    impact.geometry.dispose();
    (impact.material as THREE.Material).dispose();
  }, 90);
}

function findShotHit() {
  let best:
    | {
        npc: EnemyNpc;
        distanceAlongRay: number;
        point: THREE.Vector3;
      }
    | undefined;

  for (const npc of enemyNpcs) {
    const intersections = raycaster.intersectObject(npc.body, true);
    const firstHit = intersections[0];

    if (!firstHit || firstHit.distance > 30) {
      continue;
    }

    if (!best || firstHit.distance < best.distanceAlongRay) {
      best = {
        npc,
        distanceAlongRay: firstHit.distance,
        point: firstHit.point.clone(),
      };
    }
  }

  return best;
}

function findPreciseHitboxHit() {
  let best:
    | {
        npc: EnemyNpc;
        distanceAlongRay: number;
        point: THREE.Vector3;
      }
    | undefined;

  for (const npc of enemyNpcs) {
    const box = new THREE.Box3().setFromObject(npc.body);
    const center = box.getCenter(new THREE.Vector3());

    const distanceAlongRay = center.sub(shootOrigin).dot(shootDirection);

    if (distanceAlongRay < 0 || distanceAlongRay > 30) {
      continue;
    }

    const closestPoint = shootOrigin
      .clone()
      .addScaledVector(shootDirection, distanceAlongRay);

    const expandedBox = box.expandByScalar(0.55);

    if (!expandedBox.containsPoint(closestPoint)) {
      continue;
    }

    if (!best || distanceAlongRay < best.distanceAlongRay) {
      best = {
        npc,
        distanceAlongRay,
        point: closestPoint,
      };
    }
  }

  return best;
}

function damageNpc(npc: EnemyNpc, damage: number, countAsPlayerKill = true) {
  if (!isHost && multiplayerConnected && multiplayerSocket && multiplayerSocket.readyState === WebSocket.OPEN) {
    multiplayerSocket.send(JSON.stringify({
      type: "hit_npc",
      npcId: npc.id,
      damage,
    }));
  }

  npc.hp = Math.max(0, npc.hp - damage);
  updateHealthBar(npc);

  if (npc.hp > 0) {
    npc.root.scale.setScalar(1.06);
    window.setTimeout(() => npc.root.scale.setScalar(1), 80);
    return;
  }

  if (countAsPlayerKill && !isHost) {
    kills += 1;
    const reward = npc.kind === "crocodile" ? 4 : npc.kind === "gull" ? 1 : 2;
    coins += reward;
    updateUpgradeButton();
  }

  killNpc(npc, countAsPlayerKill && isHost);
}

function killNpc(npc: EnemyNpc, countAsPlayerKill = true) {
  const index = enemyNpcs.indexOf(npc);

  if (index >= 0) {
    enemyNpcs.splice(index, 1);
  }

  npc.mixer?.stopAllAction();
  scene.remove(npc.root);

  if (countAsPlayerKill) {
    kills += 1;
    const reward = npc.kind === "crocodile" ? 4 : npc.kind === "gull" ? 1 : 2;
    coins += reward;
    updateUpgradeButton();
    sendMultiplayerStateNow();
  }

  if (isHost && enemyNpcs.length + npcSpawnTimers.length < npcSettings.maxNpcCount) {
    npcSpawnTimers.push({
      time: npcSettings.spawnInterval,
      kind: npc.kind,
    });
  }

  statusEl.textContent = weaponEquipped
    ? `Weapon: ON | Kills: ${kills} | NPC: ${enemyNpcs.length}`
    : `Fists | Kills: ${kills} | NPC: ${enemyNpcs.length}`;
}

function spawnTracer(end: THREE.Vector3) {
  const start = player.position.clone();
  start.y += 1.05;

  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const tracer = new THREE.Line(geometry, tracerMaterial.clone());

  scene.add(tracer);

  window.setTimeout(() => {
    scene.remove(tracer);
    geometry.dispose();
    (tracer.material as THREE.Material).dispose();
  }, 55);
}

function playGunshot() {
  if (playBufferedGunshot()) {
    return;
  }

  void unlockAudioContext().then(() => {
    if (!playBufferedGunshot()) {
      playFallbackGunshot();
    }
  });

  const shot = gunshotAudio.cloneNode() as HTMLAudioElement;
  shot.volume = 0.72;
  shot.currentTime = 0;

  void shot.play().catch(() => undefined);
}

async function preloadGunshotAudio() {
  try {
    const response = await fetch("/assets/audio/gunshot.mp3");
    gunshotArrayBuffer = await response.arrayBuffer();

    if (audioContext) {
      await decodeGunshotBuffer();
    }
  } catch {
    gunshotArrayBuffer = undefined;
    gunshotBuffer = undefined;
  }
}

function playBufferedGunshot() {
  if (!gunshotBuffer) {
    return false;
  }

  audioContext ??= new AudioContext();

  if (audioContext.state !== "running") {
    void unlockAudioContext().then(() => {
      playBufferedGunshot();
    });
    return true;
  }

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();

  source.buffer = gunshotBuffer;
  gain.gain.value = 0.74;

  source.connect(gain);
  gain.connect(audioContext.destination);
  source.start(audioContext.currentTime);

  return true;
}

function getAudioContext() {
  audioContext ??= new AudioContext();
  return audioContext;
}

async function unlockAudioContext() {
  if (audioUnlockPromise) {
    return audioUnlockPromise;
  }

  audioUnlockPromise = (async () => {
    const context = getAudioContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    await decodeGunshotBuffer();
  })().finally(() => {
    audioUnlockPromise = undefined;
  });

  return audioUnlockPromise;
}

async function decodeGunshotBuffer() {
  if (gunshotBuffer || !gunshotArrayBuffer) {
    return;
  }

  if (gunshotBufferPromise) {
    return gunshotBufferPromise;
  }

  const context = getAudioContext();

  gunshotBufferPromise = context
    .decodeAudioData(gunshotArrayBuffer.slice(0))
    .then((buffer) => {
      gunshotBuffer = buffer;
    })
    .catch(() => {
      gunshotBuffer = undefined;
    })
    .finally(() => {
      gunshotBufferPromise = undefined;
    });

  return gunshotBufferPromise;
}

function playFallbackGunshot() {
  const context = getAudioContext();

  if (context.state !== "running") {
    void unlockAudioContext().then(() => {
      playFallbackGunshot();
    });
    return;
  }

  const now = context.currentTime;
  const duration = 0.12;
  const sampleRate = context.sampleRate;

  const buffer = context.createBuffer(1, sampleRate * duration, sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    const t = index / channel.length;
    const crack = (Math.random() * 2 - 1) * Math.pow(1 - t, 9);
    const lowPop = Math.sin(index * 0.18) * Math.pow(1 - t, 5);

    channel[index] = (crack * 0.72 + lowPop * 0.28) * 0.9;
  }

  const noise = context.createBufferSource();
  noise.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.setValueAtTime(520, now);
  filter.frequency.exponentialRampToValueAtTime(170, now + duration);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.85, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  noise.start(now);
  noise.stop(now + duration);
}

function createHealthBar() {
  const group = new THREE.Group();

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.12),
    new THREE.MeshBasicMaterial({
      color: 0x1b1d19,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.07),
    new THREE.MeshBasicMaterial({
      color: 0xd64d37,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );

  fill.position.z = 0.01;

  group.add(back, fill);
  group.userData.fill = fill;

  return group;
}

function updateHealthBar(npc: EnemyNpc) {
  const ratio = THREE.MathUtils.clamp(npc.hp / npc.maxHp, 0, 1);

  npc.healthFill.scale.x = ratio;
  npc.healthFill.position.x = -(1 - ratio) * 0.525;
}

function updateCombatHud() {
  if (!model) {
    return;
  }

  const mode = weaponEquipped ? "Weapon: ON" : "Fists";
  const crocodileCount = enemyNpcs.filter((npc) => npc.kind === "crocodile").length;
  const stalkerCount = enemyNpcs.filter((npc) => npc.kind === "stalker").length;
  const gullCount = enemyNpcs.filter((npc) => npc.kind === "gull").length;
  const onlineCount = remotePlayers.size + (multiplayerConnected ? 1 : 0);
  const onlineStatus = multiplayerConnected ? `${onlineCount}` : "offline";

  statusEl.textContent = `${mode} | ${nickname} | Online: ${onlineStatus} | Coins: ${coins} | Kills: ${kills} | NPC: ${enemyNpcs.length}/${npcSettings.maxNpcCount} | Rocks: ${crocodileCount} | Gulls: ${gullCount} | Stalkers: ${stalkerCount} | Spawn: ${npcSettings.spawnInterval.toFixed(1)}s | Speed: ${npcSettings.npcSpeedMultiplier.toFixed(1)}x | Esc: menu`;
}

function randomSpawnPosition() {
  const angle = Math.random() * Math.PI * 2;
  const maxRadius = Math.max(4, Math.min(arenaBounds.halfX, arenaBounds.halfZ) - 2.2);
  const radius = THREE.MathUtils.randFloat(maxRadius * 0.62, maxRadius);

  const position = new THREE.Vector3(
    Math.sin(angle) * radius,
    groundY,
    Math.cos(angle) * radius,
  );

  keepInsideArena(position, 1.25);

  return position;
}

function constrainPositionToArena(position: THREE.Vector3, radius: number) {
  const minX = -arenaBounds.halfX + radius;
  const maxX = arenaBounds.halfX - radius;
  const minZ = -arenaBounds.halfZ + radius;
  const maxZ = arenaBounds.halfZ - radius;

  const clampedX = THREE.MathUtils.clamp(position.x, minX, maxX);
  const clampedZ = THREE.MathUtils.clamp(position.z, minZ, maxZ);
  const changed = clampedX !== position.x || clampedZ !== position.z;

  position.x = clampedX;
  position.z = clampedZ;

  return changed;
}

function resolveWallCollisions(position: THREE.Vector3, radius: number) {
  let collided = false;

  // Несколько коротких проходов нужны, чтобы в углах не было щели между двумя стенами.
  for (let pass = 0; pass < 3; pass += 1) {
    let changedThisPass = false;

    for (const collider of wallColliders) {
      const box = collider.box;

      if (position.y + 1.8 < box.min.y || position.y > box.max.y + 0.25) {
        continue;
      }

      const nearestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
      const nearestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);

      const dx = position.x - nearestX;
      const dz = position.z - nearestZ;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq >= radius * radius) {
        continue;
      }

      collided = true;
      changedThisPass = true;

      if (distanceSq > 0.000001) {
        const distance = Math.sqrt(distanceSq);
        const push = radius - distance + 0.04;

        position.x += (dx / distance) * push;
        position.z += (dz / distance) * push;
        continue;
      }

      const pushLeft = Math.abs(position.x - box.min.x);
      const pushRight = Math.abs(box.max.x - position.x);
      const pushBack = Math.abs(position.z - box.min.z);
      const pushForward = Math.abs(box.max.z - position.z);
      const minPush = Math.min(pushLeft, pushRight, pushBack, pushForward);

      if (minPush === pushLeft) {
        position.x = box.min.x - radius - 0.04;
      } else if (minPush === pushRight) {
        position.x = box.max.x + radius + 0.04;
      } else if (minPush === pushBack) {
        position.z = box.min.z - radius - 0.04;
      } else {
        position.z = box.max.z + radius + 0.04;
      }
    }

    if (!changedThisPass) {
      break;
    }
  }

  return collided;
}


function lerpAngle(from: number, to: number, amount: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * amount;
}
