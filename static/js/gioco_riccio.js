/**
 * Il Viaggio del Riccio - platform 2D con Phaser 3 (Arcade Physics).
 * Personaggi, mela e sfondo: PNG reali (static/img/*.png, iniettati da
 * window.HEDGEHOG_GAME_ASSETS). Terreno/spuntoni/checkpoint: grafica
 * vettoriale generata a runtime (vedi createPlaceholderTextures).
 */
(function () {
  'use strict';

  var CONTAINER_ID = 'game-container';
  var container = document.getElementById(CONTAINER_ID);
  if (!container) return;

  // Evita doppie inizializzazioni se lo script viene incluso più volte.
  if (window.__giocoRiccioLoaded) return;
  window.__giocoRiccioLoaded = true;

  // ---------------------------------------------------------------------
  // Costanti di gioco
  // ---------------------------------------------------------------------
  var GAME_WIDTH = 960;
  var GAME_HEIGHT = 540;
  var WORLD_WIDTH = 3600;
  var WORLD_HEIGHT = 900;
  var FALL_DEATH_Y = 640;

  var GRAVITY_Y = 950;
  var MOVE_SPEED = 210;
  var ACCEL = 0.22;
  var DECEL = 0.32;
  var JUMP_VELOCITY = -520;
  var COYOTE_MS = 120;
  var JUMP_BUFFER_MS = 150;
  var INVULN_MS = 1500;
  var STOMP_BOUNCE = -320;
  var WALK_FRAME_MS = 130;

  var TOTAL_LIVES = 3;

  var PLAYER_TARGET_HEIGHT = 78; // altezza in px-mondo del riccio giocatore
  var ENEMY_TARGET_HEIGHT = 64;
  var GOAL_TARGET_HEIGHT = 78;

  // Rapporti usati per ricavare una hitbox ragionevole dai PNG (che hanno
  // parecchio spazio trasparente attorno al personaggio). Condivisi da
  // player e nemico così la sensazione di collisione resta coerente.
  var BODY_WIDTH_RATIO = 0.42;
  var BODY_HEIGHT_RATIO = 0.62;
  var BODY_BOTTOM_MARGIN_RATIO = 0.04;

  // ---------------------------------------------------------------------
  // Chiavi texture centralizzate: i personaggi sono PNG reali, il resto
  // del livello è ancora grafica vettoriale temporanea generata a runtime.
  // Sostituire in futuro con PNG richiede di toccare solo questa mappa.
  // ---------------------------------------------------------------------
  var TEXTURE_KEYS = {
    playerIdle: 'hedgehog-standing',
    playerWalk1: 'hedgehog-walk-1',
    playerWalk2: 'hedgehog-walk-2',
    playerJump: 'hedgehog-jump',
    playerHurt: 'hedgehog-sad',
    playerVictory: 'hedgehog-happy',
    goal: 'hedgehog-female',
    enemy: 'enemy-snail',
    apple: 'apple',
    background: 'game-background',
    // grafica vettoriale temporanea (vedi createPlaceholderTextures)
    groundTile: 'ground-tile',
    spikes: 'spikes',
    checkpointOff: 'checkpoint-off',
    checkpointOn: 'checkpoint-on'
  };

  // Da chiave texture a proprietà di window.HEDGEHOG_GAME_ASSETS.
  var REAL_ASSET_MAP = {
    playerIdle: 'standing',
    playerWalk1: 'walk1',
    playerWalk2: 'walk2',
    playerJump: 'jump',
    playerHurt: 'sad',
    playerVictory: 'happy',
    goal: 'female',
    enemy: 'snail',
    apple: 'apple',
    background: 'background'
  };

  // ---------------------------------------------------------------------
  // HUD e overlay DOM (aggiornati solo tramite queste funzioni dedicate)
  // ---------------------------------------------------------------------
  var dom = {
    apples: document.getElementById('hud-apples'),
    applesTotal: document.getElementById('hud-apples-total'),
    lives: document.getElementById('hud-lives'),
    status: document.getElementById('hud-status'),
    toastCheckpoint: document.getElementById('toast-checkpoint'),
    overlayGameOver: document.getElementById('overlay-gameover'),
    overlayVictory: document.getElementById('overlay-victory'),
    gameOverScore: document.getElementById('gameover-score'),
    victoryApples: document.getElementById('victory-apples'),
    victoryApplesTotal: document.getElementById('victory-apples-total'),
    victoryLives: document.getElementById('victory-lives'),
    btnLeft: document.getElementById('btn-left'),
    btnRight: document.getElementById('btn-right'),
    btnJump: document.getElementById('btn-jump'),
    btnRestart: document.getElementById('btn-restart'),
    btnRetryGameOver: document.getElementById('btn-retry-gameover'),
    btnRetryVictory: document.getElementById('btn-retry-victory')
  };

  var checkpointToastTimer = null;

  function updateHud(state) {
    if (typeof state.apples === 'number' && dom.apples) dom.apples.textContent = state.apples;
    if (typeof state.applesTotal === 'number' && dom.applesTotal) dom.applesTotal.textContent = state.applesTotal;
    if (typeof state.lives === 'number' && dom.lives) dom.lives.textContent = state.lives;
    if (typeof state.status === 'string' && dom.status) dom.status.textContent = state.status;
  }

  function showCheckpointToast() {
    if (!dom.toastCheckpoint) return;
    dom.toastCheckpoint.classList.remove('hidden');
    if (checkpointToastTimer) clearTimeout(checkpointToastTimer);
    checkpointToastTimer = setTimeout(function () {
      dom.toastCheckpoint.classList.add('hidden');
    }, 2200);
  }

  function hideOverlays() {
    if (dom.overlayGameOver) dom.overlayGameOver.classList.add('hidden');
    if (dom.overlayVictory) dom.overlayVictory.classList.add('hidden');
    if (dom.toastCheckpoint) dom.toastCheckpoint.classList.add('hidden');
  }

  function showGameOver(score) {
    if (dom.gameOverScore) dom.gameOverScore.textContent = score;
    if (dom.overlayGameOver) dom.overlayGameOver.classList.remove('hidden');
  }

  function showVictory(state) {
    if (dom.victoryApples) dom.victoryApples.textContent = state.apples;
    if (dom.victoryApplesTotal) dom.victoryApplesTotal.textContent = state.applesTotal;
    if (dom.victoryLives) dom.victoryLives.textContent = state.lives;
    if (dom.overlayVictory) dom.overlayVictory.classList.remove('hidden');
    if (window.navigator && typeof window.navigator.vibrate === 'function') {
      window.navigator.vibrate(100);
    }
  }

  // ---------------------------------------------------------------------
  // Stato input unificato (tastiera + touch/mouse sui pulsanti)
  // ---------------------------------------------------------------------
  var inputState = { left: false, right: false };
  var jumpQueuedAt = -Infinity;
  var restartRequested = false;

  function queueJump() {
    jumpQueuedAt = performance.now();
  }

  function requestRestart() {
    restartRequested = true;
  }

  function bindHoldButton(el, onDown, onUp) {
    if (!el) return;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      onDown();
    });
    el.addEventListener('pointerup', function (e) {
      e.preventDefault();
      onUp();
    });
    el.addEventListener('pointercancel', function (e) {
      e.preventDefault();
      onUp();
    });
    el.addEventListener('pointerout', function (e) {
      onUp();
    });
  }

  bindHoldButton(dom.btnLeft, function () { inputState.left = true; }, function () { inputState.left = false; });
  bindHoldButton(dom.btnRight, function () { inputState.right = true; }, function () { inputState.right = false; });
  bindHoldButton(dom.btnJump, function () { queueJump(); }, function () {});

  if (dom.btnRestart) {
    dom.btnRestart.style.touchAction = 'none';
    dom.btnRestart.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      requestRestart();
    });
  }
  if (dom.btnRetryGameOver) dom.btnRetryGameOver.addEventListener('click', requestRestart);
  if (dom.btnRetryVictory) dom.btnRetryVictory.addEventListener('click', requestRestart);

  // ---------------------------------------------------------------------
  // Dati del livello
  // ---------------------------------------------------------------------
  var PLAYER_START = { x: 80, y: 300 };

  var PLATFORMS = [
    { x: 310, top: 470, w: 620 },
    { x: 1020, top: 470, w: 520 },
    { x: 1425, top: 360, w: 190 },
    { x: 1760, top: 470, w: 400 },
    { x: 2365, top: 470, w: 570 },
    { x: 3125, top: 470, w: 350 },
    { x: 3450, top: 430, w: 300 }
  ];

  var APPLES = [
    { x: 200, y: 430 }, { x: 450, y: 430 },
    { x: 860, y: 420 }, { x: 1150, y: 420 },
    { x: 1380, y: 300 }, { x: 1470, y: 300 },
    { x: 1650, y: 420 }, { x: 1850, y: 420 },
    { x: 2150, y: 420 }, { x: 2450, y: 420 },
    { x: 3050, y: 420 }, { x: 3450, y: 380 }
  ];

  // Tutti i nemici pattugliano piattaforme con top=470: li facciamo cadere
  // da y=400 e la gravità li assesta correttamente indipendentemente dalla
  // dimensione reale dello sprite PNG usato.
  var ENEMIES = [
    { x: 820, y: 400, xMin: 820, xMax: 1150, speed: 45 },
    { x: 1620, y: 400, xMin: 1620, xMax: 1900, speed: 50 },
    { x: 2400, y: 400, xMin: 2400, xMax: 2600, speed: 45 },
    { x: 2990, y: 400, xMin: 2990, xMax: 3180, speed: 55 }
  ];

  var SPIKES = [
    { x: 1000, top: 470 },
    { x: 3250, top: 470 }
  ];

  var CHECKPOINT = { x: 2200, top: 470 };
  var MOVING_PLATFORM = { x: 2680, xMin: 2680, xMax: 2920, y: 380, w: 130, speed: 55 };
  var GOAL = { x: 3520, top: 430 };

  // ---------------------------------------------------------------------
  // Scene principale
  // ---------------------------------------------------------------------
  function MainScene() {
    Phaser.Scene.call(this, { key: 'MainScene' });
  }
  MainScene.prototype = Object.create(Phaser.Scene.prototype);
  MainScene.prototype.constructor = MainScene;

  // -- Caricamento PNG dei personaggi ------------------------------------
  MainScene.prototype.preload = function () {
    if (this.textures.exists(TEXTURE_KEYS.playerIdle)) return; // già caricate (es. dopo un restart)

    var assets = window.HEDGEHOG_GAME_ASSETS || {};
    Object.keys(REAL_ASSET_MAP).forEach(function (configKey) {
      var url = assets[REAL_ASSET_MAP[configKey]];
      var textureKey = TEXTURE_KEYS[configKey];
      if (url) this.load.image(textureKey, url);
    }, this);
  };

  MainScene.prototype.create = function () {
    this.createPlaceholderTextures();
    this.buildBackground();
    this.buildWorld();
    this.buildHazardsAndEnemies();
    this.buildCollectibles();
    this.buildCheckpointAndGoal();
    this.buildPlayer();
    this.setupPhysics();
    this.setupCamera();
    this.setupInput();

    this.gameState = 'playing';
    this.applesCollected = 0;
    this.applesTotal = APPLES.length;
    this.score = 0;
    this.lives = TOTAL_LIVES;
    this.respawnPoint = { x: PLAYER_START.x, y: PLAYER_START.y };
    this.lastGroundedAt = performance.now();
    this.walkAnimAccum = 0;
    this.walkFrameToggle = false;

    inputState.left = false;
    inputState.right = false;
    jumpQueuedAt = -Infinity;
    restartRequested = false;

    hideOverlays();
    updateHud({
      apples: this.applesCollected,
      applesTotal: this.applesTotal,
      lives: this.lives,
      status: 'Pronto'
    });
  };

  // -- Metriche corpo/scala per uno sprite "riccio" a partire dalla sua
  //    dimensione PNG reale (non assunta fissa). Usata per player e nemico,
  //    dove una hitbox stretta e stabile conta per il platforming. --------
  function computeCharacterMetrics(scene, textureKey, targetHeight) {
    var img = scene.textures.get(textureKey).getSourceImage();
    var frameW = img.width;
    var frameH = img.height;
    var scale = targetHeight / frameH;
    var bodyW = frameW * BODY_WIDTH_RATIO;
    var bodyH = frameH * BODY_HEIGHT_RATIO;
    var offsetX = (frameW - bodyW) / 2;
    var offsetY = frameH - bodyH - frameH * BODY_BOTTOM_MARGIN_RATIO;
    return {
      frameW: frameW,
      frameH: frameH,
      scale: scale,
      bodyW: bodyW,
      bodyH: bodyH,
      offsetX: offsetX,
      offsetY: offsetY,
      // distanza dal centro dello sprite al bordo inferiore del corpo,
      // utile per posizionare a mano sprite statici (es. il traguardo).
      bodyBottomFromCenter: (offsetY + bodyH - frameH / 2) * scale
    };
  }

  // -- Metriche scala/corpo per uno sprite fluttuante con hitbox centrata
  //    (es. la mela): niente ancoraggio al "suolo", basta un box centrale
  //    ragionevole rispetto al frame PNG reale. -------------------------
  function computeCenteredMetrics(scene, textureKey, targetHeight, bodyRatio) {
    var img = scene.textures.get(textureKey).getSourceImage();
    var frameW = img.width;
    var frameH = img.height;
    var scale = targetHeight / frameH;
    var bodyW = frameW * bodyRatio;
    var bodyH = frameH * bodyRatio;
    return {
      scale: scale,
      bodyW: bodyW,
      bodyH: bodyH,
      offsetX: (frameW - bodyW) / 2,
      offsetY: (frameH - bodyH) / 2
    };
  }

  // -- Grafica vettoriale temporanea per gli elementi di livello ----------
  // (terreno, spuntoni, checkpoint). Personaggi, mela, nemico e sfondo
  // usano invece i PNG reali caricati in preload().
  MainScene.prototype.createPlaceholderTextures = function () {
    if (this.textures.exists(TEXTURE_KEYS.groundTile)) return; // già generate (es. dopo un restart)

    var g;

    // Tile terreno erboso
    g = this.make.graphics();
    g.fillStyle(0x8a5a34, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x6e4526, 1);
    g.fillRect(6, 24, 8, 6);
    g.fillRect(40, 38, 10, 6);
    g.fillRect(20, 48, 8, 6);
    g.fillStyle(0x6bc24a, 1);
    g.fillRect(0, 0, 64, 16);
    g.fillStyle(0x4a9c34, 1);
    g.fillRect(0, 12, 64, 5);
    g.generateTexture(TEXTURE_KEYS.groundTile, 64, 64);
    g.destroy();

    // Spuntoni
    g = this.make.graphics();
    g.fillStyle(0x7d838a, 1);
    g.fillTriangle(2, 28, 18, 28, 10, 4);
    g.fillTriangle(18, 28, 34, 28, 26, 4);
    g.fillTriangle(34, 28, 50, 28, 42, 4);
    g.fillTriangle(50, 28, 64, 28, 58, 4);
    g.fillStyle(0xb0b6bd, 1);
    g.fillTriangle(5, 26, 15, 26, 10, 6);
    g.fillTriangle(21, 26, 31, 26, 26, 6);
    g.fillTriangle(37, 26, 47, 26, 42, 6);
    g.fillTriangle(53, 26, 63, 26, 58, 6);
    g.generateTexture(TEXTURE_KEYS.spikes, 64, 28);
    g.destroy();

    // Checkpoint (bandiera spenta / attiva)
    g = this.make.graphics();
    g.fillStyle(0x6b4423, 1);
    g.fillRect(9, 0, 4, 70);
    g.fillStyle(0x9aa0a6, 1);
    g.fillTriangle(13, 4, 13, 28, 36, 14);
    g.generateTexture(TEXTURE_KEYS.checkpointOff, 40, 70);
    g.destroy();

    g = this.make.graphics();
    g.fillStyle(0x6b4423, 1);
    g.fillRect(9, 0, 4, 70);
    g.fillStyle(0x4caf50, 1);
    g.fillTriangle(13, 4, 13, 28, 36, 14);
    g.generateTexture(TEXTURE_KEYS.checkpointOn, 40, 70);
    g.destroy();
  };

  // -- Sfondo: PNG reale (background_game.png) in scroll con parallasse.
  // Il TileSprite resta fisso alla camera (scrollFactor 0) e "scorre" via
  // tilePositionX aggiornato in update(): copre qualunque WORLD_WIDTH senza
  // buchi, indipendentemente dalla larghezza nativa dell'immagine. --------
  var BG_PARALLAX_FACTOR = 0.5;

  MainScene.prototype.buildBackground = function () {
    var img = this.textures.get(TEXTURE_KEYS.background).getSourceImage();
    var bg = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, TEXTURE_KEYS.background);
    var fitScale = GAME_HEIGHT / img.height;
    bg.setTileScale(fitScale, fitScale);
    bg.setScrollFactor(0, 0);
    bg.setDepth(-100);
    this.backgroundTile = bg;
  };

  MainScene.prototype.updateBackgroundScroll = function () {
    if (!this.backgroundTile) return;
    this.backgroundTile.tilePositionX = this.cameras.main.scrollX * BG_PARALLAX_FACTOR;
  };

  // -- Piattaforme statiche -------------------------------------------
  MainScene.prototype.buildWorld = function () {
    this.platformsGroup = this.physics.add.staticGroup();

    PLATFORMS.forEach(function (p) {
      var height = 40;
      var tile = this.add.tileSprite(p.x, p.top + height / 2, p.w, height, TEXTURE_KEYS.groundTile);
      this.physics.add.existing(tile, true);
      tile.setDepth(0);
      this.platformsGroup.add(tile);
    }, this);

    // Piattaforma mobile (dinamica, immobile rispetto alle collisioni)
    var mp = MOVING_PLATFORM;
    this.movingPlatform = this.add.tileSprite(mp.x, mp.y, mp.w, 30, TEXTURE_KEYS.groundTile);
    this.physics.add.existing(this.movingPlatform, false);
    this.movingPlatform.body.setAllowGravity(false);
    this.movingPlatform.body.setImmovable(true);
    this.movingPlatform.body.setVelocityX(mp.speed);
    this.movingPlatform.setData('xMin', mp.xMin);
    this.movingPlatform.setData('xMax', mp.xMax);
    this.movingPlatform.setData('speed', mp.speed);
    this.movingPlatform.setDepth(0);
  };

  // -- Nemici e ostacoli -------------------------------------------------
  MainScene.prototype.buildHazardsAndEnemies = function () {
    this.enemiesGroup = this.physics.add.group();
    var metrics = computeCharacterMetrics(this, TEXTURE_KEYS.enemy, ENEMY_TARGET_HEIGHT);

    ENEMIES.forEach(function (e) {
      var enemy = this.physics.add.sprite(e.x, e.y, TEXTURE_KEYS.enemy);
      enemy.setScale(metrics.scale);
      enemy.setSize(metrics.bodyW, metrics.bodyH).setOffset(metrics.offsetX, metrics.offsetY);
      enemy.setCollideWorldBounds(false);
      enemy.setVelocityX(e.speed);
      enemy.setData('xMin', e.xMin);
      enemy.setData('xMax', e.xMax);
      enemy.setData('speed', e.speed);
      enemy.setDepth(1);
      this.enemiesGroup.add(enemy);
    }, this);

    this.spikesGroup = this.physics.add.staticGroup();
    SPIKES.forEach(function (s) {
      var spike = this.add.image(s.x, s.top - 8, TEXTURE_KEYS.spikes);
      this.physics.add.existing(spike, true);
      spike.body.setSize(60, 16).setOffset(2, 8);
      spike.setDepth(0);
      this.spikesGroup.add(spike);
    }, this);
  };

  // -- Mele collezionabili -------------------------------------------------
  var APPLE_TARGET_HEIGHT = 30;

  MainScene.prototype.buildCollectibles = function () {
    this.applesGroup = this.physics.add.group({ allowGravity: false });
    var metrics = computeCenteredMetrics(this, TEXTURE_KEYS.apple, APPLE_TARGET_HEIGHT, 0.55);

    APPLES.forEach(function (a) {
      var apple = this.applesGroup.create(a.x, a.y, TEXTURE_KEYS.apple);
      apple.setScale(metrics.scale);
      apple.setSize(metrics.bodyW, metrics.bodyH).setOffset(metrics.offsetX, metrics.offsetY);
      apple.setDepth(1);
      this.tweens.add({
        targets: apple,
        y: a.y - 6,
        duration: 700 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }, this);
  };

  // -- Checkpoint e traguardo (la Buba) --------------------------------
  MainScene.prototype.buildCheckpointAndGoal = function () {
    this.checkpoint = this.add.image(CHECKPOINT.x, CHECKPOINT.top - 35, TEXTURE_KEYS.checkpointOff);
    this.physics.add.existing(this.checkpoint, true);
    this.checkpoint.setData('activated', false);
    this.checkpoint.setDepth(0);

    // La Buba (goal) è un target passivo: hitbox generosa (frame intero)
    // per rendere il "salvataggio" più permissivo, posizione calcolata dai
    // metrics così poggia visivamente sulla piattaforma finale.
    var goalMetrics = computeCharacterMetrics(this, TEXTURE_KEYS.goal, GOAL_TARGET_HEIGHT);
    this.goal = this.add.sprite(GOAL.x, GOAL.top - goalMetrics.bodyBottomFromCenter, TEXTURE_KEYS.goal);
    this.goal.setScale(goalMetrics.scale);
    this.physics.add.existing(this.goal, true);
    this.goal.setDepth(1);
    this.tweens.add({
      targets: this.goal,
      y: this.goal.y - 8,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  };

  // -- Giocatore -----------------------------------------------------------
  MainScene.prototype.buildPlayer = function () {
    var metrics = computeCharacterMetrics(this, TEXTURE_KEYS.playerIdle, PLAYER_TARGET_HEIGHT);

    this.player = this.physics.add.sprite(PLAYER_START.x, PLAYER_START.y, TEXTURE_KEYS.playerIdle);
    this.player.setScale(metrics.scale);
    this.player.setSize(metrics.bodyW, metrics.bodyH).setOffset(metrics.offsetX, metrics.offsetY);
    this.player.setCollideWorldBounds(true);
    this.player.setMaxVelocity(MOVE_SPEED, 900);
    this.player.setDepth(2);
    this.player.setData('invulnerable', false);

    this.facingLeft = false;
    this.currentPlayerTextureKey = TEXTURE_KEYS.playerIdle;
  };

  // -- Interazioni fisiche -----------------------------------------------
  MainScene.prototype.setupPhysics = function () {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.physics.add.collider(this.player, this.platformsGroup);
    this.physics.add.collider(this.enemiesGroup, this.platformsGroup);
    this.physics.add.collider(this.player, this.movingPlatform, this.handleMovingPlatform, undefined, this);

    this.physics.add.overlap(this.player, this.applesGroup, this.collectApple, undefined, this);
    this.physics.add.overlap(this.player, this.enemiesGroup, this.handleEnemyContact, undefined, this);
    this.physics.add.overlap(this.player, this.spikesGroup, this.handleHazardContact, undefined, this);
    this.physics.add.overlap(this.player, this.checkpoint, this.handleCheckpoint, undefined, this);
    this.physics.add.overlap(this.player, this.goal, this.handleVictory, undefined, this);
  };

  MainScene.prototype.setupCamera = function () {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  };

  MainScene.prototype.setupInput = function () {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyA = this.input.keyboard.addKey('A');
    this.keyD = this.input.keyboard.addKey('D');
    this.keyW = this.input.keyboard.addKey('W');
    this.keyR = this.input.keyboard.addKey('R');
  };

  // -- Piattaforma mobile: trascina il giocatore mentre ci sta sopra -----
  MainScene.prototype.handleMovingPlatform = function (player, platform) {
    if (player.body.touching.down || player.body.blocked.down) {
      player.x += platform.body.deltaX();
    }
  };

  // -- Raccolta mele --------------------------------------------------------
  MainScene.prototype.collectApple = function (player, apple) {
    if (!apple.body || !apple.body.enable) return;
    apple.body.enable = false;
    this.applesCollected += 1;
    this.score += 10;
    updateHud({
      apples: this.applesCollected,
      applesTotal: this.applesTotal,
      status: 'Mela raccolta! 🍎'
    });
    this.tweens.add({
      targets: apple,
      y: apple.y - 30,
      scale: 1.6,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: function () { apple.destroy(); }
    });
  };

  // -- Nemici: schiacciamento o danno -----------------------------------
  MainScene.prototype.handleEnemyContact = function (player, enemy) {
    if (this.gameState !== 'playing' || !enemy.active) return;
    var stomp = player.body.velocity.y >= 0 && player.body.bottom <= enemy.body.top + 12;
    if (stomp) {
      this.defeatEnemy(enemy);
      player.body.setVelocityY(STOMP_BOUNCE);
    } else {
      this.damagePlayer();
    }
  };

  MainScene.prototype.defeatEnemy = function (enemy) {
    enemy.body.enable = false;
    this.score += 20;
    updateHud({ status: 'Nemico sconfitto!' });
    this.tweens.add({
      targets: enemy,
      scaleY: enemy.scaleY * 0.15,
      scaleX: enemy.scaleX * 1.2,
      alpha: 0,
      duration: 200,
      onComplete: function () { enemy.destroy(); }
    });
  };

  // -- Spuntoni ---------------------------------------------------------
  MainScene.prototype.handleHazardContact = function () {
    if (this.gameState !== 'playing') return;
    this.damagePlayer();
  };

  // -- Danno, invulnerabilità e respawn -----------------------------------
  MainScene.prototype.damagePlayer = function () {
    if (this.gameState !== 'playing' || this.player.getData('invulnerable')) return;

    this.lives -= 1;
    if (this.lives <= 0) {
      updateHud({ lives: 0, status: 'Game Over' });
      this.setPlayerTexture(TEXTURE_KEYS.playerHurt);
      this.triggerGameOver();
      return;
    }

    updateHud({ lives: this.lives, status: 'Ops! Hai perso una vita' });
    this.player.setVelocity(0, 0);
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y);
    this.setInvulnerable();
  };

  MainScene.prototype.setInvulnerable = function () {
    var player = this.player;
    player.setData('invulnerable', true);
    this.tweens.add({
      targets: player,
      alpha: 0.25,
      duration: 100,
      yoyo: true,
      repeat: Math.floor(INVULN_MS / 200)
    });
    this.time.delayedCall(INVULN_MS, function () {
      player.setData('invulnerable', false);
      player.setAlpha(1);
    });
  };

  // -- Checkpoint ---------------------------------------------------------
  MainScene.prototype.handleCheckpoint = function (player, checkpoint) {
    if (checkpoint.getData('activated')) return;
    checkpoint.setData('activated', true);
    checkpoint.setTexture(TEXTURE_KEYS.checkpointOn);
    this.respawnPoint = { x: checkpoint.x, y: checkpoint.y + 25 };
    showCheckpointToast();
    updateHud({ status: 'Checkpoint raggiunto! 🚩' });
  };

  // -- Vittoria -------------------------------------------------------------
  MainScene.prototype.handleVictory = function () {
    if (this.gameState !== 'playing') return;
    this.gameState = 'victory';
    this.player.setVelocity(0, 0);
    this.player.body.moves = false;
    this.setPlayerTexture(TEXTURE_KEYS.playerVictory);
    updateHud({ status: 'Hai salvato la Buba! ❤️' });
    showVictory({ apples: this.applesCollected, applesTotal: this.applesTotal, lives: this.lives });
  };

  MainScene.prototype.triggerGameOver = function () {
    this.gameState = 'gameover';
    this.player.setVelocity(0, 0);
    this.player.body.moves = false;
    showGameOver(this.score);
  };

  // -- Texture del player: cambia solo se diversa da quella corrente e
  //    preserva sempre il verso (flip) corrente. -------------------------
  MainScene.prototype.setPlayerTexture = function (key) {
    if (this.currentPlayerTextureKey !== key) {
      this.currentPlayerTextureKey = key;
      this.player.setTexture(key);
    }
    this.player.setFlipX(this.facingLeft);
  };

  // -- Loop principale ------------------------------------------------------
  MainScene.prototype.update = function (time, delta) {
    if (restartRequested || Phaser.Input.Keyboard.JustDown(this.keyR)) {
      restartRequested = false;
      inputState.left = false;
      inputState.right = false;
      jumpQueuedAt = -Infinity;
      this.scene.restart();
      return;
    }

    this.updateMovingPlatform();
    this.updateEnemyPatrol();
    this.updateBackgroundScroll();

    if (this.gameState !== 'playing') return;

    var left = this.cursors.left.isDown || this.keyA.isDown || inputState.left;
    var right = this.cursors.right.isDown || this.keyD.isDown || inputState.right;

    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyW) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space)
    ) {
      queueJump();
    }

    this.updatePlayerMovement(left, right, delta);
    this.updateJump();
    this.updatePlayerAnimation(delta);

    if (this.player.y > FALL_DEATH_Y) {
      this.damagePlayer();
    }
  };

  MainScene.prototype.updatePlayerMovement = function (left, right, delta) {
    var targetVX = 0;
    if (left && !right) targetVX = -MOVE_SPEED;
    else if (right && !left) targetVX = MOVE_SPEED;

    var norm = Phaser.Math.Clamp(delta / 16.6, 0.4, 2.5);
    var factor = Math.min(1, (targetVX === 0 ? DECEL : ACCEL) * norm);
    var currentVX = this.player.body.velocity.x;
    var newVX = Phaser.Math.Linear(currentVX, targetVX, factor);
    if (Math.abs(newVX) < 4) newVX = 0;
    this.player.setVelocityX(newVX);

    // Tutti i PNG del riccio guardano a destra: flip nativo per sinistra.
    if (left && !right) this.facingLeft = true;
    else if (right && !left) this.facingLeft = false;
    this.player.setFlipX(this.facingLeft);
  };

  MainScene.prototype.updateJump = function () {
    var onGround = this.player.body.blocked.down || this.player.body.touching.down;
    var now = performance.now();
    if (onGround) this.lastGroundedAt = now;

    var canCoyote = now - this.lastGroundedAt <= COYOTE_MS;
    var bufferedJump = now - jumpQueuedAt <= JUMP_BUFFER_MS;

    if (canCoyote && bufferedJump) {
      this.player.setVelocityY(JUMP_VELOCITY);
      jumpQueuedAt = -Infinity;
      this.lastGroundedAt = -Infinity;
    }
  };

  // -- State machine texture del player: idle / walking / jumping / hurt --
  // (victory è gestito a parte in handleVictory, one-shot).
  MainScene.prototype.updatePlayerAnimation = function (delta) {
    var onGround = this.player.body.blocked.down || this.player.body.touching.down;
    var isHurt = this.player.getData('invulnerable');
    var isMoving = Math.abs(this.player.body.velocity.x) > 10;

    if (isHurt) {
      this.setPlayerTexture(TEXTURE_KEYS.playerHurt);
      this.walkAnimAccum = 0;
      return;
    }

    if (!onGround) {
      this.setPlayerTexture(TEXTURE_KEYS.playerJump);
      this.walkAnimAccum = 0;
      return;
    }

    if (isMoving) {
      this.walkAnimAccum += delta;
      if (this.walkAnimAccum >= WALK_FRAME_MS) {
        this.walkAnimAccum = 0;
        this.walkFrameToggle = !this.walkFrameToggle;
      }
      this.setPlayerTexture(this.walkFrameToggle ? TEXTURE_KEYS.playerWalk2 : TEXTURE_KEYS.playerWalk1);
      return;
    }

    this.walkAnimAccum = 0;
    this.setPlayerTexture(TEXTURE_KEYS.playerIdle);
  };

  MainScene.prototype.updateEnemyPatrol = function () {
    this.enemiesGroup.children.iterate(function (enemy) {
      if (!enemy || !enemy.active) return;
      var xMin = enemy.getData('xMin');
      var xMax = enemy.getData('xMax');
      var speed = enemy.getData('speed');
      if (enemy.x <= xMin) {
        enemy.setVelocityX(speed);
        enemy.setFlipX(false);
      } else if (enemy.x >= xMax) {
        enemy.setVelocityX(-speed);
        enemy.setFlipX(true);
      }
    });
  };

  MainScene.prototype.updateMovingPlatform = function () {
    var mp = this.movingPlatform;
    if (mp.x <= mp.getData('xMin')) {
      mp.body.setVelocityX(mp.getData('speed'));
    } else if (mp.x >= mp.getData('xMax')) {
      mp.body.setVelocityX(-mp.getData('speed'));
    }
  };

  // ---------------------------------------------------------------------
  // Avvio del gioco
  // ---------------------------------------------------------------------
  var config = {
    type: Phaser.AUTO,
    parent: CONTAINER_ID,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#8ed6f0',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: GRAVITY_Y },
        debug: false
      }
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    scene: [MainScene]
  };

  window.__giocoRiccioGame = new Phaser.Game(config);
})();
