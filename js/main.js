// Zero Waste Kitchen — Main JS
document.addEventListener('DOMContentLoaded', function () {

  // Mobile menu
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  }

  // Active nav link
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.main-nav a').forEach(a => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === path || (href !== '/' && path.startsWith(href))) a.classList.add('active');
  });

  // Product image gallery switcher
  const heroImg = document.querySelector('.product-hero-img');
  const thumbs = document.querySelectorAll('.product-gallery img');
  if (heroImg && thumbs.length) {
    thumbs.forEach(thumb => {
      thumb.addEventListener('click', function () {
        heroImg.src = this.src;
        heroImg.alt = this.alt;
        thumbs.forEach(t => t.classList.remove('active'));
        this.classList.add('active');
      });
    });
    if (thumbs[0]) thumbs[0].classList.add('active');
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });

});
