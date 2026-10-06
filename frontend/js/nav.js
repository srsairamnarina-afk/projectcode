document.addEventListener("DOMContentLoaded", () => {
  const currentPath = window.location.pathname;
  const isLoggedIn = localStorage.getItem('sb_logged_in') === 'true';

  let navLinksHTML = `<a href="/" class="nav-link ${currentPath === '/' ? 'active' : ''}">🏠 Dashboard</a>`;
  
  if (isLoggedIn) {
    navLinksHTML += `
      <a href="/skill-analyzer" class="nav-link ${currentPath === '/skill-analyzer' ? 'active' : ''}">📈 Career Analysis</a>
      <a href="/skill-gap" class="nav-link ${currentPath === '/skill-gap' ? 'active' : ''}">🧩 Skill Gaps</a>
      <a href="/learning-roadmap" class="nav-link ${currentPath === '/learning-roadmap' ? 'active' : ''}">🛣️ Learning Path</a>
      <a href="/interview" class="nav-link ${currentPath === '/interview' ? 'active' : ''}">🎤 Mock Interview</a>
      <a href="/certifications" class="nav-link ${currentPath === '/certifications' ? 'active' : ''}">🎓 Certifications</a>
      <a href="/companies" class="nav-link ${currentPath === '/companies' ? 'active' : ''}">💼 Job Matches</a>
      <a href="/profile" class="nav-link profile-link ${currentPath === '/profile' ? 'active' : ''}">👤 My Profile</a>
      <a href="#" id="btnLogout" class="nav-link" style="color: var(--danger);">↪ Log out</a>
    `;
  }

  const navHTML = `
  <header class="navbar">
    <div class="brand" style="display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="window.location.href='/'">
      <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 4L4 11V25L18 32L32 25V11L18 4Z" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round"/>
        <path d="M18 4V18L32 11" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round"/>
        <path d="M18 32V18L4 25" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round"/>
        <circle cx="18" cy="18" r="4" fill="var(--success)"/>
      </svg>
      <div>SkillBridge <span>AI</span></div>
    </div>

    <!-- Hamburger icon for mobile -->
    <div class="menu-toggle" id="mobile-menu">
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </div>

    <nav class="nav-links" id="nav-links">
      ${navLinksHTML}
    </nav>
  </header>
  `;

  // Prepend to body
  document.body.insertAdjacentHTML('afterbegin', navHTML);

  // Logout Logic
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem('sb_logged_in');
      window.location.href = '/';
    });
  }

  // Mobile menu toggle
  const mobileMenu = document.getElementById("mobile-menu");
  const navLinks = document.getElementById("nav-links");
  
  if(mobileMenu && navLinks) {
    mobileMenu.addEventListener("click", () => {
      mobileMenu.classList.toggle("is-active");
      navLinks.classList.toggle("active");
    });
  }
});
