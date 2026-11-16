document.querySelectorAll('[data-current-year]').forEach(function (node) { node.textContent = String(new Date().getFullYear()); });

/**
 * main.js — Portfolio JavaScript
 * Anyaegbu Emmanuel Ikenna
 * Clean, modular, performance-optimised
 */

'use strict';

/* ─────────────────────────────────────────
   1. LOADER
   ───────────────────────────────────────── */
const Loader = {
  el: null,

  init() {
    this.el = document.querySelector('.loader');
    if (!this.el) return;

    // Hide loader after content + min delay
    const minDelay = 1600;
    const start = performance.now();

    window.addEventListener('load', () => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, minDelay - elapsed);

      setTimeout(() => {
        this.el.classList.add('hidden');
        document.body.classList.add('page-enter');
      }, remaining);
    });
  }
};

/* ─────────────────────────────────────────
   2. NAVIGATION
   ───────────────────────────────────────── */
const Nav = {
  nav: null,
  hamburger: null,
  mobileMenu: null,
  scrollThreshold: 40,

  init() {
    this.nav = document.querySelector('.nav');
    this.hamburger = document.querySelector('.nav__hamburger');
    this.mobileMenu = document.querySelector('.nav__mobile');

    if (!this.nav) return;

    this.handleScroll();
    this.setActiveLink();

    window.addEventListener('scroll', () => this.handleScroll(), { passive: true });

    if (this.hamburger) {
      this.hamburger.addEventListener('click', () => this.toggleMobile());
    }

    // Close mobile menu on link click
    document.querySelectorAll('.nav__mobile-link').forEach(link => {
      link.addEventListener('click', () => this.closeMobile());
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.mobileMenu?.classList.contains('open') &&
          !this.nav.contains(e.target) &&
          !this.mobileMenu.contains(e.target)) {
        this.closeMobile();
      }
    });
  },

  handleScroll() {
    if (window.scrollY > this.scrollThreshold) {
      this.nav.classList.add('scrolled');
    } else {
      this.nav.classList.remove('scrolled');
    }
  },

  toggleMobile() {
    const isOpen = this.hamburger.classList.contains('open');
    isOpen ? this.closeMobile() : this.openMobile();
  },

  openMobile() {
    this.hamburger.classList.add('open');
    if (this.mobileMenu) {
      this.mobileMenu.style.display = 'flex';
      // Force reflow so transition plays
      this.mobileMenu.getBoundingClientRect();
      this.mobileMenu.classList.add('open');
    }
    document.body.style.overflow = 'hidden';
    this.hamburger.setAttribute('aria-expanded', 'true');
  },

  closeMobile() {
    this.hamburger.classList.remove('open');
    this.mobileMenu?.classList.remove('open');
    document.body.style.overflow = '';
    this.hamburger.setAttribute('aria-expanded', 'false');
    // After transition, hide the element
    if (this.mobileMenu) {
      const menu = this.mobileMenu;
      setTimeout(() => {
        if (!menu.classList.contains('open')) {
          menu.style.display = 'none';
        }
      }, 600);
    }
  },

  setActiveLink() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav__link, .nav__mobile-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href === currentPath || (currentPath === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  }
};

/* ─────────────────────────────────────────
   3. SCROLL REVEAL (IntersectionObserver)
   ───────────────────────────────────────── */
const ScrollReveal = {
  observer: null,

  init() {
    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('[data-reveal]').forEach(el => {
        el.classList.add('revealed');
      });
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            // Unobserve after reveal for performance
            this.observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px'
      }
    );

    document.querySelectorAll('[data-reveal]').forEach(el => {
      this.observer.observe(el);
    });
  }
};

/* ─────────────────────────────────────────
   4. SKILL BAR ANIMATION
   ───────────────────────────────────────── */
const SkillBars = {
  observer: null,

  init() {
    const bars = document.querySelectorAll('.skill-bar-fill');
    if (!bars.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bars.forEach(bar => bar.classList.add('revealed'));
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    bars.forEach(bar => this.observer.observe(bar));
  }
};

/* ─────────────────────────────────────────
   5. PARALLAX (subtle hero effect)
   ───────────────────────────────────────── */
const Parallax = {
  blobs: [],
  ticking: false,

  init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 768) return; // Skip on mobile

    this.blobs = [...document.querySelectorAll('.parallax-blob')];
    if (!this.blobs.length) return;

    window.addEventListener('scroll', () => this.requestTick(), { passive: true });
  },

  requestTick() {
    if (!this.ticking) {
      requestAnimationFrame(() => this.update());
      this.ticking = true;
    }
  },

  update() {
    const scrollY = window.scrollY;

    this.blobs.forEach((blob, i) => {
      const speed = i % 2 === 0 ? 0.08 : 0.05;
      const dir = i % 2 === 0 ? -1 : 1;
      blob.style.transform = `translateY(${scrollY * speed * dir}px)`;
    });

    this.ticking = false;
  }
};

