/* Converts legacy emoji decoration into consistent Font Awesome icons across static and CMS-rendered content. */
(function () {
  'use strict';
  var icons = {
    '\u{1f4bb}':'fa-laptop-code','\u{1f916}':'fa-robot','\u{1f4f1}':'fa-mobile-screen','\u{1f3a8}':'fa-palette','\u{2699}':'fa-gear','\u{1f680}':'fa-rocket','\u{1f527}':'fa-screwdriver-wrench','\u{1f393}':'fa-graduation-cap','\u{1f4e7}':'fa-envelope','\u{1f4cd}':'fa-location-dot','\u{1f310}':'fa-globe','\u{1f3c6}':'fa-award','\u{1f3db}':'fa-building-columns','\u{1f4a1}':'fa-lightbulb','\u{1f4b0}':'fa-wallet','\u{1f4cf}':'fa-ruler','\u{2696}':'fa-scale-balanced','\u{1f321}':'fa-temperature-half','\u{1f4be}':'fa-floppy-disk','\u{2328}':'fa-keyboard','\u{1f48d}':'fa-ring','\u{1f491}':'fa-heart','\u{1f48f}':'fa-heart','\u{2764}\u{fe0f}':'fa-heart','\u{1f49b}':'fa-heart','\u{1f90d}':'fa-heart','\u{1f339}':'fa-leaf','\u{1f33f}':'fa-leaf','\u{1f525}':'fa-fire','\u{1f338}':'fa-seedling','\u{1f33a}':'fa-seedling','\u{1f490}':'fa-seedling','\u{1f33c}':'fa-seedling','\u{1f942}':'fa-champagne-glasses','\u{1f38a}':'fa-champagne-glasses','\u{1f54a}':'fa-dove','\u{26ea}':'fa-church','\u{1f35b}':'fa-utensils','\u{1f958}':'fa-bowl-food','\u{1f336}':'fa-pepper-hot','\u{1f356}':'fa-drumstick-bite','\u{1f37d}':'fa-utensils','\u{1f35a}':'fa-bowl-rice','\u{1f963}':'fa-bowl-food','\u{1f362}':'fa-utensils','\u{1f372}':'fa-bowl-food','\u{1fad9}':'fa-jar','\u{1f964}':'fa-glass-water','\u{1f469}\u{200d}\u{1f373}':'fa-user','\u{1f50d}':'fa-magnifying-glass','\u{1f6cd}':'fa-bag-shopping','\u{1f457}':'fa-shirt','\u{1f455}':'fa-shirt','\u{1f456}':'fa-person','\u{1f45f}':'fa-shoe-prints','\u{1f9e5}':'fa-shirt','\u{1f48d}':'fa-ring','\u{1f454}':'fa-user-tie','\u{1f460}':'fa-shoe-prints','\u{1f45c}':'fa-bag-shopping','\u{1f9e3}':'fa-shirt','\u{2728}':'fa-sparkles','\u{1f354}':'fa-burger','\u{1f3e5}':'fa-hospital','\u{1f4b3}':'fa-credit-card','\u{1f4f0}':'fa-newspaper','\u{1f4cc}':'fa-thumbtack','\u{2b50}':'fa-star','\u{1f525}':'fa-fire','\u{1f4ec}':'fa-inbox','\u{1f4c2}':'fa-folder-open','\u{1f1f3}':'fa-globe','\u{1f5bc}':'fa-image','\u{260e}':'fa-phone','\u{1f4ac}':'fa-comment-dots','\u{2705}':'fa-circle-check','\u{2600}':'fa-sun','\u{1f319}':'fa-moon','\u{26a1}':'fa-bolt','\u{25b6}':'fa-play'
  };
  var emojiRE = /(?:\p{Regional_Indicator}{2}|\p{Emoji_Presentation}(?:\uFE0F|\u200D\p{Emoji_Presentation}|\p{Emoji_Modifier})*|\p{Extended_Pictographic}\uFE0F)/gu;
  function iconFor(value) {
    var key = value;
    if (!icons[key]) key = Array.from(value)[0];
    return icons[key] || 'fa-sparkles';
  }
  function convertTextNode(node) {
    var value = node.nodeValue;
    if (!value || !emojiRE.test(value)) { emojiRE.lastIndex = 0; return; }
    emojiRE.lastIndex = 0;
    var fragment = document.createDocumentFragment(), last = 0, match;
    while ((match = emojiRE.exec(value))) {
      if (match.index > last) fragment.appendChild(document.createTextNode(value.slice(last, match.index)));
      var icon = document.createElement('i');
      icon.className = 'fa-solid ' + iconFor(match[0]) + ' emoji-replacement-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.style.cssText = 'font-size:.9em;vertical-align:-.08em;margin-inline:.12em';
      fragment.appendChild(icon);
      last = match.index + match[0].length;
    }
    if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
    if (node.parentNode) node.parentNode.replaceChild(fragment, node);
  }
  function scan(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (!node.nodeValue || !emojiRE.test(node.nodeValue)) { emojiRE.lastIndex = 0; return NodeFilter.FILTER_REJECT; }
        emojiRE.lastIndex = 0;
        var parent = node.parentElement;
        return parent && /^(SCRIPT|STYLE|TEXTAREA|NOSCRIPT)$/i.test(parent.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], current;
    while ((current = walker.nextNode())) nodes.push(current);
    nodes.forEach(convertTextNode);
    if (root.querySelectorAll) root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(function (el) {
      ['title','aria-label','placeholder'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && emojiRE.test(v)) { emojiRE.lastIndex = 0; el.setAttribute(attr, v.replace(emojiRE, '')); }
        emojiRE.lastIndex = 0;
      });
    });
  }
  function start() {
    scan(document.body);
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === Node.TEXT_NODE) convertTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    var nativeAlert = window.alert;
    window.alert = function (message) { nativeAlert(String(message).replace(emojiRE, '')); };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();