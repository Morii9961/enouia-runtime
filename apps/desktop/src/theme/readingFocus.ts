/** Focus alone centres a tall section off its opening text in narrow reading mode. */
export function focusReadingTarget(id: string) {
  const target = document.getElementById(id);
  if (matchMedia('(max-width:899px)').matches) {
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  } else target?.focus();
}