/* ─────────────────────────────────────────
   6. COUNTER ANIMATION
   ───────────────────────────────────────── */
const Counters = {
  observer: null,

  init() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      counters.forEach(el => { el.textContent = el.dataset.count; });
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.animateCounter(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(el => this.observer.observe(el));
  },

  animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const start = performance.now();

    const easeOut = t => 1 - Math.pow(1 - t, 4);

    const update = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const value = Math.round(easeOut(progress) * target);
      el.textContent = value + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    requestAnimationFrame(update);
  }
};

/* ─────────────────────────────────────────
   7. TYPING EFFECT (hero title)
   ───────────────────────────────────────── */
const Typer = {
  el: null,
  phrases: [
    'Frontend Developer',
    'AI Creative Technologist',
    'Responsive Design Specialist',
    'UI/UX Enthusiast',
    'AI Video & Content Creator'
  ],
  currentIndex: 0,
  charIndex: 0,
  isDeleting: false,
  typingSpeed: 80,
  deletingSpeed: 45,
  pauseDelay: 2400,
  startDelay: 1800,

  init() {
    this.el = document.querySelector('[data-typing]');
    if (!this.el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.el.textContent = this.phrases[0];
      return;
    }

    setTimeout(() => this.type(), this.startDelay);
  },

  type() {
    const phrase = this.phrases[this.currentIndex];
    const speed = this.isDeleting ? this.deletingSpeed : this.typingSpeed;

    if (!this.isDeleting) {
      this.el.textContent = phrase.slice(0, this.charIndex + 1);
      this.charIndex++;

      if (this.charIndex === phrase.length) {
        setTimeout(() => { this.isDeleting = true; this.type(); }, this.pauseDelay);
        return;
      }
    } else {
      this.el.textContent = phrase.slice(0, this.charIndex - 1);
      this.charIndex--;

      if (this.charIndex === 0) {
        this.isDeleting = false;
        this.currentIndex = (this.currentIndex + 1) % this.phrases.length;
      }
    }

    setTimeout(() => this.type(), speed);
  }
};

/* ─────────────────────────────────────────
   8. PROJECT FILTER (projects page)
   ───────────────────────────────────────── */
const ProjectFilter = {
  activeFilter: 'all',

  apply() {
    const cards = document.querySelectorAll('.projects-full-grid .project-card, .featured-projects__grid .project-card');
    cards.forEach(card => {
      const category = (card.dataset.category || '').toLowerCase();
      const show = this.activeFilter === 'all' || category === this.activeFilter;
      card.style.display = show ? '' : 'none';
      card.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
  },

  init() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (!filterBtns.length) return;

    filterBtns.forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.filter === 'all' ? 'true' : 'false');
      btn.addEventListener('click', () => {
        this.activeFilter = btn.dataset.filter || 'all';
        filterBtns.forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        this.apply();
      });
    });

    // CMS content can replace project cards after this module initializes.
    document.addEventListener('projects:updated', () => this.apply());
    this.apply();
  }
};

/* ─────────────────────────────────────────
   9. CONTACT FORM
   ───────────────────────────────────────── */
