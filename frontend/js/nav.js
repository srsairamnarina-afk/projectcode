document.addEventListener("DOMContentLoaded", () => {
  const currentPath = window.location.pathname;
  const isLoggedIn = localStorage.getItem('sb_logged_in') === 'true';

  let navLinksHTML = `
    <a href="/" class="nav-link ${currentPath === '/' ? 'active' : ''}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      Dashboard
    </a>
  `;
  
  if (isLoggedIn) {
    navLinksHTML += `
      <a href="/skill-analyzer" class="nav-link ${currentPath === '/skill-analyzer' ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Career Analysis
      </a>
      <a href="/ats-optimizer" class="nav-link ${currentPath.includes('ats') ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        ATS Optimizer
      </a>
      <a href="/skill-gap" class="nav-link ${currentPath.includes('gap') ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
        Skill Gaps
      </a>
      <a href="/learning-roadmap" class="nav-link ${currentPath.includes('roadmap') ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        Roadmap
      </a>
      <a href="/interview" class="nav-link ${currentPath.includes('interview') ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        Mock Interview
      </a>
      <a href="/certifications" class="nav-link ${currentPath.includes('cert') ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>
        Certifications
      </a>
      <a href="/companies" class="nav-link ${(currentPath === '/companies' || currentPath.includes('job')) ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        Jobs
      </a>
      <span class="nav-divider"></span>
      <a href="/profile" class="nav-link profile-link ${currentPath === '/profile' ? 'active' : ''}">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Profile
      </a>
      <a href="#" id="btnLogout" class="nav-link nav-logout" title="Log out">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Log out
      </a>
    `;
  }

  const navHTML = `
  <header class="navbar">
    <div class="brand" style="cursor: pointer;" onclick="window.location.href='/'">
      <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
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
