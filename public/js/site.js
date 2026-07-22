// 全站行为：导航滚动收缩（>80px）+ 移动端抽屉。动效档位=少量点缀（DESIGN.md §9）。
(function () {
  var header = document.getElementById('site-header');
  var burger = document.getElementById('nav-burger');
  var drawer = document.getElementById('nav-drawer');

  if (header) {
    var shrunk = false;
    var onScroll = function () {
      var s = window.scrollY > 80;
      if (s !== shrunk) { shrunk = s; header.classList.toggle('shrunk', s); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (burger && drawer) {
    var setOpen = function (open) {
      drawer.hidden = !open;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.documentElement.classList.toggle('drawer-open', open);
    };
    burger.addEventListener('click', function () { setOpen(drawer.hidden); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
    });
  }
})();