const ContactForm = {
  form: null,

  init() {
    this.form = document.querySelector('.contact-form form');
    if (!this.form) return;

    this.form.addEventListener('submit', (e) => this.handleSubmit(e));
  },

  handleSubmit(e) {
    e.preventDefault();

    const name    = this.form.querySelector('[name="name"]')?.value.trim();
    const email   = this.form.querySelector('[name="email"]')?.value.trim();
    const subject = this.form.querySelector('[name="subject"]')?.value.trim();
    const message = this.form.querySelector('[name="message"]')?.value.trim();

    if (!name || !email || !message) {
      this.showMessage('Please fill in all required fields.', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showMessage('Please enter a valid email address.', 'error');
      return;
    }

    // Build mailto link and open
    const mailtoBody = `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`;
    const mailto = `mailto:anyaegbuemmanuel2021@gmail.com?subject=${encodeURIComponent(subject || 'Portfolio Enquiry')}&body=${encodeURIComponent(mailtoBody)}`;
    window.location.href = mailto;

    this.showMessage('Opening your email client... Thank you!', 'success');
    this.form.reset();
  },

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  showMessage(text, type) {
    let msg = this.form.querySelector('.form-msg');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'form-msg';
      this.form.appendChild(msg);
    }

    msg.textContent = text;
    msg.style.cssText = `
      font-family: var(--font-mono);
      font-size: 0.8rem;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      text-align: center;
      color: ${type === 'success' ? 'var(--color-gold)' : '#f87171'};
      background: ${type === 'success' ? 'rgba(200,169,110,0.08)' : 'rgba(248,113,113,0.08)'};
      border: 1px solid ${type === 'success' ? 'rgba(200,169,110,0.2)' : 'rgba(248,113,113,0.2)'};
    `;

    setTimeout(() => { if (msg.parentNode) msg.remove(); }, 5000);
  }
};

/* ─────────────────────────────────────────
   10. SMOOTH HOVER ON CARDS (mousetracking)
   ───────────────────────────────────────── */
const CardTilt = {
  init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.innerWidth < 768) return;

    document.querySelectorAll('.project-card, .service-card').forEach(card => {
      card.addEventListener('mousemove', (e) => this.tilt(e, card));
      card.addEventListener('mouseleave', () => this.reset(card));
    });
  },

  tilt(e, card) {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
    card.style.transform = `translateY(-6px) rotateX(${y}deg) rotateY(${x}deg)`;
  },

  reset(card) {
    card.style.transform = '';
  }
};

/* ─────────────────────────────────────────
   INIT ALL MODULES
   ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  Loader.init();
  Nav.init();
  ScrollReveal.init();
  SkillBars.init();
  Parallax.init();
  Counters.init();
  Typer.init();
  ProjectFilter.init();
  ContactForm.init();
  CardTilt.init();
});

/* Setup skill bar widths from data-width attribute */
document.querySelectorAll('.skill-bar-fill[data-width]').forEach(bar => {
  const pct = parseInt(bar.dataset.width, 10) / 100;
  bar.style.setProperty('--target-scale', pct);
  // Override transition to use the correct scale
  bar.style.transformOrigin = 'left';
});

/* Override skill bar revealed to use data-width */
const origSkillInit = SkillBars.init.bind(SkillBars);
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.skill-bar-fill').forEach(bar => {
    const pct = (parseInt(bar.dataset.width, 10) || 0) / 100;
    bar.style.transform = 'scaleX(0)';
    // When revealed class is added, animate to correct width
    const obs = new MutationObserver(() => {
      if (bar.classList.contains('revealed')) {
        bar.style.transform = `scaleX(${pct})`;
      }
    });
    obs.observe(bar, { attributes: true, attributeFilter: ['class'] });
  });
});

/* Progressive Web App: install support and safe offline caching. */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      console.warn('PWA service worker registration failed:', error);
    });
  }, { once: true });
}


/* Site-wide PWA installation prompt and persistent header shortcut. */
(() => {
  const initSiteInstall = () => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) return;
    if (sessionStorage.getItem('aeiInstallPromptDismissed') === '1') return;

    let deferredInstallPrompt = null;
    const banner = document.createElement('aside');
    banner.className = 'site-install-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Install portfolio app');
    banner.innerHTML = '<span class="site-install-banner__symbol" aria-hidden="true">↓</span><span class="site-install-banner__message"><strong>Install this website as an app</strong><small>Get faster access from your home screen.</small></span><button class="site-install-banner__action" type="button">Install</button><button class="site-install-banner__close" type="button" aria-label="Dismiss install message">&times;</button>';
    document.body.appendChild(banner);

    async function triggerInstall() {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        banner.remove();
        return;
      }
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      window.alert(isIOS
        ? 'To install this app, open this website in Safari, tap the Share button, then choose “Add to Home Screen”.'
        : 'To install this app, open your browser menu and choose “Install app” or “Add to Home screen”.');
    }

    banner.querySelector('.site-install-banner__action').addEventListener('click', triggerInstall);
    banner.querySelector('.site-install-banner__close').addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('aeiInstallPromptDismissed', '1');
    });

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });
    window.addEventListener('appinstalled', () => {
      banner.remove();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSiteInstall, { once: true });
  else initSiteInstall();
})();
