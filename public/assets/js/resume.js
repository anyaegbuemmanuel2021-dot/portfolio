(function () {
  'use strict';
  var button = document.getElementById('printResume');
  if (button) button.addEventListener('click', function () { window.print(); });
})();
