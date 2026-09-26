import React, { useEffect, useRef } from 'react';

export const HexMatrixBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Uniform 2-character hex bytes for consistent monospace alignment
    const hexSymbols = ['00', '1A', '2F', '3B', '4C', '5D', '6E', '7F', '88', '99', 'A0', 'B1', 'C2', 'D3', 'E4', 'F5', '4A', '7E', 'FF', 'D2', '9C', 'DE', 'AD', 'BE', 'EF', '89', '50', '4E', '47', 'C0'];
    const colSpacing = 44; // 44px column spacing ensures a distinct 20px+ horizontal gap between columns
    const lineGap = 36; // 36px line gap ensures a distinct 14px vertical gap between stacked characters
    let globalTime = 0;
    let motionTicksRemaining = 0; // Motion active ticks window

    // Global listener for mode change triggers
    const handleModeChange = () => {
      motionTicksRemaining = 150; // Motion active for ~2.5 seconds (150 frames @ 60fps)
    };

    window.addEventListener('cypher-mode-change', handleModeChange);
    (window as any).triggerHexMatrixMotion = (durationMs = 2500) => {
      motionTicksRemaining = Math.round((durationMs / 1000) * 60);
    };

    // Initial full pitch black backdrop fill (#000000)
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const render = () => {
      // Advance motion ONLY when mode change timer is active
      if (motionTicksRemaining > 0) {
        globalTime += 1;
        motionTicksRemaining--;
      }

      // Reset shadow properties before background rectangle fill
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Semi-transparent full pitch black overlay (#000000) for smooth trails
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = '700 22px "JetBrains Mono", "Fira Code", monospace';

      const columns = Math.ceil(canvas.width / colSpacing) + 1;
      const cycleHeight = canvas.height + 1600;
      const baseSpeed = 0.85;

      for (let i = 0; i < columns; i++) {
        const isDown = i % 2 === 0; // Alternating streams: EVEN columns DOWN, ODD columns UP
        
        // Natural organic speed variance synced continuously across global time
        const organicMod = Math.sin(globalTime * 0.012 + i * 0.35) * 12;
        const phaseOffset = (i * 110) % cycleHeight;
        
        const offset = ((globalTime * baseSpeed + organicMod + phaseOffset) % cycleHeight);

        let headY: number;
        if (isDown) {
          headY = offset - 400;
        } else {
          headY = canvas.height + 400 - offset;
        }

        const streamLen = 40; // Dense stream length without vertical crowding
        const direction = isDown ? 1 : -1;
        const xPos = i * colSpacing + 6;

        for (let j = 0; j < streamLen; j++) {
          const charY = headY + j * lineGap * direction;

          if (charY >= -60 && charY <= canvas.height + 60) {
            const charIdx = (i * 13 + j + Math.floor(globalTime / 18)) % hexSymbols.length;
            const randHex = hexSymbols[charIdx];
            const isCorrupted = (i * 5 + j * 7 + Math.floor(globalTime / 35)) % 13 === 0;

            if (isCorrupted) {
              // Corrupted Byte: Soft Glowing Crimson Red (Slightly Visible)
              ctx.fillStyle = j === 0 ? '#ff1744' : '#ff2a55';
              ctx.shadowColor = 'rgba(255, 23, 68, 0.75)';
              ctx.shadowBlur = 5;
            } else {
              // Normal Byte: Frosted White Stream (Slightly Visible)
              const alpha = Math.max(0.65, 1 - (j / streamLen) * 0.35);
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.shadowColor = 'rgba(255, 255, 255, 0.35)';
              ctx.shadowBlur = j === 0 ? 4 : 2;
            }

            ctx.fillText(randHex, xPos, charY);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('cypher-mode-change', handleModeChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-[-1] opacity-100"
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1, pointerEvents: 'none', filter: 'blur(3px) brightness(0.9)' }}
    />
  );
};








