/* Removes legacy emoji characters from static and CMS-rendered content.
   Keep Font Awesome icons and image assets untouched. */
(function () {
  'use strict';
  var emojiRE = /(?:\p{Regional_Indicator}{2}|\p{Emoji_Presentation}(?:\uFE0F|\u200D\p{Emoji_Presentation}|\p{Emoji_Modifier})*|\p{Extended_Pictographic}\uFE0F)/gu;

  function clean(value) {
    return String(value || '').replace(emojiRE, '');
  }

  function scan(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [], node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (parent && !/^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/i.test(parent.tagName) && emojiRE.test(node.nodeValue)) {
        emojiRE.lastIndex = 0;
        nodes.push(node);
      } else {
        emojiRE.lastIndex = 0;
      }
    }
    nodes.forEach(function (textNode) {
      var value = clean(textNode.nodeValue);
      if (value !== textNode.nodeValue) textNode.nodeValue = value;
    });

    if (root.querySelectorAll) {
      root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(function (el) {
        ['title', 'aria-label', 'placeholder'].forEach(function (attr) {
          var value = el.getAttribute(attr);
          if (value) {
            var cleaned = clean(value);
            if (cleaned !== value) el.setAttribute(attr, cleaned);
          }
        });
      });
    }
  }

  function start() {
    scan(document.body);
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) {
            var cleaned = clean(node.nodeValue);
            if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            scan(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
