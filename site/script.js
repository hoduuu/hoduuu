// 모바일 메뉴, 헤더 그림자, 등장 애니메이션, 문의 폼 전송
(function () {
  var header = document.querySelector('.site-header');
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', '메뉴 열기');
      }
    });
  }

  var onScroll = function () {
    if (header) header.classList.toggle('is-stuck', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    items.forEach(function (el) { io.observe(el); });
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  // ---- 카드수첩 좌우 화살표 ----
  document.querySelectorAll('.album-wrap').forEach(function (wrap) {
    var track = wrap.querySelector('.card-album');
    var prev = wrap.querySelector('.album-prev');
    var next = wrap.querySelector('.album-next');
    if (!track || !prev || !next) return;

    var scrollByCard = function (dir) {
      var card = track.querySelector('.album-card');
      var step = card ? card.getBoundingClientRect().width + 18 : track.clientWidth * 0.8;
      track.scrollBy({ left: dir * step, behavior: 'smooth' });
    };
    prev.addEventListener('click', function () { scrollByCard(-1); });
    next.addEventListener('click', function () { scrollByCard(1); });

    var updateButtons = function () {
      var eps = 8; // 카드 그림자용 padding만큼의 오차 허용
      var max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= eps;
      next.disabled = track.scrollLeft >= max - eps;
    };
    updateButtons();
    track.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
  });

  // ---- 문의 폼 (Formspree) ----
  // 페이지 이동 없이 그 자리에서 전송하고 결과 메시지를 보여줍니다.
  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  var submitBtn = document.getElementById('submitBtn');
  if (!form || !status || !submitBtn) return;

  var setStatus = function (message, kind) {
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  };

  form.addEventListener('submit', function (e) {
    // Formspree 주소를 아직 안 넣었으면 전송하지 않고 안내만 합니다
    if (form.action.indexOf('YOUR_FORM_ID') !== -1) {
      e.preventDefault();
      setStatus('폼이 아직 연결되지 않았습니다. 전화(010-6425-0543) 또는 이메일로 문의해 주세요.', 'error');
      return;
    }

    e.preventDefault();
    submitBtn.disabled = true;
    setStatus('보내는 중입니다...');

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          setStatus('문의가 접수되었습니다. 영업일 기준으로 순차적으로 답변드리겠습니다.', 'ok');
        } else {
          setStatus('전송에 실패했습니다. 전화(010-6425-0543)로 문의해 주세요.', 'error');
        }
      })
      .catch(function () {
        setStatus('전송에 실패했습니다. 전화(010-6425-0543)로 문의해 주세요.', 'error');
      })
      .then(function () {
        submitBtn.disabled = false;
      });
  });
})();
