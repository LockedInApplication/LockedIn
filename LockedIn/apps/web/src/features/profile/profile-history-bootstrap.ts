// Install before Next's history listener. Window-only events execute in registration
// order, even when a later component listener requests the capture phase.
// Only an active profile page supplies the guard; no account data is stored here.
export const profileHistoryBootstrap = `
if (!window.navigation) {
  var position = Number.isInteger(history.state && history.state.__lockedInHistoryPosition) ? history.state.__lockedInHistoryPosition : 0;
  var push = history.pushState.bind(history);
  var replace = history.replaceState.bind(history);
  replace(Object.assign({}, history.state, {__lockedInHistoryPosition: position}), "");
  history.pushState = function(state, title, url) {
    var next = position + 1;
    push(Object.assign({}, state, {__lockedInHistoryPosition: next}), title, url);
    position = next;
  };
  history.replaceState = function(state, title, url) {
    replace(Object.assign({}, state, {__lockedInHistoryPosition: position}), title, url);
  };
}
window.addEventListener("popstate", function(event) {
  if (!window.navigation && Number.isInteger(event.state && event.state.__lockedInHistoryPosition)) position = event.state.__lockedInHistoryPosition;
  if (window.__lockedInProfileHistoryGuard) window.__lockedInProfileHistoryGuard(event);
});`;
