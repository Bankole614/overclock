import { Game } from './game/game';
import { StorageManager } from './storage/storage';

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  const game = new Game(canvas);

  // DOM Elements
  const hud = document.getElementById('hud')!;
  const hudRobotScore = document.getElementById('hud-robot-score')!;
  const hudPlayerScore = document.getElementById('hud-player-score')!;
  const hudRobotBadge = document.getElementById('hud-robot-badge')!;
  const hudPhaseBadge = document.getElementById('hud-phase-badge')!;
  const actionBar = document.getElementById('action-bar')!;

  const titleScreen = document.getElementById('title-screen')!;
  const resultScreen = document.getElementById('result-screen')!;
  const pauseScreen = document.getElementById('pause-screen')!;
  const settingsModal = document.getElementById('settings-modal')!;
  const statsModal = document.getElementById('stats-modal')!;

  const btnPlay = document.getElementById('btn-play')!;
  const btnRematch = document.getElementById('btn-rematch')!;
  const btnResultMenu = document.getElementById('btn-result-menu')!;
  const btnPauseToggle = document.getElementById('btn-pause-toggle')!;
  const btnResume = document.getElementById('btn-resume')!;
  const btnRestart = document.getElementById('btn-restart')!;
  const btnPauseMenu = document.getElementById('btn-pause-menu')!;
  const btnSettings = document.getElementById('btn-settings')!;
  const btnSettingsClose = document.getElementById('btn-settings-close')!;
  const btnStats = document.getElementById('btn-stats')!;
  const btnStatsClose = document.getElementById('btn-stats-close')!;

  const btnTriggerParry = document.getElementById('btn-trigger-parry')!;
  const btnTriggerOverdrive = document.getElementById('btn-trigger-overdrive')!;

  // Result Elements
  const resultTitle = document.getElementById('result-title')!;
  const resPlayerScore = document.getElementById('res-player-score')!;
  const resRobotScore = document.getElementById('res-robot-score')!;
  const insightText = document.getElementById('insight-text')!;
  const statMaxSpeed = document.getElementById('stat-max-speed')!;
  const statMaxClock = document.getElementById('stat-max-clock')!;
  const statParries = document.getElementById('stat-parries')!;
  const statTotalHits = document.getElementById('stat-total-hits')!;

  // Settings Toggles
  const toggleSound = document.getElementById('setting-sound') as HTMLInputElement;
  const toggleMusic = document.getElementById('setting-music') as HTMLInputElement;
  const toggleBumpers = document.getElementById('setting-bumpers') as HTMLInputElement;
  const toggleLaser = document.getElementById('setting-laser') as HTMLInputElement;
  const toggleVibration = document.getElementById('setting-vibration') as HTMLInputElement;
  const toggleReduceMotion = document.getElementById('setting-reduce-motion') as HTMLInputElement;

  // Career Stats Elements
  const statCareerPlayed = document.getElementById('stat-career-played')!;
  const statCareerWinrate = document.getElementById('stat-career-winrate')!;
  const statCareerParries = document.getElementById('stat-career-parries')!;
  const statCareerStreak = document.getElementById('stat-career-streak')!;
  const statCareerFastest = document.getElementById('stat-career-fastest')!;
  const statCareerRobot = document.getElementById('stat-career-robot')!;

  // Sync settings
  const currentSettings = StorageManager.loadSettings();
  toggleSound.checked = currentSettings.soundEnabled;
  toggleMusic.checked = currentSettings.musicEnabled;
  toggleBumpers.checked = currentSettings.arenaBumpers;
  toggleLaser.checked = currentSettings.showPredictionLine;
  toggleVibration.checked = currentSettings.vibration;
  toggleReduceMotion.checked = currentSettings.reduceMotion;

  const saveAndApplySettings = () => {
    const updated = {
      soundEnabled: toggleSound.checked,
      musicEnabled: toggleMusic.checked,
      arenaBumpers: toggleBumpers.checked,
      showPredictionLine: toggleLaser.checked,
      vibration: toggleVibration.checked,
      reduceMotion: toggleReduceMotion.checked,
    };
    StorageManager.saveSettings({ ...currentSettings, ...updated });
    game.sound.updateSettings(updated);
    game.renderer.settings = { ...game.renderer.settings, ...updated };
    game.bumpers.forEach((b) => (b.active = updated.arenaBumpers));
  };

  [toggleSound, toggleMusic, toggleBumpers, toggleLaser, toggleVibration, toggleReduceMotion].forEach((input) => {
    input.addEventListener('change', saveAndApplySettings);
  });

  const updateCareerStatsUI = () => {
    const stats = StorageManager.loadStats();
    statCareerPlayed.textContent = stats.matchesPlayed.toString();
    const wr = stats.matchesPlayed > 0 ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) : 0;
    statCareerWinrate.textContent = `${wr}%`;
    statCareerParries.textContent = stats.totalParries.toString();
    statCareerStreak.textContent = stats.bestStreak.toString();
    statCareerFastest.textContent = stats.fastestWinSeconds ? `${stats.fastestWinSeconds}s` : '--';
    statCareerRobot.textContent = game.director.getRobotModelName();
  };

  // State Change Listeners
  game.onStateChange = (state) => {
    if (state === 'TITLE') {
      titleScreen.classList.remove('hidden');
      hud.classList.add('hidden');
      actionBar.classList.add('hidden');
      resultScreen.classList.add('hidden');
      pauseScreen.classList.add('hidden');
    } else if (state === 'PLAYING' || state === 'COUNTDOWN' || state === 'POINT_SCORED') {
      titleScreen.classList.add('hidden');
      resultScreen.classList.add('hidden');
      pauseScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      actionBar.classList.remove('hidden');
      hudRobotBadge.textContent = game.director.getRobotModelName();
      hudPhaseBadge.textContent = game.robot.phase;
    } else if (state === 'PAUSED') {
      pauseScreen.classList.remove('hidden');
    } else if (state === 'MATCH_END') {
      hud.classList.add('hidden');
      actionBar.classList.add('hidden');
      pauseScreen.classList.add('hidden');
    }
  };

  game.onScoreChange = (score) => {
    hudRobotScore.textContent = score.robot.toString();
    hudPlayerScore.textContent = score.player.toString();
    hudPhaseBadge.textContent = game.robot.phase;
  };

  game.onMatchEnd = (insight, stats) => {
    const playerWon = stats.winner === 'player';
    resultTitle.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    resultTitle.className = `result-title ${playerWon ? 'victory' : 'defeat'}`;

    resPlayerScore.textContent = stats.playerScore.toString();
    resRobotScore.textContent = stats.robotScore.toString();
    insightText.textContent = insight;

    statMaxSpeed.textContent = stats.maxPuckSpeed.toLocaleString();
    statMaxClock.textContent = `${stats.maxClockSpeedGHz || 1.0} GHz`;
    statParries.textContent = stats.parriesCount.toString();
    statTotalHits.textContent = stats.totalHits.toString();

    resultScreen.classList.remove('hidden');
  };

  // Button Listeners
  btnPlay.addEventListener('click', () => {
    game.startMatch();
  });

  btnRematch.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    game.restartMatch();
  });

  btnResultMenu.addEventListener('click', () => {
    resultScreen.classList.add('hidden');
    game.state = 'TITLE';
    if (game.onStateChange) game.onStateChange('TITLE');
  });

  btnPauseToggle.addEventListener('click', () => {
    game.togglePause();
  });

  btnResume.addEventListener('click', () => {
    game.togglePause();
  });

  btnRestart.addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    game.restartMatch();
  });

  btnPauseMenu.addEventListener('click', () => {
    pauseScreen.classList.add('hidden');
    game.state = 'TITLE';
    if (game.onStateChange) game.onStateChange('TITLE');
  });

  btnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  btnSettingsClose.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  btnStats.addEventListener('click', () => {
    updateCareerStatsUI();
    statsModal.classList.remove('hidden');
  });

  btnStatsClose.addEventListener('click', () => {
    statsModal.classList.add('hidden');
  });

  // Action buttons
  btnTriggerParry.addEventListener('click', () => {
    game.triggerPlayerParry();
  });

  btnTriggerOverdrive.addEventListener('click', () => {
    game.triggerPlayerOverdrive();
  });

  const handleResize = () => {
    game.renderer.setupDPR();
    game.input.updateCanvasBounds();
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);

  game.init();
});
