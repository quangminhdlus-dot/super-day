// Some Safari versions ignore viewport zoom limits for accessibility. Cancel only
// WebKit's page-scale gestures as a fallback; never cancel touchstart/move/end,
// double-click, wheel, selection, keyboard events or iOS system magnification.
export function installViewportGuard(document) {
  const preventPageZoom = event => { if (event.cancelable) event.preventDefault(); };
  for (const name of ['gesturestart', 'gesturechange']) {
    document.addEventListener(name, preventPageZoom, { passive: false });
  }
}
