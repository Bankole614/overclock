import { Game } from './game/game';
import { StorageManager } from './storage/storage';
import { SHOP_CATALOG } from './shop/shop';
import { refreshIcons, setLabel } from './icons';

const SHOP_ICONS: Record<string, string> = { paddle: 'circle-dot', trail: 'wind', goal: 'sparkles', arena: 'layout' };

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  refreshIcons();
  const game = new Game(canvas);

  // HUD Elements
  const hud = document.getElementById('hud')!;
  const hudRobotScore = document.getElementById('hud-robot-score')!;
  const hudPlayerScore = document.getElementById('hud-player-score')!;
  const hudRobotBadge = document.getElementById('hud-robot-badge')!;
  const hudPhaseBadge = document.getElementById('hud-phase-badge')!;
  const hudSeriesScore = document.getElementById('hud-series-score')!;
  const actionBar = document.getElementById('action-bar')!;

  // Modals & Screens
  const titleScreen = document.getElementById('title-screen')!;
  const resultScreen = document.getElementById('result-screen')!;
  const pauseScreen = document.getElementById('pause-screen')!;
  const confirmModal = document.getElementById('confirm-modal')!;
  const settingsModal = document.getElementById('settings-modal')!;
  const statsModal = document.getElementById('stats-modal')!;
  const bossModal = document.getElementById('boss-modal')!;
  const multiplayerModal = document.getElementById('multiplayer-modal')!;
  const shopModal = document.getElementById('shop-modal')!;

  // Title Buttons
  const btnPlayBoss = document.getElementById('btn-play-boss')!;
  const btnOpenMultiplayer = document.getElementById('btn-open-multiplayer')!;
  const btnShop = document.getElementById('btn-shop')!;
  const btnStats = document.getElementById('btn-stats')!;
  const btnSettings = document.getElementById('btn-settings')!;

  // In-Game Triggers
  const btnTriggerParry = document.getElementById('btn-trigger-parry')!;
  const btnTriggerOverdrive = document.getElementById('btn-trigger-overdrive')!;
  const btnPauseToggle = document.getElementById('btn-pause-toggle')!;

  // Pause Screen Buttons
  const btnResume = document.getElementById('btn-resume')!;
  const btnRestart = document.getElementById('btn-restart')!;
  const btnPauseMenu = document.getElementById('btn-pause-menu')!;

  // Confirm Dialog Elements
  const confirmTitle = document.getElementById('confirm-title')!;
  const confirmMessage = document.getElementById('confirm-message')!;
  const btnConfirmYes = document.getElementById('btn-confirm-yes')!;
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel')!;

  // Result Elements
  const btnNextBoss = document.getElementById('btn-next-boss')!;
  const btnRematch = document.getElementById('btn-rematch')!;
  const btnResultMenu = document.getElementById('btn-result-menu')!;
  const resultTitle = document.getElementById('result-title')!;
  const resPlayerScore = document.getElementById('res-player-score')!;
  const resRobotScore = document.getElementById('res-robot-score')!;
  const resSeriesSummary = document.getElementById('res-series-summary')!;
  const resultChipsEarned = document.getElementById('result-chips-earned')!;
  const insightText = document.getElementById('insight-text')!;
  const statMaxSpeed = document.getElementById('stat-max-speed')!;
  const statMaxClock = document.getElementById('stat-max-clock')!;
  const statParries = document.getElementById('stat-parries')!;
  const statTotalHits = document.getElementById('stat-total-hits')!;

  // Settings Elements
  const toggleSound = document.getElementById('setting-sound') as HTMLInputElement;
  const toggleMusic = document.getElementById('setting-music') as HTMLInputElement;
  const toggleLaser = document.getElementById('setting-laser') as HTMLInputElement;
  const toggleVibration = document.getElementById('setting-vibration') as HTMLInputElement;
  const toggleReduceMotion = document.getElementById('setting-reduce-motion') as HTMLInputElement;
  const toggleBatterySaver = document.getElementById('setting-battery-saver') as HTMLInputElement;
  const btnSettingsClose = document.getElementById('btn-settings-close')!;

  // Career Stats Elements
  const statCareerPlayed = document.getElementById('stat-career-played')!;
  const statCareerWinrate = document.getElementById('stat-career-winrate')!;
  const statCareerParries = document.getElementById('stat-career-parries')!;
  const statCareerStreak = document.getElementById('stat-career-streak')!;
  const statCareerFastest = document.getElementById('stat-career-fastest')!;
  const statCareerBosses = document.getElementById('stat-career-bosses')!;
  const btnStatsClose = document.getElementById('btn-stats-close')!;

  // Boss Modal Elements
  const bossCardsGrid = document.getElementById('boss-cards-grid')!;
  const btnBossClose = document.getElementById('btn-boss-close')!;
  const formatButtons = document.querySelectorAll<HTMLButtonElement>('.format-btn');
  let currentSeriesFormat: 'BO1' | 'BO3' | 'BO5' | 'FIRST_TO_3' = 'BO1';

  formatButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      formatButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentSeriesFormat = (btn.dataset.format as any) || 'BO1';
      game.setSeriesFormat(currentSeriesFormat);
    });
  });

  // Compact chip text so it never crowds the top of the rink
  const updateSeriesScoreUI = () => {
    if (game.series.targetGamesToWin > 1) {
      setLabel(hudSeriesScore, `${game.series.format} · ${game.series.playerGames}-${game.series.robotGames}`, 'trophy');
      hudSeriesScore.classList.remove('hidden');
    } else if (game.series.format === 'FIRST_TO_3') {
      setLabel(hudSeriesScore, 'BLITZ · 3', 'trophy');
      hudSeriesScore.classList.remove('hidden');
    } else {
      hudSeriesScore.classList.add('hidden');
    }
  };

  // Multiplayer Modal Elements
  const btnHostRoom = document.getElementById('btn-host-room')!;
  const hostCodeDisplay = document.getElementById('host-code-display')!;
  const roomCodeText = document.getElementById('room-code-text')!;
  const btnCopyCode = document.getElementById('btn-copy-code')!;
  const btnShareInvite = document.getElementById('btn-share-invite');
  const inputRoomCode = document.getElementById('input-room-code') as HTMLInputElement;
  const btnJoinRoom = document.getElementById('btn-join-room')!;
  const joinStatusMsg = document.getElementById('join-status-msg')!;
  const btnMultiplayerClose = document.getElementById('btn-multiplayer-close')!;

  // Shop Elements
  const shopChipsCount = document.getElementById('shop-chips-count')!;
  const shopItemsGrid = document.getElementById('shop-items-grid')!;
  const tabPaddle = document.getElementById('tab-paddle')!;
  const tabTrail = document.getElementById('tab-trail')!;
  const tabGoal = document.getElementById('tab-goal')!;
  const tabArena = document.getElementById('tab-arena');
  const btnShopClose = document.getElementById('btn-shop-close')!;
  let currentShopCategory: 'paddle' | 'trail' | 'goal' | 'arena' = 'paddle';

  // --- Settings Synchronization ---
  const currentSettings = StorageManager.loadSettings();
  let currentDifficulty = currentSettings.difficulty || 'NORMAL';
  toggleSound.checked = currentSettings.soundEnabled;
  toggleMusic.checked = currentSettings.musicEnabled;
  toggleLaser.checked = currentSettings.showPredictionLine;
  toggleVibration.checked = currentSettings.vibration;
  toggleReduceMotion.checked = currentSettings.reduceMotion;
  if (toggleBatterySaver) {
    toggleBatterySaver.checked = !!currentSettings.batterySaver;
  }

  const diffButtons = document.querySelectorAll<HTMLButtonElement>('.diff-btn');
  const syncDifficultyButtons = (diff: string) => {
    diffButtons.forEach((btn) => {
      if (btn.dataset.diff === diff) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  };
  syncDifficultyButtons(currentDifficulty);
  game.setDifficulty(currentDifficulty);

  diffButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDifficulty = (btn.dataset.diff as any) || 'NORMAL';
      syncDifficultyButtons(currentDifficulty);
      saveAndApplySettings();
      game.setDifficulty(currentDifficulty);
      renderBossLadderUI();
      updateCareerStatsUI();
    });
  });

  const saveAndApplySettings = () => {
    const updated = {
      soundEnabled: toggleSound.checked,
      musicEnabled: toggleMusic.checked,
      multiPuckOverload: false,
      showPredictionLine: toggleLaser.checked,
      vibration: toggleVibration.checked,
      reduceMotion: toggleReduceMotion.checked,
      batterySaver: toggleBatterySaver ? toggleBatterySaver.checked : false,
      difficulty: currentDifficulty,
    };
    StorageManager.saveSettings({ ...currentSettings, ...updated });
    game.sound.updateSettings(updated);
    game.renderer.settings = { ...game.renderer.settings, ...updated };
    game.renderer.setupDPR();
  };

  const settingToggles = [
    toggleSound,
    toggleMusic,
    toggleLaser,
    toggleVibration,
    toggleReduceMotion,
    toggleBatterySaver,
  ].filter(Boolean) as HTMLInputElement[];

  settingToggles.forEach((input) => {
    input.addEventListener('change', saveAndApplySettings);
  });

  // --- Career Stats ---
  const updateCareerStatsUI = () => {
    const stats = StorageManager.loadStats();
    statCareerPlayed.textContent = stats.matchesPlayed.toString();
    const wr = stats.matchesPlayed > 0 ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0;
    statCareerWinrate.textContent = `${wr}%`;
    statCareerParries.textContent = stats.totalParries.toString();
    statCareerStreak.textContent = stats.bestStreak.toString();
    statCareerFastest.textContent = stats.fastestWinSeconds ? `${stats.fastestWinSeconds}s` : '--';

    const defeatedCount = Object.values(game.bossManager.bosses).filter((b) => b.defeated).length;
    statCareerBosses.textContent = `${defeatedCount} / 5`;
  };

  // --- Boss Ladder UI ---
  const renderBossLadderUI = () => {
    bossCardsGrid.innerHTML = '';
    const bosses = Object.values(game.bossManager.bosses);

    bosses.forEach((boss) => {
      const card = document.createElement('div');
      card.className = `boss-card ${boss.unlocked ? '' : 'locked'} ${boss.defeated ? 'defeated' : ''}`;
      card.style.setProperty('--accent', boss.color);

      card.innerHTML = `
        <div class="boss-info">
          <div class="boss-name" style="color: ${boss.color};">
            ${boss.name}${boss.defeated ? ' <span class="boss-tag"><i data-lucide="check"></i> Defeated</span>' : ''}
          </div>
          <div class="boss-title">${boss.title}</div>
          <div class="boss-signature">Signature: ${boss.signature}</div>
        </div>
        ${boss.unlocked
          ? '<span class="boss-cta">Challenge <i data-lucide="chevron-right"></i></span>'
          : '<span class="boss-lock"><i data-lucide="lock"></i></span>'}
      `;

      if (boss.unlocked) {
        card.addEventListener('click', () => {
          bossModal.classList.add('hidden');
          game.mode = 'SOLO_BOSS';
          game.selectBoss(boss.id);
          game.startSeries(currentSeriesFormat);
          updateSeriesScoreUI();
        });
      }

      bossCardsGrid.appendChild(card);
    });
    refreshIcons();
  };

  // --- Shop UI ---
  const renderShopUI = () => {
    shopChipsCount.textContent = game.shopManager.state.chips.toString();
    shopItemsGrid.innerHTML = '';

    const items = SHOP_CATALOG.filter((i) => i.category === currentShopCategory);

    items.forEach((item) => {
      const isUnlocked = game.shopManager.state.unlockedItems.includes(item.id);
      const isEquipped =
        game.shopManager.state.equippedPaddle === item.id ||
        game.shopManager.state.equippedTrail === item.id ||
        game.shopManager.state.equippedGoal === item.id ||
        game.shopManager.state.equippedArena === item.id;

      const card = document.createElement('div');
      card.className = `shop-card ${isEquipped ? 'equipped' : ''}`;
      card.style.setProperty('--accent', item.color);

      let actionLabel = `<i data-lucide="cpu"></i> ${item.cost}`;
      let actionBtnColor = 'var(--gold)';
      if (isEquipped) {
        actionLabel = '<i data-lucide="check"></i> Equipped';
        actionBtnColor = 'var(--lime)';
      } else if (isUnlocked) {
        actionLabel = 'Equip';
        actionBtnColor = 'var(--ice)';
      }

      // Optional: add a `lucide` field to items in SHOP_CATALOG to give each its own icon.
      const itemIcon = (item as any).lucide || SHOP_ICONS[item.category] || 'sparkles';

      card.innerHTML = `
        <div class="shop-icon" style="color: ${item.color};"><i data-lucide="${itemIcon}"></i></div>
        <div class="shop-item-name" style="color: ${item.color};">${item.name}</div>
        <div class="shop-item-desc">${item.description}</div>
        <button class="shop-cost-btn" type="button" style="color: ${actionBtnColor}; border-color: ${actionBtnColor};">
          ${actionLabel}
        </button>
      `;

      card.addEventListener('click', () => {
        if (!isUnlocked) {
          if (game.shopManager.purchase(item.id)) {
            game.sound.playWallTick(700);
            game.refreshEquippedCosmetics();
            renderShopUI();
          } else {
            alert('Not enough Overclock Chips! Win matches & parries to earn more.');
          }
        } else {
          game.shopManager.equip(item.id);
          game.refreshEquippedCosmetics();
          renderShopUI();
        }
      });

      shopItemsGrid.appendChild(card);
    });
    refreshIcons();
  };

  const shopTabs = [tabPaddle, tabTrail, tabGoal, tabArena].filter(Boolean) as HTMLElement[];
  shopTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      shopTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab === tabPaddle) currentShopCategory = 'paddle';
      if (tab === tabTrail) currentShopCategory = 'trail';
      if (tab === tabGoal) currentShopCategory = 'goal';
      if (tab === tabArena) currentShopCategory = 'arena';
      renderShopUI();
    });
  });

  // --- Multiplayer WebRTC Logic ---
  btnHostRoom.addEventListener('click', () => {
    setLabel(btnHostRoom, 'Connecting to signaling...', 'loader-2', { spin: true });
    game.net.hostGame((roomCode) => {
      hostCodeDisplay.classList.remove('hidden');
      roomCodeText.textContent = roomCode;
      btnHostRoom.classList.add('hidden');
    });

    game.net.onConnected = () => {
      multiplayerModal.classList.add('hidden');
      game.mode = 'MULTIPLAYER_HOST';
      game.startMatch();
    };
  });

  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(roomCodeText.textContent || '');
    setLabel(btnCopyCode, 'Copied!', 'check');
    setTimeout(() => setLabel(btnCopyCode, 'Copy code', 'copy'), 1800);
  });

  if (btnShareInvite) {
    btnShareInvite.addEventListener('click', async () => {
      const code = roomCodeText.textContent?.trim() || '';
      if (!code) return;
      const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}`;

      if (navigator.share) {
        try {
          await navigator.share({
            title: 'OVERCLOCK // Kinetic Cyber Air Hockey',
            text: `Challenge me in OVERCLOCK! Room Code: ${code}`,
            url: inviteUrl,
          });
          return;
        } catch {
          // Fallback to clipboard
        }
      }

      try {
        await navigator.clipboard.writeText(inviteUrl);
        setLabel(btnShareInvite, 'Link copied!', 'check');
        setTimeout(() => setLabel(btnShareInvite, 'Share link', 'share-2'), 1800);
      } catch {
        prompt('Copy room invite link:', inviteUrl);
      }
    });
  }

  // Auto-detect invite code from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const joinParam = urlParams.get('join');
  if (joinParam) {
    inputRoomCode.value = joinParam.trim().toUpperCase();
    multiplayerModal.classList.remove('hidden');
    joinStatusMsg.textContent = `Room ${joinParam.toUpperCase()} detected! Click Join to play.`;
  }

  // Fullscreen Toggle
  const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');
  if (btnFullscreenToggle) {
    btnFullscreenToggle.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  btnJoinRoom.addEventListener('click', () => {
    const code = inputRoomCode.value.trim();
    if (!code) {
      joinStatusMsg.textContent = 'Please enter a room code.';
      return;
    }

    setLabel(btnJoinRoom, 'Connecting...', 'loader-2', { spin: true });
    btnJoinRoom.setAttribute('disabled', 'true');
    joinStatusMsg.textContent = 'Contacting host room...';
    game.net.joinGame(code);

    game.net.onConnected = () => {
      setLabel(btnJoinRoom, 'Connected!', 'check');
      joinStatusMsg.textContent = 'Connected! Starting match...';
      setTimeout(() => {
        multiplayerModal.classList.add('hidden');
        setLabel(btnJoinRoom, 'Join', 'log-in');
        btnJoinRoom.removeAttribute('disabled');
        game.mode = 'MULTIPLAYER_GUEST';
        game.startMatch();
      }, 500);
    };

    game.net.onError = (err) => {
      setLabel(btnJoinRoom, 'Join', 'log-in');
      btnJoinRoom.removeAttribute('disabled');
      joinStatusMsg.textContent = `❌ ${err}`;
    };
  });

  // --- State Changes ---
  game.onStateChange = (state) => {
    if (state === 'TITLE') {
      titleScreen.classList.remove('hidden');
      hud.classList.add('hidden');
      actionBar.classList.add('hidden');
      resultScreen.classList.add('hidden');
      pauseScreen.classList.add('hidden');
      confirmModal.classList.add('hidden');
    } else if (state === 'PLAYING' || state === 'COUNTDOWN' || state === 'POINT_SCORED') {
      titleScreen.classList.add('hidden');
      resultScreen.classList.add('hidden');
      pauseScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      actionBar.classList.remove('hidden');

      if (game.mode === 'SOLO_BOSS') {
        const currentBoss = game.bossManager.getCurrentBoss();
        setLabel(hudRobotBadge, currentBoss.name, 'cpu');
        hudPhaseBadge.textContent = game.robot.phase;
      } else {
        setLabel(hudRobotBadge, game.mode === 'MULTIPLAYER_HOST' ? 'OPPONENT [GUEST]' : 'OPPONENT [HOST]', 'globe');
        hudPhaseBadge.textContent = 'ONLINE 1v1';
      }
      updateSeriesScoreUI();
    } else if (state === 'PAUSED') {
      pauseScreen.classList.remove('hidden');
    } else if (state === 'MATCH_END') {
      hud.classList.add('hidden');
      actionBar.classList.add('hidden');
      pauseScreen.classList.add('hidden');
      confirmModal.classList.add('hidden');
    }
  };

  game.onScoreChange = (score) => {
    hudRobotScore.textContent = score.robot.toString();
    hudPlayerScore.textContent = score.player.toString();
    if (game.mode === 'SOLO_BOSS') {
      hudPhaseBadge.textContent = game.robot.phase;
    }
    updateSeriesScoreUI();
  };

  game.onMatchEnd = (insight, stats) => {
    const playerWon = stats.winner === 'player';
    resultTitle.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    resultTitle.className = `result-title ${playerWon ? 'victory' : 'defeat'}`;

    resPlayerScore.textContent = stats.playerScore.toString();
    resRobotScore.textContent = stats.robotScore.toString();
    insightText.textContent = insight;
    setLabel(resultChipsEarned, `+${stats.chipsEarned} overclock chips earned`, 'cpu');

    if (resSeriesSummary) {
      if (game.series.targetGamesToWin > 1) {
        setLabel(resSeriesSummary, `SERIES RESULT: ${game.series.playerGames} - ${game.series.robotGames} (${game.series.format})`, 'trophy');
        resSeriesSummary.classList.remove('hidden');
      } else if (game.series.format === 'FIRST_TO_3') {
        setLabel(resSeriesSummary, 'BLITZ MATCH (FIRST TO 3)', 'trophy');
        resSeriesSummary.classList.remove('hidden');
      } else {
        resSeriesSummary.classList.add('hidden');
      }
    }

    statMaxSpeed.textContent = stats.maxPuckSpeed.toLocaleString();
    statMaxClock.textContent = `${stats.maxClockSpeedGHz || 1.0} GHz`;
    statParries.textContent = stats.parriesCount.toString();
    statTotalHits.textContent = stats.totalHits.toString();

    // Next Boss button logic
    if (game.mode === 'SOLO_BOSS' && playerWon) {
      const nextBossId = game.bossManager.getNextBossId(game.bossManager.currentBossId);
      if (nextBossId) {
        const nextBoss = game.bossManager.bosses[nextBossId];
        if (nextBoss && nextBoss.unlocked) {
          setLabel(btnNextBoss, `Next level: ${nextBoss.name}`, 'chevron-right', { after: true });
          btnNextBoss.classList.remove('hidden');
        } else {
          btnNextBoss.classList.add('hidden');
        }
      } else {
        btnNextBoss.classList.add('hidden');
      }
    } else {
      btnNextBoss.classList.add('hidden');
    }

    resetRematchButton();
    resultScreen.classList.remove('hidden');
  };

  // --- Navigation Buttons ---
  btnPlayBoss.addEventListener('click', () => {
    game.bossManager.setDifficulty(currentDifficulty);
    renderBossLadderUI();
    bossModal.classList.remove('hidden');
  });

  btnBossClose.addEventListener('click', () => {
    bossModal.classList.add('hidden');
  });

  btnOpenMultiplayer.addEventListener('click', () => {
    multiplayerModal.classList.remove('hidden');
  });

  btnMultiplayerClose.addEventListener('click', () => {
    multiplayerModal.classList.add('hidden');
  });

  btnShop.addEventListener('click', () => {
    renderShopUI();
    shopModal.classList.remove('hidden');
  });

  btnShopClose.addEventListener('click', () => {
    shopModal.classList.add('hidden');
  });

  btnNextBoss.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    const started = game.startNextBoss();
    if (started) {
      updateSeriesScoreUI();
    } else {
      game.goToTitle();
    }
  });

  const resetRematchButton = () => {
    btnRematch.removeAttribute('disabled');
    btnRematch.classList.remove('pulse-glow');
    setLabel(btnRematch, 'Rematch', 'rotate-ccw');
  };

  game.net.onRematchRequested = () => {
    btnRematch.removeAttribute('disabled');
    btnRematch.classList.add('pulse-glow');
    setLabel(btnRematch, 'Opponent wants rematch! [Accept]', 'check');
  };

  game.net.onRematchAccepted = () => {
    resultScreen.classList.add('hidden');
    resetRematchButton();
    game.restartMatch();
  };

  btnRematch.addEventListener('click', () => {
    if (game.mode === 'MULTIPLAYER_HOST' || game.mode === 'MULTIPLAYER_GUEST') {
      if (btnRematch.textContent?.includes('Accept')) {
        game.net.sendRematchAccept();
        resultScreen.classList.add('hidden');
        resetRematchButton();
        game.restartMatch();
      } else {
        game.net.sendRematchOffer();
        setLabel(btnRematch, 'Rematch requested...', 'loader-2', { spin: true });
        btnRematch.setAttribute('disabled', 'true');
      }
    } else {
      resultScreen.classList.add('hidden');
      resetRematchButton();
      game.restartMatch();
    }
  });

  btnResultMenu.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    game.goToTitle();
  });

  let lastPauseToggleTime = 0;
  const handlePauseToggle = (e: Event) => {
    const now = performance.now();
    if (now - lastPauseToggleTime < 250) return;
    lastPauseToggleTime = now;
    e.preventDefault();
    e.stopPropagation();
    game.togglePause();
  };

  btnPauseToggle.addEventListener('pointerdown', handlePauseToggle);
  btnPauseToggle.addEventListener('click', handlePauseToggle);
  btnResume.addEventListener('click', () => game.togglePause());

  // --- Confirm dialog (Restart / Exit from pause) ---
  let pendingConfirm: (() => void) | null = null;

  const closeConfirm = () => {
    pendingConfirm = null;
    confirmModal.classList.add('hidden');
  };

  const askConfirm = (
    title: string,
    message: string,
    yesLabel: string,
    yesIcon: string,
    onYes: () => void
  ) => {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    setLabel(btnConfirmYes, yesLabel, yesIcon);
    pendingConfirm = onYes;
    confirmModal.classList.remove('hidden');
  };

  btnConfirmCancel.addEventListener('click', closeConfirm);
  btnConfirmYes.addEventListener('click', () => {
    const run = pendingConfirm;
    closeConfirm();
    run?.();
  });

  btnRestart.addEventListener('click', () => {
    askConfirm('Restart match?', 'Your current score in this match will be lost.', 'Restart', 'rotate-ccw', () => {
      pauseScreen.classList.add('hidden');
      game.restartMatch();
    });
  });

  btnPauseMenu.addEventListener('click', () => {
    const online = game.mode !== 'SOLO_BOSS';
    askConfirm(
      'Exit to menu?',
      online ? 'This ends the online match.' : 'This match will end and your progress in it will be lost.',
      'Exit',
      'log-out',
      () => {
        pauseScreen.classList.add('hidden');
        game.goToTitle();
      }
    );
  });

  btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  btnSettingsClose.addEventListener('click', () => settingsModal.classList.add('hidden'));

  btnStats.addEventListener('click', () => {
    updateCareerStatsUI();
    statsModal.classList.remove('hidden');
  });
  btnStatsClose.addEventListener('click', () => statsModal.classList.add('hidden'));

  // Quick Action Buttons
  btnTriggerParry.addEventListener('click', () => game.triggerPlayerParry());
  btnTriggerOverdrive.addEventListener('click', () => game.triggerPlayerOverdrive());

  const handleResize = () => {
    game.renderer.setupDPR();
    game.input.updateCanvasBounds();
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  if (typeof ResizeObserver !== 'undefined' && canvas) {
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(canvas);
  }

  // --- PWA Installation & Prompt Management ---
  let deferredInstallPrompt: any = null;
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  const btnSettingsInstall = document.getElementById('btn-settings-install');
  const settingRowInstall = document.getElementById('setting-row-install');
  const settingGroupDevice = document.getElementById('setting-group-device');
  const iosInstallModal = document.getElementById('ios-install-modal');
  const btnCloseIosInstall = document.getElementById('btn-close-ios-install');
  const btnIosInstallBack = document.getElementById('btn-ios-install-back');

  // Robust multi-platform detection for installed PWA / Home Screen status
  const isAppRunningStandalone = (): boolean => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  };

  const hideAllInstallPrompts = () => {
    if (btnInstallPwa) btnInstallPwa.classList.add('hidden');
    if (settingRowInstall) settingRowInstall.classList.add('hidden');
    if (settingGroupDevice) settingGroupDevice.classList.add('hidden');
  };

  const showInstallPrompts = () => {
    if (!isAppRunningStandalone() && localStorage.getItem('overclock_pwa_installed') !== 'true') {
      if (btnInstallPwa) btnInstallPwa.classList.remove('hidden');
      if (settingRowInstall) settingRowInstall.classList.remove('hidden');
      if (settingGroupDevice) settingGroupDevice.classList.remove('hidden');
    }
  };

  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  // Immediately hide if running as standalone app or previously recorded as installed
  if (isAppRunningStandalone()) {
    localStorage.setItem('overclock_pwa_installed', 'true');
    hideAllInstallPrompts();
  } else if (localStorage.getItem('overclock_pwa_installed') === 'true') {
    hideAllInstallPrompts();
  } else if (isIos) {
    showInstallPrompts();
  }

  // Modern browser API check: check if the app is already installed on device
  if ('getInstalledRelatedApps' in navigator) {
    (navigator as any).getInstalledRelatedApps().then((relatedApps: any[]) => {
      if (relatedApps && relatedApps.length > 0) {
        localStorage.setItem('overclock_pwa_installed', 'true');
        hideAllInstallPrompts();
      }
    }).catch(() => {});
  }

  // Listen for display-mode changes (e.g. user opens app or moves to standalone window)
  ['(display-mode: standalone)', '(display-mode: fullscreen)', '(display-mode: minimal-ui)'].forEach((query) => {
    try {
      window.matchMedia(query).addEventListener('change', (e) => {
        if (e.matches) {
          localStorage.setItem('overclock_pwa_installed', 'true');
          hideAllInstallPrompts();
        }
      });
    } catch {}
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!isAppRunningStandalone() && localStorage.getItem('overclock_pwa_installed') !== 'true') {
      showInstallPrompts();
    }
  });

  const triggerInstallFlow = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choiceResult = await deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          localStorage.setItem('overclock_pwa_installed', 'true');
          hideAllInstallPrompts();
        }
        deferredInstallPrompt = null;
      } catch {
        if (iosInstallModal) iosInstallModal.classList.remove('hidden');
      }
    } else {
      // Show the spacious, modern step-by-step visual install sheet
      if (iosInstallModal) iosInstallModal.classList.remove('hidden');
    }
  };

  if (btnInstallPwa) btnInstallPwa.addEventListener('click', triggerInstallFlow);
  if (btnSettingsInstall) btnSettingsInstall.addEventListener('click', triggerInstallFlow);
  if (btnCloseIosInstall && iosInstallModal) {
    btnCloseIosInstall.addEventListener('click', () => iosInstallModal.classList.add('hidden'));
  }
  if (btnIosInstallBack && iosInstallModal) {
    btnIosInstallBack.addEventListener('click', () => iosInstallModal.classList.add('hidden'));
  }

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    localStorage.setItem('overclock_pwa_installed', 'true');
    hideAllInstallPrompts();
  });

  // Background battery & thermal protection: Pause audio & simulation when tab is in background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      game.sound.suspend();
      if (game.mode === 'SOLO_BOSS' && (game.state === 'PLAYING' || game.state === 'COUNTDOWN')) {
        game.togglePause();
      }
    } else {
      game.sound.resume();
    }
  });

  // Register PWA Service Worker for offline play & automatic updates
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Automatically check if a new version was pushed
        registration.update().catch(() => {});
      })
      .catch((err) => {
        console.log('SW registration skipped:', err);
      });
  }

  // Audio init on first user touch/click per browser autoplay policy
  const triggerAudioInit = () => {
    game.sound.init();
    game.sound.resume();
  };
  window.addEventListener('pointerdown', triggerAudioInit, { once: true });

  game.init();
});