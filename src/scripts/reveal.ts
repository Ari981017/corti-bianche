/** Fa comparire con una dissolvenza gli elementi .reveal quando entrano nello schermo. */
export function initReveal() {
  const els = document.querySelectorAll<HTMLElement>('.reveal:not(.is-in)');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}
