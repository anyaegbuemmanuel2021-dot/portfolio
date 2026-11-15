# Anyaegbu Emmanuel Ikenna — Developer Portfolio

![Portfolio Preview](assets/images/preview.png)

> **AEI.** — A production-ready, multi-page professional developer portfolio built with premium CSS animations, elegant design, and full CV download capability.

---

## 📋 Project Overview

A handcrafted, premium portfolio website for **Anyaegbu Emmanuel Ikenna**, a Full-Stack Developer and Computer Science student at Nnamdi Azikiwe University (UNIZIK), Enugu State, Nigeria.

The design philosophy draws inspiration from **Apple**, **Linear**, and modern SaaS companies: minimal, elegant, purposeful. Every animation, spacing decision, and typographic choice has been made deliberately.

---

## ✨ Features

- **5 fully-functional pages**: Home, About, Projects, Services, Contact
- **CV Download** — downloadable PDF from Hero, About page, and navbar
- **Loader animation** with progress bar before page render
- **Smooth page transitions** with fade-in on load
- **Scroll reveal animations** — fade-up, slide-left, slide-right with IntersectionObserver
- **Typing effect** — animated role cycling in hero section
- **Counter animations** — number counting on scroll
- **Skill bar animations** — animated progress bars on About page
- **Card tilt micro-interaction** — subtle 3D tilt on project cards
- **Mobile-first responsive** — optimised from 320px to 4K
- **Animated gradient background** with slow, subtle movement
- **Floating parallax blobs** in hero and CTA sections
- **Glass navbar** — frosted glass effect on scroll
- **Project filter system** on Projects page
- **Contact form** — opens email client with pre-filled content
- **Dark elegant theme** — warm gold (#c8a96e) on deep black (#080808)
- **Noise texture overlay** for depth
- **Custom scrollbar**

---

## 🎨 Animation System

All animations use **only `transform` and `opacity`** for GPU-accelerated performance.

### Scroll Reveal (IntersectionObserver)
```html
<div data-reveal="fade-up">...</div>
<div data-reveal="slide-left" data-delay="200">...</div>
<div data-reveal="slide-right" data-delay="400">...</div>
<div data-reveal="scale">...</div>
```
Available: `fade-up`, `fade-down`, `slide-left`, `slide-right`, `fade`, `scale`  
Delays: `100` to `800` ms via `data-delay` attribute.

### Loader
Automatically shows on every page load, hides after `1600ms` minimum.

### Typing Effect
```html
<span data-typing class="typing-cursor">Full-Stack Developer</span>
```

### Counter
```html
<span data-count="15" data-suffix="+">0+</span>
```

### Parallax Blobs
```html
<div class="parallax-blob parallax-blob--1"></div>
```

### Prefers-Reduced-Motion
All animations respect the `prefers-reduced-motion: reduce` CSS media query — no animations fire for users who prefer reduced motion.

---

## 📥 CV Download Feature

The CV download button appears in:
- **Hero section** (index.html)
- **About page** (about.html)  
- **Navigation bar** (all pages)
- **Mobile menu** (all pages)

### Implementation
```html
<a href="assets/files/Emmanuel_Anyaegbu_CV.pdf" 
   download 
   class="btn btn--cv">
  <span class="cv-icon">↓</span> Download CV
</a>
```

### How to Replace the CV File
1. Generate your CV as a PDF (Canva, Google Docs, Microsoft Word → Export PDF)
2. Name it: `Emmanuel_Anyaegbu_CV.pdf` (or update the path in all HTML files)
3. Place it in `assets/files/`
4. Done — the download button will automatically use the new file

---

## 📁 Folder Structure

```
portfolio/
│
├── index.html          ← Homepage
├── about.html          ← About page
├── projects.html       ← Projects gallery
├── services.html       ← Services offered
├── contact.html        ← Contact form
│
├── assets/
│   ├── css/
│   │   ├── global.css      ← Design tokens, reset, nav, footer, utilities
│   │   ├── animations.css  ← All animation classes & keyframes
│   │   ├── home.css        ← Homepage-specific styles
│   │   └── about.css       ← Inner page styles (about, projects, services, contact)
│   │
│   ├── js/
│   │   └── main.js         ← All JavaScript modules
│   │
│   ├── images/             ← Place images here (profile photo, project screenshots)
│   ├── fonts/              ← Self-hosted fonts (optional, Google Fonts used by default)
│   └── files/
│       └── Emmanuel_Anyaegbu_CV.pdf  ← Your CV file
│
└── README.md
```

---

## 🛠️ Technologies Used

| Category | Technology |
|----------|-----------|
| Markup | HTML5 (semantic) |
| Styling | CSS3 (custom properties, Grid, Flexbox, clamp()) |
| Scripting | Vanilla JavaScript (ES2022+) |
| Fonts | Cormorant Garamond · Outfit · JetBrains Mono (Google Fonts) |
| Animation | CSS @keyframes + CSS transitions + IntersectionObserver |
| Icons | Unicode / emoji (zero dependencies) |
| Build | None required — pure HTML/CSS/JS |

**Zero dependencies. Zero frameworks. Zero build step.**

---

## ⚡ Performance Optimisations

- **Only `transform` & `opacity` animated** — triggers GPU compositing, not layout/paint
- **`will-change` hint** only on elements that animate
- **IntersectionObserver** for scroll reveal — no scroll event listeners
- **`{ passive: true }`** on all scroll event listeners
- **`requestAnimationFrame`** used for parallax to avoid frame drops
- **Font-display: swap** via Google Fonts for fast render
- **CSS custom properties** — single source of truth, no CSS-in-JS overhead
- **Loader hides** only after `window.load` + min delay, preventing FOUC
- **No external CSS frameworks** — no Bootstrap, no Tailwind bloat
- Images use `loading="lazy"` (when added)

---

## ♿ Accessibility Features

- Semantic HTML5 (`header`, `nav`, `main`, `section`, `footer`, `article`)
- `role` and `aria-label` on navigation, dialogs, and interactive elements
- `aria-expanded` on hamburger menu button
- `prefers-reduced-motion` respected — all animations disabled for affected users
- Keyboard-navigable — all interactive elements focusable
- `:focus-visible` styles for keyboard users
- Sufficient colour contrast ratios (WCAG AA compliant)
- `lang="en"` on `<html>` element
- Meaningful `alt` text guidelines in place for images

---

## 🚀 Deployment Guide

### Option 1: Netlify (Recommended — Free)
1. Go to [netlify.com](https://netlify.com)
2. Drag & drop the `portfolio/` folder onto the Netlify dashboard
3. Your site is live in under 30 seconds
4. Set a custom domain in Site Settings > Domain Management

### Option 2: Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. Navigate to the portfolio folder: `cd portfolio`
3. Run: `vercel`
4. Follow the prompts

### Option 3: GitHub Pages
1. Push the portfolio folder to a GitHub repository
2. Go to Settings → Pages
3. Set Source to `main` branch, `/ (root)` folder
4. Your site will be at `https://username.github.io/repo-name`

### Option 4: Shared Hosting (cPanel)
1. Compress the `portfolio/` folder to a `.zip`
2. Upload via File Manager or FTP to `public_html/`
3. Extract and your site is live

---

## 🎨 Customisation Guide

### Update Personal Info
Edit all HTML files and replace:
- `Anyaegbu Emmanuel Ikenna` → your name
- `anyaegbuemmanuel2021@gmail.com` → your email
- `+2347046947391` → your WhatsApp number
- Social media links → your actual profiles

### Change Colour Accent
In `assets/css/global.css`, update the gold variables:
```css
--color-gold:       #c8a96e;  /* Main accent */
--color-gold-light: #e0c490;  /* Hover state */
--color-gold-dark:  #9d7f48;  /* Subtle states */
```

### Add Your Profile Photo
Place `profile.jpg` in `assets/images/` and update the avatar element in `about.html`:
```html
<img src="assets/images/profile.jpg" alt="Emmanuel Anyaegbu" class="about-avatar" />
```

### Update Projects
In `projects.html`, duplicate a `.project-card` and update the content, tags, and thumbnail gradient.

---

## 🔮 Future Improvements

- [ ] Add blog/articles section
- [ ] Implement dark/light mode toggle
- [ ] Add project case study pages
- [ ] Integrate a headless CMS (Sanity, Contentful)
- [ ] Add a testimonials section
- [ ] Implement view transitions API for page navigation
- [ ] Add 3D elements using Three.js for hero background
- [ ] Progressive Web App (PWA) support
- [ ] Add analytics (Plausible or Google Analytics)
- [ ] Multi-language support (English / Igbo)

---

## 👤 Author

**Anyaegbu Emmanuel Ikenna**  
Full-Stack Developer & Computer Science Student  
Nnamdi Azikiwe University (UNIZIK), Enugu State, Nigeria 🇳🇬

| Platform | Link |
|----------|------|
| 📧 Email | anyaegbuemmanuel2021@gmail.com |
| 📱 WhatsApp | [+234 704 694 7391](https://wa.me/2347046947391) |
| 💼 LinkedIn | [anyaegbu-emmanuel](https://linkedin.com/in/anyaegbu-emmanuel) |
| 📸 Instagram | [@anyaegbu_emmanuel](https://instagram.com/anyaegbu_emmanuel) |
| 🎵 TikTok | [@anyaegbu_emmanuel](https://tiktok.com/@anyaegbu_emmanuel) |

---

*Built with ❤️ and vanilla code — no frameworks harmed in the making.*
