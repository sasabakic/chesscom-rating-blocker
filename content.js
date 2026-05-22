/*
 * Chess.com Rating Hider — content script
 *
 * Runs at document_start. Two jobs:
 *
 *   1. Apply the user's enable/disable preference. CSS rules in hide.css
 *      are scoped to `html:not(.crh-disabled)`, so we just add or remove
 *      that class on the root element. Default is enabled (hide).
 *
 *   2. Strip "(1234)" rating suffixes from text nodes inside username-like
 *      elements. CSS can't remove text from inside a text node, so this
 *      handles the case where chess.com renders rating as part of the
 *      username text rather than in a separate element.
 *
 * Toggling the popup takes effect after page reload (per user spec), so
 * we only read storage once at script start and don't listen for changes.
 */

(() => {
  // ---- 1. Apply enabled/disabled flag ------------------------------

  // chrome.storage.local is async. To avoid a flash of unhidden ratings,
  // we default to enabled: the CSS already hides everything; we only
  // need to UN-hide if the user has disabled the extension.
  chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
    if (!enabled) {
      document.documentElement.classList.add("crh-disabled");
    }
  });

  // ---- 2. Strip "(1234)" suffixes from username text nodes ---------

  // Pattern: optional whitespace, "(", 3-4 digits, ")", end-or-whitespace.
  // We're conservative — only digits 3-4 long, which covers chess ratings
  // (typically 100-3500) without catching year numbers or move counts.
  const RATING_SUFFIX = /\s*\(\s*\d{3,4}\s*\)/g;

  // Elements whose text content is treated as "username-like" and scanned
  // for rating suffixes.
  const USERNAME_SELECTOR = [
    '[class*="username" i]',
    '[class*="user-tag" i]',
    '[class*="user-name" i]',
    '[class*="player-name" i]',
    '[class*="player-username" i]',
    ".cc-user-username-component",
    ".user-username-component",
  ].join(",");

  function stripFromNode(root) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    const targets = root.matches(USERNAME_SELECTOR)
      ? [root]
      : Array.from(root.querySelectorAll(USERNAME_SELECTOR));
    for (const el of targets) {
      // Walk this element's text nodes only (not descendants that are
      // dedicated rating elements — those are handled by CSS).
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (RATING_SUFFIX.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(RATING_SUFFIX, "");
        }
      }
    }
  }

  function initObserver() {
    // Bail if disabled.
    if (document.documentElement.classList.contains("crh-disabled")) return;

    // Initial pass over the current document.
    stripFromNode(document.body);

    // Watch for SPA navigation / dynamically inserted nodes.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") {
          // A text node changed — re-scan its closest username ancestor.
          const parent = m.target.parentElement;
          if (parent && parent.closest(USERNAME_SELECTOR)) {
            stripFromNode(parent.closest(USERNAME_SELECTOR));
          }
        } else {
          for (const added of m.addedNodes) {
            if (added.nodeType === Node.ELEMENT_NODE) stripFromNode(added);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver, { once: true });
  } else {
    initObserver();
  }
})();
