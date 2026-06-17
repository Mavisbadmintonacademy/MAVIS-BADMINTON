document.addEventListener('DOMContentLoaded', () => {
  // Check if touch device
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const touchOffsetY = -45; // Offset above finger so it is visible to the user

  // 1. Create custom cursor elements
  const cursorContainer = document.createElement('div');
  cursorContainer.className = 'custom-cursor';
  
  // Shuttlecock SVG design
  cursorContainer.innerHTML = `
    <svg class="custom-cursor-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Cork base -->
      <path d="M40 38 C40 25, 60 25, 60 38 C60 41, 40 41, 40 38 Z" fill="#ffffff" stroke="var(--primary)" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M41 33 C45 35, 55 35, 59 33" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
      <!-- Feathers skeleton -->
      <path d="M50 38 L30 85 M50 38 L70 85 M50 38 L50 85 M50 38 L40 85 M50 38 L60 85" stroke="var(--primary)" stroke-width="3.5" stroke-linecap="round"/>
      <!-- Feather bands -->
      <path d="M30 85 C40 88, 60 88, 70 85" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" fill="none"/>
      <path d="M35 65 C42 67, 58 67, 65 65" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>
  `;

  document.body.appendChild(cursorContainer);
  document.body.classList.add('has-custom-cursor');

  const cursorSvg = cursorContainer.querySelector('.custom-cursor-svg');

  // Coordinates & physics state
  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;
  let lastX = 0;
  let lastY = 0;
  let currentAngle = 0;

  let lastTouchTime = 0;

  // Track mouse coordinates
  window.addEventListener('mousemove', (e) => {
    if (Date.now() - lastTouchTime < 1000) return; // Ignore emulated mouse move after touch
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorContainer.classList.remove('touch-visible'); // Ensure touch-visible is removed when using mouse
  });

  // Track touch coordinates
  window.addEventListener('touchstart', (e) => {
    lastTouchTime = Date.now();
    if (e.touches && e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY + touchOffsetY;
      
      // Snap position instantly to current touch coordinates to avoid sliding transition from old values
      cursorX = mouseX;
      cursorY = mouseY;
      lastX = cursorX;
      lastY = cursorY;
      
      cursorContainer.classList.add('touch-visible');
      cursorContainer.classList.add('clicking');
    }
  });

  window.addEventListener('touchmove', (e) => {
    lastTouchTime = Date.now();
    if (e.touches && e.touches.length > 0) {
      mouseX = e.touches[0].clientX;
      mouseY = e.touches[0].clientY + touchOffsetY;
      cursorContainer.classList.add('touch-visible');
    }
  });

  window.addEventListener('touchend', () => {
    lastTouchTime = Date.now();
    cursorContainer.classList.remove('touch-visible');
    cursorContainer.classList.remove('clicking');
  });

  window.addEventListener('touchcancel', () => {
    lastTouchTime = Date.now();
    cursorContainer.classList.remove('touch-visible');
    cursorContainer.classList.remove('clicking');
  });

  // Track clicking states on desktop
  window.addEventListener('mousedown', () => {
    if (Date.now() - lastTouchTime < 1000) return; // Ignore emulated mouse down after touch
    cursorContainer.classList.add('clicking');
  });
  window.addEventListener('mouseup', () => {
    if (Date.now() - lastTouchTime < 1000) return; // Ignore emulated mouse up after touch
    cursorContainer.classList.remove('clicking');
  });

  // Hover states on links/buttons
  const updateHoverState = (isHovered) => {
    if (isHovered) {
      cursorContainer.classList.add('hovered');
    } else {
      cursorContainer.classList.remove('hovered');
    }
  };

  // Select interactive elements
  const addHoverListeners = () => {
    const interactives = document.querySelectorAll('a, button, select, input, textarea, [role="button"], .court-tab, .calendar-day, .slot-pill');
    interactives.forEach(el => {
      // Avoid double listeners
      el.removeEventListener('mouseenter', () => updateHoverState(true));
      el.removeEventListener('mouseleave', () => updateHoverState(false));
      
      el.addEventListener('mouseenter', () => updateHoverState(true));
      el.addEventListener('mouseleave', () => updateHoverState(false));
    });
  };

  addHoverListeners();
  
  // Re-run hover listeners periodically for dynamically loaded content
  const observer = new MutationObserver(addHoverListeners);
  observer.observe(document.body, { childList: true, subtree: true });

  // Trail generation
  let lastTrailTime = 0;
  const createTrailParticle = (x, y, vx, vy) => {
    const now = performance.now();
    if (now - lastTrailTime < 35) return; // limit trail frequency
    lastTrailTime = now;

    const particle = document.createElement('div');
    particle.className = 'cursor-trail-particle';
    particle.style.transform = `translate(-50%, -50%) translate3d(${x}px, ${y}px, 0)`;
    
    // Slight random drift
    const driftX = (Math.random() - 0.5) * 8;
    const driftY = (Math.random() - 0.5) * 8;
    
    document.body.appendChild(particle);

    // Fade out and move particle
    let opacity = 0.6;
    let size = 6;
    let px = x;
    let py = y;
    
    const fade = () => {
      opacity -= 0.04;
      size -= 0.3;
      px -= vx * 0.2 + driftX * 0.1;
      py -= vy * 0.2 + driftY * 0.1;
      
      if (opacity <= 0 || size <= 0) {
        particle.remove();
      } else {
        particle.style.opacity = opacity;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.transform = `translate(-50%, -50%) translate3d(${px}px, ${py}px, 0)`;
        requestAnimationFrame(fade);
      }
    };
    
    requestAnimationFrame(fade);
  };

  // Animation Loop
  const render = () => {
    // Lerp translation for smooth easing follow effect
    const ease = 0.15;
    cursorX += (mouseX - cursorX) * ease;
    cursorY += (mouseY - cursorY) * ease;

    // Calculate motion vector (velocity)
    const dx = cursorX - lastX;
    const dy = cursorY - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);

    // Shuttlecock orientation logic: 
    // Cork points in direction of motion, feathers trail behind.
    // In our SVG, cork is at the top, so we add 90 deg (PI/2) to orient top along velocity.
    if (speed > 1) {
      const targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      
      // Interpolate angle for smooth rotation transitions
      let diff = targetAngle - currentAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      currentAngle += diff * 0.2;
      
      // Create motion trail when moving quickly
      if (speed > 5) {
        createTrailParticle(cursorX, cursorY, dx, dy);
      }
    }

    // Position container and rotate SVG child
    cursorContainer.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0) translate(-50%, -50%)`;
    cursorSvg.style.transform = `rotate(${currentAngle * (180 / Math.PI)}deg)`;

    // Keep history
    lastX = cursorX;
    lastY = cursorY;

    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
});
