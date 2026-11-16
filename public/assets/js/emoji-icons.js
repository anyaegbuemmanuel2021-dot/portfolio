/* Converts legacy emoji decoration into consistent Font Awesome icons across static and CMS-rendered content. */
(function () {
  'use strict';
  var icons = {
    '💻':'fa-laptop-code','🤖':'fa-robot','📱':'fa-mobile-screen','🎨':'fa-palette','⚙':'fa-gear','🚀':'fa-rocket','🔧':'fa-screwdriver-wrench','🎓':'fa-graduation-cap','📧':'fa-envelope','📍':'fa-location-dot','🌐':'fa-globe','🏆':'fa-award','🏛':'fa-building-columns','💡':'fa-lightbulb','💰':'fa-wallet','📏':'fa-ruler','⚖':'fa-scale-balanced','🌡':'fa-temperature-half','💾':'fa-floppy-disk','⌨':'fa-keyboard','💍':'fa-ring','💑':'fa-heart','💏':'fa-heart','❤️':'fa-heart','💛':'fa-heart','🤍':'fa-heart','🌹':'fa-leaf','🌿':'fa-leaf','🔥':'fa-fire','🌸':'fa-seedling','🌺':'fa-seedling','💐':'fa-seedling','🌼':'fa-seedling','🥂':'fa-champagne-glasses','🎊':'fa-champagne-glasses','🕊':'fa-dove','⛪':'fa-church','🍛':'fa-utensils','🥘':'fa-bowl-food','🌶':'fa-pepper-hot','🍖':'fa-drumstick-bite','🍽':'fa-utensils','🍚':'fa-bowl-rice','🥣':'fa-bowl-food','🍢':'fa-utensils','🍲':'fa-bowl-food','🫙':'fa-jar','🥤':'fa-glass-water','👩‍🍳':'fa-user','🔍':'fa-magnifying-glass','🛍':'fa-bag-shopping','👗':'fa-shirt','👕':'fa-shirt','👖':'fa-person','👟':'fa-shoe-prints','🧥':'fa-shirt','💍':'fa-ring','👔':'fa-user-tie','👠':'fa-shoe-prints','👜':'fa-bag-shopping','🧣':'fa-shirt','✨':'fa-sparkles','🍔':'fa-burger','🏥':'fa-hospital','💳':'fa-credit-card','📰':'fa-newspaper','📌':'fa-thumbtack','⭐':'fa-star','🔥':'fa-fire','📬':'fa-inbox','📂':'fa-folder-open','🇳':'fa-globe','🖼':'fa-image','☎':'fa-phone','💬':'fa-comment-dots','✅':'fa-circle-check','☀':'fa-sun','🌙':'fa-moon','⚡':'fa-bolt','▶':'fa-play'
  };
  var emojiRE = /(?:\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|\\p{Emoji_Modifier})*)/gu;
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