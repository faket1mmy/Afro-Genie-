// ===========================
// Sterling & Hale Law Firm
// Global Scripts
// ===========================

document.addEventListener('DOMContentLoaded', function () {
  initMobileNav();
  initActiveNavLink();
  initAccordion();
  initBackToTop();
  initContactForm();
  initYear();
});

/* Mobile navigation toggle */
function initMobileNav() {
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (!toggle || !links) return;

  toggle.addEventListener('click', function () {
    var isOpen = links.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  links.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* Highlight the current page in the nav */
function initActiveNavLink() {
  var current = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* FAQ accordion (used on Practice Areas page) */
function initAccordion() {
  var items = document.querySelectorAll('.accordion-item');
  items.forEach(function (item) {
    var trigger = item.querySelector('.accordion-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var wasOpen = item.classList.contains('open');
      items.forEach(function (i) { i.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
    });
  });
}

/* Back to top button */
function initBackToTop() {
  var btn = document.querySelector('.back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });

  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* Contact form validation + mock submit */
function initContactForm() {
  var form = document.querySelector('#contact-form');
  if (!form) return;

  var status = form.querySelector('.form-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var valid = true;

    var fields = [
      { name: 'name', label: 'Full name required' },
      { name: 'email', label: 'A valid email is required', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      { name: 'phone', label: 'Phone number required' },
      { name: 'practiceArea', label: 'Please select a practice area' },
      { name: 'message', label: 'Please tell us briefly about your case' }
    ];

    fields.forEach(function (field) {
      var input = form.querySelector('[name="' + field.name + '"]');
      if (!input) return;
      var group = input.closest('.form-group');
      var value = input.value.trim();
      var ok = value.length > 0;
      if (ok && field.pattern) ok = field.pattern.test(value);

      if (!ok) {
        valid = false;
        group.classList.add('has-error');
      } else {
        group.classList.remove('has-error');
      }
    });

    if (!status) return;

    if (!valid) {
      status.textContent = 'Please correct the highlighted fields and try again.';
      status.className = 'form-status error';
      return;
    }

    status.textContent = 'Thank you. Your message has been received — a member of our team will contact you within one business day.';
    status.className = 'form-status success';
    form.reset();
  });

  form.querySelectorAll('input, select, textarea').forEach(function (input) {
    input.addEventListener('input', function () {
      var group = input.closest('.form-group');
      if (group) group.classList.remove('has-error');
    });
  });
}

/* Auto-update copyright year in footer */
function initYear() {
  var el = document.querySelector('#current-year');
  if (el) el.textContent = new Date().getFullYear();
}
