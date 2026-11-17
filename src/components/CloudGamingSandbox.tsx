import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VirtualGamepadState } from '../protocol/gamepadProtocol';

interface CloudGamingSandboxProps {
  gamepadState: VirtualGamepadState;
  onRumble: (intensity: number, durationMs: number) => void;
  autostart?: boolean;
}

type ArenaPhase = 'title' | 'playing' | 'paused' | 'gameover';

interface EnemyBot {
  id: number;
  archetype: 'swarmer' | 'strider' | 'juggernaut';
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  windupTimer: number;
  cooldownTimer: number;
  hitFlash: number;
  koTimer: number;
}

interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  radius: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export const CloudGamingSandbox: React.FC<CloudGamingSandboxProps> = ({
  gamepadState,
  onRumble,
  autostart = false,
}) => {
  const [phase, setPhase] = useState<ArenaPhase>(() => (autostart ? 'playing' : 'title'));
  const [hudStats, setHudStats] = useState({
    hp: 100,
    score: 0,
    bestScore: 0,
    wave: 1,
    overdrive: 100,
    enemiesDefeated: 0,
    outcome: 'defeat' as 'victory' | 'defeat',
  });
  const [muted, setMuted] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gamepadRef = useRef<VirtualGamepadState>(gamepadState);
  const phaseRef = useRef<ArenaPhase>(phase);
  const mutedRef = useRef<boolean>(muted);
  const onRumbleRef = useRef(onRumble);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    gamepadRef.current = gamepadState;
  }, [gamepadState]);

  useEffect(() => {
    phaseRef.current = phase;
    if (typeof document !== 'undefined') {
      document.body.dataset.state = phase;
    }
  }, [phase]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onRumbleRef.current = onRumble;
  }, [onRumble]);

  const playSynthTone = useCallback((freq: number, durationSec: number, type: OscillatorType = 'triangle') => {
    if (mutedRef.current || typeof window === 'undefined') return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationSec);
    } catch {
      // Ignore audio restrictions
    }
  }, []);

  const resetSimRef = useRef<(() => void) | null>(null);

  const startOrRestartGame = useCallback(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    resetSimRef.current?.();
    phaseRef.current = 'playing';
    if (typeof document !== 'undefined') {
      document.body.dataset.state = 'playing';
    }
    setPhase('playing');
  }, []);

  // Main 60Hz Canvas Simulation Loop (mounted once, zero React re-render teardown)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        phaseRef.current === 'playing' &&
        (e.code === 'Space' ||
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight')
      ) {
        e.preventDefault();
      }
      keys.add(e.code);
      if (phaseRef.current === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startOrRestartGame();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (phaseRef.current === 'playing') {
          setPhase('paused');
        } else if (phaseRef.current === 'paused') {
          setPhase('playing');
        }
      } else if (e.code === 'KeyM') {
        setMuted((m) => !m);
      } else if (e.code === 'KeyR' && phaseRef.current !== 'title') {
        startOrRestartGame();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onBlur = () => keys.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // Pre-allocated object pools (zero GC inside RAF)
    const projectiles: Projectile[] = Array.from({ length: 60 }, () => ({
      active: false,
      fromPlayer: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      damage: 18,
      color: '#34D399',
      radius: 4,
    }));

    const particles: Particle[] = Array.from({ length: 80 }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.4,
      color: '#FBBF24',
      size: 3,
    }));

    let enemies: EnemyBot[] = [];
    let nextEnemyId = 1;

    const player = {
      x: 420,
      y: 230,
      vx: 0,
      vy: 0,
      aimX: 1,
      aimY: 0,
      hp: 100,
      score: 0,
      bestScore: 0,
      wave: 1,
      overdrive: 100,
      fireCooldown: 0,
      dashCooldown: 0,
      hitFlash: 0,
      enemiesDefeated: 0,
    };

    let hitstopTimer = 0;
    let cameraShake = 0;
    let prevStartButton = false;

    const spawnParticles = (x: number, y: number, color: string, count: number) => {
      let spawned = 0;
      for (let i = 0; i < particles.length && spawned < count; i++) {
        if (!particles[i].active) {
          const angle = (Math.PI * 2 * spawned) / count + Math.random() * 0.5;
          const speed = 45 + Math.random() * 120;
          particles[i].active = true;
          particles[i].x = x;
          particles[i].y = y;
          particles[i].vx = Math.cos(angle) * speed;
          particles[i].vy = Math.sin(angle) * speed;
          particles[i].life = 0.25 + Math.random() * 0.25;
          particles[i].maxLife = particles[i].life;
          particles[i].color = color;
          particles[i].size = 2.5 + Math.random() * 2.5;
          spawned++;
        }
      }
    };

    const spawnFire = (
      fromPlayer: boolean,
      x: number,
      y: number,
      dirX: number,
      dirY: number,
      speed: number,
      damage: number,
      color: string
    ) => {
      for (let i = 0; i < projectiles.length; i++) {
        if (!projectiles[i].active) {
          projectiles[i].active = true;
          projectiles[i].fromPlayer = fromPlayer;
          projectiles[i].x = x;
          projectiles[i].y = y;
          projectiles[i].vx = dirX * speed;
          projectiles[i].vy = dirY * speed;
          projectiles[i].damage = damage;
          projectiles[i].color = color;
          projectiles[i].radius = fromPlayer ? 4.5 : 5.5;
          break;
        }
      }
    };

    const spawnWaveEnemies = (waveNum: number) => {
      enemies = [];
      const count = Math.min(6, 2 + waveNum);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const dist = 265 + (i % 2) * 55;
        const cx = 420 + Math.cos(angle) * dist;
        const cy = 230 + Math.sin(angle) * Math.min(185, dist * 0.75);
        const archetype: EnemyBot['archetype'] =
          i % 3 === 0 ? 'swarmer' : i % 3 === 1 ? 'strider' : 'juggernaut';
        const maxHp = archetype === 'juggernaut' ? 65 : archetype === 'strider' ? 38 : 26;
        enemies.push({
          id: nextEnemyId++,
          archetype,
          x: Math.max(36, Math.min(804, cx)),
          y: Math.max(36, Math.min(424, cy)),
          vx: 0,
          vy: 0,
          hp: maxHp,
          maxHp,
          radius: archetype === 'juggernaut' ? 18 : 13,
          windupTimer: 0,
          cooldownTimer: 2.2 + i * 0.5,
          hitFlash: 0,
          koTimer: 0,
        });
      }
    };

    let spawnShieldTimer = 4.5;

    const resetSim = () => {
      player.x = 420;
      player.y = 230;
      player.vx = 0;
      player.vy = 0;
      player.aimX = 1;
      player.aimY = 0;
      player.hp = 100;
      player.score = 0;
      player.wave = 1;
      player.overdrive = 100;
      player.enemiesDefeated = 0;
      spawnShieldTimer = 4.5;
      for (const p of projectiles) p.active = false;
      for (const pt of particles) pt.active = false;
      spawnWaveEnemies(1);
      setHudStats((prev) => ({
        ...prev,
        hp: 100,
        score: 0,
        wave: 1,
        overdrive: 100,
        enemiesDefeated: 0,
      }));
    };

    resetSimRef.current = resetSim;
    resetSim();

    let lastTime = performance.now();
    let hudSyncTimer = 0;
    let rafId = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      const gp = gamepadRef.current;
      const startPressed = (gp.buttons[9] ?? 0) > 0.5 || (gp.buttons[0] ?? 0) > 0.5;
      if (phaseRef.current === 'title' && startPressed && !prevStartButton) {
        startOrRestartGame();
      }
      prevStartButton = startPressed;

      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }
      cameraShake = Math.max(0, cameraShake - dt * 2.5);

      const W = canvas.width;
      const H = canvas.height;

      if (phaseRef.current === 'playing' && hitstopTimer <= 0) {
        spawnShieldTimer = Math.max(0, spawnShieldTimer - dt);

        // Read movement from Virtual Gamepad Left Stick + D-Pad + Keyboard WASD/Arrows
        let moveX = gp.axes[0];
        let moveY = gp.axes[1];

        if ((gp.buttons[14] ?? 0) > 0.5 || keys.has('KeyA') || keys.has('ArrowLeft')) moveX -= 1;
        if ((gp.buttons[15] ?? 0) > 0.5 || keys.has('KeyD') || keys.has('ArrowRight')) moveX += 1;
        if ((gp.buttons[12] ?? 0) > 0.5 || keys.has('KeyW') || keys.has('ArrowUp')) moveY -= 1;
        if ((gp.buttons[13] ?? 0) > 0.5 || keys.has('KeyS') || keys.has('ArrowDown')) moveY += 1;

        const moveLen = Math.hypot(moveX, moveY);
        if (moveLen > 1) {
          moveX /= moveLen;
          moveY /= moveLen;
        }

        // Aim with Right Stick or follow movement direction
        let aimX = gp.axes[2];
        let aimY = gp.axes[3];
        if (Math.hypot(aimX, aimY) > 0.2) {
          const al = Math.hypot(aimX, aimY);
          player.aimX = aimX / al;
          player.aimY = aimY / al;
        } else if (moveLen > 0.15) {
          player.aimX = moveX;
          player.aimY = moveY;
        }

        const dashTriggered =
          (gp.buttons[1] ?? 0) > 0.5 ||
          (gp.buttons[4] ?? 0) > 0.5 ||
          keys.has('ShiftLeft');

        if (dashTriggered && player.dashCooldown <= 0 && player.overdrive >= 25) {
          player.dashCooldown = 0.65;
          player.overdrive = Math.max(0, player.overdrive - 25);
          player.x += player.aimX * 68;
          player.y += player.aimY * 68;
          spawnParticles(player.x, player.y, '#38BDF8', 12);
          playSynthTone(520, 0.09, 'sine');
        }

        player.dashCooldown = Math.max(0, player.dashCooldown - dt);
        player.fireCooldown = Math.max(0, player.fireCooldown - dt);
        player.overdrive = Math.min(100, player.overdrive + dt * 12);
        player.hitFlash = Math.max(0, player.hitFlash - dt);

        const speed = 215;
        player.x = Math.max(24, Math.min(W - 24, player.x + moveX * speed * dt));
        player.y = Math.max(24, Math.min(H - 24, player.y + moveY * speed * dt));

        // Fire primary weapon via A/Cross (B0), RT/R2 (B7), RB (B5), or Space
        const firing =
          (gp.buttons[0] ?? 0) > 0.5 ||
          (gp.buttons[7] ?? 0) > 0.25 ||
          (gp.buttons[5] ?? 0) > 0.5 ||
          keys.has('Space');

        if (firing && player.fireCooldown <= 0) {
          player.fireCooldown = 0.14;
          spawnFire(
            true,
            player.x + player.aimX * 16,
            player.y + player.aimY * 16,
            player.aimX,
            player.aimY,
            460,
            20,
            '#34D399'
          );
          playSynthTone(680 + Math.random() * 60, 0.06, 'triangle');
        }

        // Overdrive Nova Burst via X/Square (B2) or Y/Triangle (B3)
        const novaTriggered = (gp.buttons[2] ?? 0) > 0.5 || (gp.buttons[3] ?? 0) > 0.5;
        if (novaTriggered && player.overdrive >= 60 && player.fireCooldown <= 0) {
          player.overdrive -= 60;
          player.fireCooldown = 0.3;
          for (let k = 0; k < 10; k++) {
            const ang = (Math.PI * 2 * k) / 10;
            spawnFire(
              true,
              player.x,
              player.y,
              Math.cos(ang),
              Math.sin(ang),
              390,
              26,
              '#FBBF24'
            );
          }
          onRumbleRef.current(0.85, 140);
          playSynthTone(310, 0.18, 'sawtooth');
        }

        // Update Enemies (3 distinct movement policies)
        for (const bot of enemies) {
          if (bot.koTimer > 0) {
            bot.koTimer -= dt;
            continue;
          }
          bot.hitFlash = Math.max(0, bot.hitFlash - dt);
          const dx = player.x - bot.x;
          const dy = player.y - bot.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const nx = dx / dist;
          const ny = dy / dist;

          if (bot.archetype === 'swarmer') {
            // Fast flanker + melee windup telegraph
            bot.x += (nx * 68 - ny * 28) * dt;
            bot.y += (ny * 68 + nx * 28) * dt;
            if (dist < 32 && spawnShieldTimer <= 0) {
              bot.windupTimer += dt;
              if (bot.windupTimer >= 0.75) {
                bot.windupTimer = 0;
                player.hp = Math.max(0, player.hp - 8);
                player.hitFlash = 0.15;
                cameraShake = 0.35;
                onRumbleRef.current(0.9, 160);
              }
            } else {
              bot.windupTimer = Math.max(0, bot.windupTimer - dt);
            }
          } else if (bot.archetype === 'strider') {
            // Ranged kiter: maintains ~190px range and fires telegraphed laser bolts
            const desiredDist = 195;
            const radialFactor = dist < desiredDist - 25 ? -0.8 : dist > desiredDist + 25 ? 0.8 : 0;
            bot.x = Math.max(24, Math.min(W - 24, bot.x + (nx * radialFactor - ny * 0.6) * 72 * dt));
            bot.y = Math.max(24, Math.min(H - 24, bot.y + (ny * radialFactor + nx * 0.6) * 72 * dt));

            bot.cooldownTimer -= dt;
            if (bot.cooldownTimer <= 0.55 && bot.cooldownTimer > 0) {
              bot.windupTimer = 0.55 - bot.cooldownTimer;
            }
            if (bot.cooldownTimer <= 0) {
              bot.cooldownTimer = 3.2;
              bot.windupTimer = 0;
              if (spawnShieldTimer <= 0) {
                spawnFire(false, bot.x, bot.y, nx, ny, 210, 10, '#F43F5E');
              }
            }
          } else {
            // Juggernaut: steady armored advance + heavy shockwave telegraph
            bot.x += nx * 42 * dt;
            bot.y += ny * 42 * dt;
            bot.cooldownTimer -= dt;
            if (bot.cooldownTimer <= 0) {
              bot.cooldownTimer = 3.6;
              if (spawnShieldTimer <= 0) {
                spawnFire(false, bot.x, bot.y, nx, ny, 175, 12, '#FB923C');
              }
            }
          }
        }

        enemies = enemies.filter((e) => e.koTimer <= 0 || e.koTimer > 0.02);

        // Update Projectiles
        for (const p of projectiles) {
          if (!p.active) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
            p.active = false;
            continue;
          }

          if (p.fromPlayer) {
            for (const bot of enemies) {
              if (bot.hp <= 0) continue;
              if (Math.hypot(p.x - bot.x, p.y - bot.y) <= bot.radius + p.radius) {
                p.active = false;
                bot.hp -= p.damage;
                bot.hitFlash = 0.08;
                spawnParticles(p.x, p.y, '#34D399', 5);
                if (bot.hp <= 0) {
                  bot.koTimer = 0.01;
                  hitstopTimer = 0.035;
                  cameraShake = 0.25;
                  player.score += bot.archetype === 'juggernaut' ? 250 : 120;
                  player.bestScore = Math.max(player.bestScore, player.score);
                  player.enemiesDefeated += 1;
                  spawnParticles(bot.x, bot.y, '#FBBF24', 16);
                  playSynthTone(220, 0.14, 'sawtooth');
                }
                break;
              }
            }
          } else if (Math.hypot(p.x - player.x, p.y - player.y) <= 15 + p.radius) {
            p.active = false;
            player.hp = Math.max(0, player.hp - p.damage);
            player.hitFlash = 0.14;
            cameraShake = 0.35;
            spawnParticles(player.x, player.y, '#F43F5E', 10);
            onRumbleRef.current(0.8, 150);
          }
        }

        // Remove defeated enemies
        enemies = enemies.filter((e) => e.hp > 0);

        if (enemies.length === 0) {
          if (player.wave >= 3) {
            setHudStats({
              hp: Math.round(player.hp),
              score: player.score,
              bestScore: player.bestScore,
              wave: player.wave,
              overdrive: Math.round(player.overdrive),
              enemiesDefeated: player.enemiesDefeated,
              outcome: 'victory',
            });
            setPhase('gameover');
          } else {
            player.wave += 1;
            player.hp = Math.min(100, player.hp + 20);
            spawnWaveEnemies(player.wave);
          }
        }

        if (player.hp <= 0) {
          setHudStats({
            hp: 0,
            score: player.score,
            bestScore: player.bestScore,
            wave: player.wave,
            overdrive: Math.round(player.overdrive),
            enemiesDefeated: player.enemiesDefeated,
            outcome: 'defeat',
          });
          setPhase('gameover');
        }
      }

      // Update Particles
      for (const pt of particles) {
        if (!pt.active) continue;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) pt.active = false;
      }

      // Throttle React HUD sync to ~5Hz
      hudSyncTimer += dt;
      if (hudSyncTimer >= 0.18 && phaseRef.current === 'playing') {
        hudSyncTimer = 0;
        setHudStats((prev) => ({
          ...prev,
          hp: Math.round(player.hp),
          score: player.score,
          bestScore: player.bestScore,
          wave: player.wave,
          overdrive: Math.round(player.overdrive),
          enemiesDefeated: player.enemiesDefeated,
        }));
      }

      // Render Arena Canvas
      ctx.save();
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, W, H);

      if (cameraShake > 0) {
        const mag = cameraShake * cameraShake * 8;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }

      // Tactical Grid
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 48) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += 48) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Draw Enemies
      for (const bot of enemies) {
        ctx.save();
        ctx.translate(bot.x, bot.y);

        // Telegraph ring
        if (bot.windupTimer > 0) {
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, bot.radius + 8 + bot.windupTimer * 12, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle =
          bot.hitFlash > 0
            ? '#FFFFFF'
            : bot.archetype === 'juggernaut'
              ? '#F97316'
              : bot.archetype === 'strider'
                ? '#EC4899'
                : '#EF4444';

        ctx.beginPath();
        if (bot.archetype === 'juggernaut') {
          ctx.rect(-bot.radius, -bot.radius, bot.radius * 2, bot.radius * 2);
        } else {
          ctx.arc(0, 0, bot.radius, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }

      // Draw Player Mecha Bot
      ctx.save();
      ctx.translate(player.x, player.y);

      // Aim sight line
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(player.aimX * 48, player.aimY * 48);
      ctx.stroke();

      ctx.fillStyle = player.hitFlash > 0 ? '#FFFFFF' : '#10B981';
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#A7F3D0';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();

      // Draw Projectiles
      for (const p of projectiles) {
        if (!p.active) continue;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Particles
      for (const pt of particles) {
        if (!pt.active) continue;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [playSynthTone, startOrRestartGame]);

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
      {/* Isolated Canvas Viewport */}
      <canvas
        ref={canvasRef}
        width={840}
        height={460}
        data-testid="cloud-sandbox-canvas"
        className="w-full h-[380px] sm:h-[440px] block object-cover"
      />

      {/* World-Matched Perimeter HUD (pointer-events-none wrapper) */}
      {phase === 'playing' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Vitality & Overdrive Cluster */}
            <div className="flex items-center gap-5 bg-slate-950/85 border border-slate-800 rounded-xl px-3.5 py-2">
              <div>
                <div className="text-[10px] font-mono text-slate-400">MECHA HP</div>
                <div className="text-xl font-mono font-bold tabular-nums text-emerald-400">
                  {hudStats.hp}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400">OVERDRIVE</div>
                <div className="text-xl font-mono font-bold tabular-nums text-amber-400">
                  {hudStats.overdrive}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400">WAVE</div>
                <div className="text-xl font-mono font-bold tabular-nums text-sky-400">
                  {hudStats.wave}/3
                </div>
              </div>
              <div>
                <div className="text-[10px] font-mono text-slate-400">SCORE</div>
                <div className="text-xl font-mono font-bold tabular-nums text-white">
                  {hudStats.score}
                </div>
              </div>
            </div>

            {/* Top-Right Compact Utility Controls */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                tabIndex={-1}
                aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setMuted((m) => !m);
                }}
                className="w-10 h-10 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-600 text-slate-200 flex items-center justify-center text-xs font-mono"
              >
                {muted ? 'MUTE' : 'SND'}
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Pause Sandbox"
                onClick={(e) => {
                  e.currentTarget.blur();
                  setPhase('paused');
                }}
                className="w-10 h-10 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-600 text-slate-200 flex items-center justify-center text-xs font-mono"
              >
                II
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Restart Sandbox"
                onClick={(e) => {
                  e.currentTarget.blur();
                  startOrRestartGame();
                }}
                className="w-10 h-10 rounded-lg bg-slate-950/90 border border-slate-800 hover:border-slate-600 text-slate-200 flex items-center justify-center text-xs font-mono"
              >
                ↺
              </button>
            </div>
          </div>

          <div className="text-center text-xs font-mono text-slate-400">
            Phone Stick / WASD Move · A / RT / Space Fire · B / LB Dash · X Nova Burst
          </div>
        </div>
      )}

      {/* Title Screen Overlay */}
      {phase === 'title' && (
        <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-between p-6 text-center">
          <div />
          <div className="flex flex-col items-center gap-4 max-w-md">
            <svg viewBox="0 0 180 48" className="w-44 h-12" aria-hidden="true">
              <rect
                x="4"
                y="6"
                width="172"
                height="36"
                rx="8"
                fill="#0F172A"
                stroke="#10B981"
                strokeWidth="2"
              />
              <circle cx="28" cy="24" r="9" fill="#10B981" />
              <text
                x="98"
                y="29"
                textAnchor="middle"
                fill="#F8FAFC"
                fontFamily="Outfit, sans-serif"
                fontWeight="700"
                fontSize="15"
              >
                MECHA PULSE ARENA
              </text>
            </svg>

            <h3 className="text-2xl font-display font-bold text-white">
              Live Cloud Controller Test Arena
            </h3>
            <p className="text-xs text-slate-300">
              अपने फ़ोन कंट्रोलर (या नीचे दिए वर्चुअल गेमपैड) से इस रोबोट अखाड़े को 10–15ms रिस्पॉन्स पर नियंत्रित करें।
            </p>

            <button
              type="button"
              data-start="true"
              onClick={startOrRestartGame}
              className="min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-sm transition-transform active:scale-95 whitespace-nowrap shrink-0"
            >
              Launch Arena Stream
            </button>
          </div>

          <div className="text-xs font-mono text-slate-400">
            Left Stick / WASD Move · Button A / RT Fire · Button B Dash · Esc Pause
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {phase === 'paused' && (
        <div className="absolute inset-0 bg-slate-950/85 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col items-center gap-4 text-center">
            <h4 className="text-xl font-display font-bold text-white">Arena Stream Paused</h4>
            <div className="grid grid-cols-2 gap-3 w-full text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">SCORE</div>
                <div className="text-lg font-bold tabular-nums text-white">{hudStats.score}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">WAVE</div>
                <div className="text-lg font-bold tabular-nums text-emerald-400">
                  {hudStats.wave}/3
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => setPhase('playing')}
                className="flex-1 min-h-[42px] rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={startOrRestartGame}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-800 text-slate-200 font-semibold text-xs"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={() => setPhase('title')}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-semibold text-xs"
              >
                Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over / Victory Modal */}
      {phase === 'gameover' && (
        <div className="absolute inset-0 bg-slate-950/85 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col items-center gap-4 text-center">
            <h4 className="text-xl font-display font-bold text-white">
              {hudStats.outcome === 'victory' ? 'Arena Sector Cleared!' : 'Mecha Link Disconnected'}
            </h4>
            <div className="grid grid-cols-3 gap-2 w-full text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">SCORE</div>
                <div className="text-base font-bold tabular-nums text-white">{hudStats.score}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">WAVE</div>
                <div className="text-base font-bold tabular-nums text-amber-400">
                  {hudStats.wave}/3
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">BOTS KO</div>
                <div className="text-base font-bold tabular-nums text-emerald-400">
                  {hudStats.enemiesDefeated}
                </div>
              </div>
            </div>
            <button
              type="button"
              data-start="true"
              onClick={startOrRestartGame}
              className="w-full min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs"
            >
              {hudStats.outcome === 'victory' ? 'Play Again' : 'Try Again'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
