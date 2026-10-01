// Feature-Flag fuer 2D/3D - bewusst ohne Three.js-Import,
// damit die Standard-2D-App und CI-Smokes leicht bleiben.

const VIEW_KEY = 'knotenpunkt.view';

/** Feature-Flag: 3D-View statt SVG. */
export function isView3d() {
  try {
    const q = new URLSearchParams(location.search).get('view');
    if (q === '3d' || q === 'three') return true;
    if (q === '2d' || q === 'svg') return false;
    return localStorage.getItem(VIEW_KEY) === '3d';
  } catch (_) {
    return false;
  }
}

export function setView3d(on) {
  try {
    if (on) localStorage.setItem(VIEW_KEY, '3d');
    else localStorage.removeItem(VIEW_KEY);
  } catch (_) { /* privater Modus */ }
}
