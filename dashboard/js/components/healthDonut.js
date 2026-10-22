/**
 * Experience Score Animated SVG Donut Component
 */
function renderExperienceDonut(containerId, score = 94) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampedScore / 100) * circumference;

  let color = 'var(--pulse-emerald)';
  let glow = 'rgba(16, 185, 129, 0.5)';
  if (clampedScore < 60) {
    color = 'var(--pulse-red)';
    glow = 'rgba(244, 63, 94, 0.5)';
  } else if (clampedScore < 75) {
    color = 'var(--pulse-amber)';
    glow = 'rgba(245, 158, 11, 0.5)';
  } else if (clampedScore < 90) {
    color = 'var(--pulse-cyan)';
    glow = 'rgba(0, 242, 254, 0.5)';
  }

  container.innerHTML = `
    <svg class="donut-svg" viewBox="0 0 140 140">
      <circle 
        class="donut-bg-ring" 
        cx="70" 
        cy="70" 
        r="${radius}"
      />
      <circle 
        class="donut-value-ring" 
        cx="70" 
        cy="70" 
        r="${radius}" 
        stroke="${color}"
        style="
          stroke-dasharray: ${circumference}; 
          stroke-dashoffset: ${offset};
          filter: drop-shadow(0 0 8px ${glow});
        "
      />
    </svg>
    <div class="donut-center-text">
      <span class="donut-score-num" style="color: ${color}">${clampedScore}</span>
      <span class="donut-score-total">/ 100</span>
    </div>
  `;
}
