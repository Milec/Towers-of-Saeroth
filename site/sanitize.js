/* One rendering boundary for authored Markdown, editor previews and exports. */
(() => {
  'use strict';
  window.SaerothSanitize = html => {
    if (!window.DOMPurify?.sanitize) throw new Error('The safe Markdown renderer is unavailable. Reload the site to try again.');
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html:true, svg:true },
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script','style','iframe','object','embed','form','input','button','textarea','select','option','meta','link','base','audio','video'],
      FORBID_ATTR: ['style','srcset','name'],
      ADD_ATTR: ['aria-label','aria-hidden','role'],
    });
  };
})();
