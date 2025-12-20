// BUILD_TAG: 2025-12-20-02
// ROLLBACK: revert to BUILD_TAG: 2025-12-20-01 (your current file before this change)

// ======== Tiny DOM helpers ========
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
function bust(u){ return u ? u + (u.indexOf('?')>=0 ? '&' : '?') + 'v=' + (window.APP_VERSION || Date.now()) : u; }

// ======== Router ========
var app = $('#app');
var navLinks = $all('.nav-link');

var routes = {
  home: renderHome,
  about: renderAbout,
  gallery: renderGallery,
  contact: renderContact,
  cart: renderCart,
  item: renderItem
};

navLinks.forEach(function(a){
  a.addEventListener('click', function(e){
    e.preventDefault();
    var route = a.getAttribute('data-route');
    setActive(route);
    if (routes[route]) routes[route]();
    history.pushState({ route: route }, '', '#/'+route);
  });
});

window.addEventListener('popstate', function(){
  var rp = getHashRoute();
  var route = rp[0], param = rp[1];
  if (routes[route]) {
    setActive(route);
    routes[route](param);
  } else {
    setActive('gallery');
    renderGallery();
  }
});

function getHashRoute(){
  var hash = (location.hash || '#/gallery').replace(/^#\//,'');
  var parts = hash.split('/');
  var route = parts[0] || 'gallery';
  var param = parts[1];
  return [route, param];
}

// Close purchase panel whenever route changes
function closePurchasePanel(){
  var panel = document.getElementById('purchase-panel');
  if (panel){ panel.classList.remove('open'); }
  document.body.classList.remove('purchase-open');
}

function setActive(route){
  navLinks.forEach(function(n){
    n.classList.toggle('active', n.getAttribute('data-route') === route);
  });
  closePurchasePanel();
}

// ======== Basket state (localStorage) ========
var BASKET_KEY = 'gallery_basket_v1';

function loadBasket(){
  try { return JSON.parse(localStorage.getItem(BASKET_KEY)) || []; }
  catch(e){ return []; }
}
function saveBasket(items){
  localStorage.setItem(BASKET_KEY, JSON.stringify(items));
  updateCartCount();
}

// Keep badge text centered inside the circle
function ensureBadgeTextCentered(){
  var textEl = $('#cart-count');
  if (!textEl) return;
  try { textEl.setAttribute('dy', '0'); } catch(e){}
  textEl.setAttribute('dominant-baseline', 'middle');
  textEl.setAttribute('alignment-baseline', 'middle');
}

function updateCartCount(){
  var textEl = $('#cart-count');     // <text> in SVG
  var badgeEl = $('#cart-badge');    // <circle> in SVG
  if (!textEl || !badgeEl) return;

  var items = loadBasket();
  var qty = items.reduce(function(sum, it){ return sum + (it.qty || 1); }, 0);

  textEl.textContent = String(qty);
  ensureBadgeTextCentered();

  if (qty > 0) {
    badgeEl.classList.remove('hidden');
    textEl.classList.remove('hidden');
  } else {
    badgeEl.classList.add('hidden');
    textEl.classList.add('hidden');
  }
}

function addToBasket(entry){
  var items = loadBasket();
  var idx = items.findIndex(function(it){
    return it.id===entry.id && it.size===entry.size && it.paper===entry.paper && it.kind===entry.kind;
  });
  if (idx >= 0) {
    items[idx].qty += entry.qty;
  } else {
    // Save a usable thumbnail along with the item
    items.push({
      ...entry,
      thumb: entry.thumb || entry.src || entry.context1 || entry.image || ''
    });
  }
  saveBasket(items);
}

function money(n){ return '£'+Number(n).toFixed(2); }
function round2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100; }

// ======== Pricing ========
// IMPORTANT: Structure is: SIZE -> MATERIAL -> KIND -> PRICE
var PRICING = {
  "92 X 62 cm": { Canvas: { Original: 180.00 } },
  "75 X 50 cm": { Canvas: { Replica: 75.00 } },
  "85 X 55 cm": { Canvas: { Replica: 85.00 } },
  "90 X 60 cm": { Canvas: { Replica: 99.00 } },
  
  "122 X 144 cm": { Canvas: { Original: 850.00 } },
  "70 x 90 cm": { Canvas: { Replica: 130.00 } },
  "80 x 100 cm": { Canvas: { Replica: 85.00 } },
  "100 x 125 cm": { Canvas: { Replica: 99.00 } },
  "120 x 150 cm": { Canvas: { Replica: 110.00 } },
  
  "142 X 112 cm": { Canvas: { Original: 1200.00 } },
  "70 x 55 cm": { Canvas: { Replica: 130.00 } },
  "80 x 60 cm": { Canvas: { Replica: 85.00 } },
  "90 x 70 cm": { Canvas: { Replica: 99.00 } },
  "100 x 75 cm": { Canvas: { Replica: 110.00 } },
  "140 x 105 cm": { Canvas: { Replica: 110.00 } },
  
   "100 X 80 cm": { Canvas: { Original: 750.00 } },
  "100 x 80 cm": { Canvas: { Replica: 180.00 } },
  
  "100 x 100 cm": { Archival B&W Print: { Replica: 130.00 } },
  "80 x 80 cm": { Archival B&W Print: { Replica: 100.00 } },
  "70 x 70 cm": { Archival B&W Print: { Replica: 90.00 } },
  "50 x 50 cm": { Archival B&W Print: { Replica: 60.00 } },
  
  "100 x 100 cm": { Archival Print: { Replica: 130.00 } },
  "80 x 80 cm": { Archival Print: { Replica: 100.00 } },
  "70 x 70 cm": { Archival Print: { Replica: 90.00 } },
  "50 x 50 cm": { Archival Print: { Replica: 60.00 } },
  
  
   "100 x 100 cm": { Canvas: { Replica: 160.00 } },
  "80 x 80 cm": { Canvas: { Replica: 135.00 } },
  "70 x 70 cm": { Canvas: { Replica: 110.00 } },
  "50 x 50 cm": { Canvas: { Replica: 80.00 } },
  
  "30.5 X 61 cm": { Canvas: { Original: 150.00 } },
  "152 X 102 cm": { Canvas: { Original: 1200.00 } }
};

// --- Normalise size keys so "x", "X", and "×" all match ---
function normSizeKey(s){
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/×/g, 'X')
    .replace(/x/ig, 'X');
}
var SIZE_KEYMAP = {};
Object.keys(PRICING).forEach(function(k){
  SIZE_KEYMAP[normSizeKey(k)] = k;
});
function resolveSizeKey(size){
  var nk = normSizeKey(size);
  return SIZE_KEYMAP[nk] || String(size || '').trim();
}

// Defaults used only for populating select lists when an artwork has an options block.
// (We still always compute price via PRICING; if not found, priceFor returns null.)
var SIZES = Object.keys(PRICING);
var MATERIALS = ['Canvas'];
var KINDS = ['Original','Replica'];

function priceFor(size, material, kind){
  if (!size || !material || !kind) return null;
  var sk = resolveSizeKey(size);
  var m  = String(material).trim();
  var k  = String(kind).trim();
  return (PRICING[sk] && PRICING[sk][m]) ? PRICING[sk][m][k] : null;
}

// ======== Static pages ========
function renderHome(){
  app.innerHTML = '<section class="section"><h1>Welcome</h1><p>A minimalist, modern gallery of display art spanning five decades. Click Gallery to explore and purchase prints.</p></section>';
}
function renderAbout(){
  app.innerHTML = '<section class="section"><h1>About the Artist</h1><div class="prose"><p>Some projects began decades ago and were completed much later — life in between. This site presents that journey through images.</p></div></section>';
}
function renderContact(){
  app.innerHTML = '<section class="section"><h1>Contact</h1><p>Email: <a href="mailto:you@example.com">you@example.com</a></p></section>';
}



// ======== API helpers ========
function fetchJSON(url){
  return fetch(url, { cache:'no-store' }).then(function(res){
    if (!res.ok) throw new Error('Failed: ' + url);
    return res.json();
  });
}

// Always load from the local artworks.json file at project root
function fetchArtworks(){ 
  return fetch('./artworks.json', { cache: 'no-store' })
    .then(function(res){
      if (!res.ok) throw new Error('Failed to load artworks.json');
      return res.json();
    });
}

function fetchArtworkDetail(id){ 
  return fetchArtworks().then(function(list){
    return list.find(function(a){ return a.id === id; }) || null;
  });
}



// ======== FILTERS (tags) ========
var ALL_ARTWORKS = [];
var ALL_TAGS = [];              // [{low, disp}]
var SELECTED_TAGS = new Set();  // lowercase

function computeAllTags(list){
  var map = {}; // low -> disp
  list.forEach(function(a){
    (a.tags || []).forEach(function(t){
      var disp = String(t).trim();
      if (!disp) return;
      var low = disp.toLowerCase();
      if (!map[low]) map[low] = disp;
    });
  });
  return Object.keys(map).map(function(low){ return { low: low, disp: map[low] }; });
}

// OR logic
function filterArtworks_OR(){
  if (!SELECTED_TAGS.size) return ALL_ARTWORKS.slice();
  return ALL_ARTWORKS.filter(function(a){
    var aTagsLow = new Set((a.tags || []).map(function(t){ return String(t).toLowerCase(); }));
    var match = false;
    SELECTED_TAGS.forEach(function(need){ if (aTagsLow.has(need)) match = true; });
    return match;
  });
}

// Render only the grid (panel stays)
function renderGridInto(gridEl){
  var list = filterArtworks_OR();
  if (!list.length){
    gridEl.innerHTML = '<p class="sub">No matches. Clear or change your filters.</p>';
    return;
  }
  gridEl.innerHTML = list.map(function(a){
    var thumb  = a.thumb || a.src;
    var small  = bust(thumb);
    var big    = bust(a.src);
    var srcset = a.thumb ? (small + ' 480w, ' + big + ' 1200w') : (big + ' 1200w');
    return [
      '<article class="card" data-id="',a.id,'">',
        '<img ',
          'src="',small,'" ',
          'srcset="',srcset,'" ',
          'sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" ',
          'alt="',escapeHtml(a.title),'" ',
          'loading="lazy" decoding="async" />',
        '<div class="meta"><div class="title">',escapeHtml(a.title),'</div></div>',
      '</article>'
    ].join('');
  }).join('');

  $all('.card', gridEl).forEach(function(card){
    card.addEventListener('click', function(){
      var id = card.getAttribute('data-id');
      setActive('gallery');
      renderItem(id);
      history.pushState({ route:'item', id:id }, '', '#/item/'+id);
    });
  });

  $all('img', gridEl).forEach(function(img){
    img.addEventListener('error', function(){ img.src = 'https://picsum.photos/seed/placeholder/900/700'; });
  });
}

// Filter controls UI
function renderFilterControls(wrapper, gridEl){
  var btn = document.createElement('button');
  btn.id = 'filter-toggle';
  btn.type = 'button';
  btn.className = 'btn-filter';
  btn.setAttribute('aria-label', 'Filter');
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<line x1="3" y1="6" x2="21" y2="6"/>' +
      '<circle cx="9" cy="6" r="2"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<circle cx="15" cy="12" r="2"/>' +
      '<line x1="3" y1="18" x2="21" y2="18"/>' +
      '<circle cx="12" cy="18" r="2"/>' +
    '</svg>';

  var panel = document.createElement('div');
  panel.id = 'filter-panel';
  panel.className = 'filter-panel';
  panel.hidden = true;

  var inner = ['<div class="filter-grid">'];
  if (ALL_TAGS.length){
    ALL_TAGS.forEach(function(t){
      var id = 'tag-'+t.low.replace(/[^a-z0-9]+/g,'-');
      var checked = SELECTED_TAGS.has(t.low) ? ' checked' : '';
      inner.push(
        '<label for="'+id+'" class="tagcheck">',
          '<input id="'+id+'" type="checkbox" value="'+t.low+'"'+checked+'>',
          '<span>'+t.disp+'</span>',
        '</label>'
      );
    });
  } else {
    inner.push('<div class="sub">No tags are available yet.</div>');
  }
  inner.push('</div>',
             '<div class="filter-actions">',
               '<button type="button" class="filter-clear">Clear</button>',
               '<button type="button" class="filter-close">Close</button>',
             '</div>');
  panel.innerHTML = inner.join('');

  btn.addEventListener('click', function(){
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  });

  panel.addEventListener('change', function(e){
    var cb = e.target && e.target.closest && e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    if (cb.checked) SELECTED_TAGS.add(cb.value);
    else SELECTED_TAGS.delete(cb.value);
    renderGridInto(gridEl);
  });

  panel.querySelector('.filter-clear').addEventListener('click', function(){
    SELECTED_TAGS.clear();
    $all('input[type="checkbox"]', panel).forEach(function(x){ x.checked = false; });
    renderGridInto(gridEl);
  });
  panel.querySelector('.filter-close').addEventListener('click', function(){
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(panel);
}

// ======== Gallery ========
function renderGallery(){
  app.innerHTML = [
    '<section class="section">',
    '<h1 class="hidden">Gallery</h1>',
    '<div id="filters"></div>',
    '<div class="gallery" id="gallery"></div>',
    '</section>'
  ].join('');

  var grid = $('#gallery');
  var filtWrap = $('#filters');

  (function init(){
    var p = Promise.resolve();
    if (!ALL_ARTWORKS.length){
      p = fetchArtworks().then(function(list){
        ALL_ARTWORKS = list || [];
        ALL_TAGS = computeAllTags(ALL_ARTWORKS);
      });
    }
    p.then(function(){
      filtWrap.innerHTML = '';
      renderFilterControls(filtWrap, grid);
      renderGridInto(grid);
    }).catch(function(err){
      grid.innerHTML = '<p class="sub">Error loading artworks: '+err.message+'</p>';
    });
  })();
}

// ======== Item detail (hero + media bar + purchase panel) ========

function renderItem(id){

  app.innerHTML = '<section class="section"><div class="hero-wrap"><button class="hero-nav prev" id="hero-prev" aria-label="Previous">‹</button><div id="hero" class="hero-media"></div><button class="hero-nav next" id="hero-next" aria-label="Next">›</button><div class="media-bar"><div class="thumb-strip" id="thumb-strip"></div><button id="purchase-btn" class="btn-purchase" type="button">Purchase</button></div></div></section>';

  var hero = $('#hero');
  var strip = $('#thumb-strip');
  var purchaseBtn = $('#purchase-btn');

  // Prev/Next buttons
  var prevBtn = $('#hero-prev');
  var nextBtn = $('#hero-next');

  function nav(delta){
    var listPromise = (typeof ALL_ARTWORKS !== 'undefined' && ALL_ARTWORKS.length)
      ? Promise.resolve(ALL_ARTWORKS)
      : fetchArtworks().then(function(l){ ALL_ARTWORKS = l || []; return ALL_ARTWORKS; });

    listPromise.then(function(list){
      var i = list.findIndex(function(a){ return a.id === id; });
      if (i === -1 || !list.length) return;
      var j = (i + delta + list.length) % list.length;
      var nextId = list[j].id;

      setActive('item');
      renderItem(nextId);
      history.pushState({ route:'item', id: nextId }, '', '#/item/'+nextId);
    });
  }

  if (prevBtn) prevBtn.addEventListener('click', function(){ nav(-1); });
  if (nextBtn) nextBtn.addEventListener('click', function(){ nav(1); });

  // Keep reference so Purchase works even if user clicks fast
  var detailData = null;

  fetchArtworkDetail(id).then(function(data){

    try {
      console.log(
        '[media keys] ',
        'context1:', !!data.context1, '| context_1:', !!data.context_1, '||',
        'context2:', !!data.context2, '| context_2:', !!data.context_2, '||',
        'context3:', !!data.context3, '| context_3:', !!data.context_3, '||',
        'context4:', !!data.context4, '| context_4:', !!data.context_4, '||',
        'context5:', !!data.context5, '| context_5:', !!data.context_5, '||',
        'context6:', !!data.context6, '| context_6:', !!data.context_6, '||',
        'src:', !!data.src, 'video:', !!data.video
      );
    } catch (e) {}

    detailData = data;

    /* ========= MEDIA STRIP (use JSON fields only) ========= */
    strip.innerHTML = '';

    (function(){
      // Collect media strictly from JSON keys (no filename probing)
      var images = [];
      if (data.src) images.push(String(data.src));          // lead with the hero
      for (var i = 1; i <= 6; i++) {
        var key = 'context' + i;
        if (data[key]) images.push(String(data[key]));
      }

      // Build the items list: images → optional video → description
      var items = images.map(function(src, i){
        return { type:'img', src: src, title:'Image '+(i+1), active: i===0 };
      });
      if (data.video) items.push({ type:'vid', src: String(data.video), title:'Video' });
      items.push({ type:'desc', text:(data.description||''), title:'Description' });

      function showImage(src, alt){
        hero.innerHTML = '<img src="'+bust(src)+'" alt="'+escapeHtml(data.title||alt||"")+'" loading="eager" decoding="async">';
        var img = $('img', hero);
        if (img){
          img.addEventListener('click', function(){ openLightbox(src, alt || data.title || ''); });
          img.addEventListener('error', function(){ img.src = 'https://picsum.photos/seed/placeholder/1200/900'; });
        }
      }
      function showVideo(src){
        hero.innerHTML = '<video src="'+src+'" class="paper-video" controls playsinline preload="metadata"></video>';
        var v = $('video', hero);
        if (v){ try { v.play().catch(function(){}); } catch(e){} }
      }
      function showDesc(text){
        hero.innerHTML = '<div class="hero-desc">'+escapeHtml(text||'')+'</div>';
      }

      // Render thumbs + initial hero
      items.forEach(function(it, idx){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb' + (it.active ? ' active' : '');
        btn.setAttribute('aria-label', it.title);

        if (it.type === 'img'){
          btn.innerHTML = '<img src="'+bust(it.src)+'" alt="" loading="lazy">';
          btn.addEventListener('click', function(){
            $all('.thumb', strip).forEach(function(t){ t.classList.remove('active'); });
            btn.classList.add('active');
            showImage(it.src, it.title);
          });
        } else if (it.type === 'vid'){
          btn.innerHTML = '<span class="thumb-icon thumb-icon-video">▶︎</span>';
          btn.addEventListener('click', function(){
            $all('.thumb', strip).forEach(function(t){ t.classList.remove('active'); });
            btn.classList.add('active');
            showVideo(it.src);
          });
        } else {
          btn.innerHTML = '<span class="thumb-icon thumb-icon-desc">i</span>';
          btn.addEventListener('click', function(){
            $all('.thumb', strip).forEach(function(t){ t.classList.remove('active'); });
            btn.classList.add('active');
            showDesc(it.text||'');
          });
        }

        strip.appendChild(btn);

        // initial hero
        if (idx === 0){
          if (it.type === 'img') showImage(it.src, it.title);
          else if (it.type === 'vid') showVideo(it.src);
          else showDesc(it.text||'');
        }
      });

      try { console.log('[media] using JSON fields only'); } catch(_){}
    })();
    /* ========= /MEDIA STRIP ========= */

    // --- Purchase panel (DOM; styles via CSS) ---
    function ensurePurchaseUI(){
      var panel = document.getElementById('purchase-panel');
      if (!panel){
        panel = document.createElement('aside');
        panel.id = 'purchase-panel';
        panel.className = 'purchase-panel';
        panel.innerHTML =
          '<header class="purchase-head">' +
            '<strong class="purchase-title">Purchase Options</strong>' +
            '<button id="purchase-close" class="purchase-close" type="button" aria-label="Close">×</button>' +
          '</header>' +
          '<div id="purchase-body" class="purchase-body"></div>';
        document.body.appendChild(panel);
      }
      return panel;
    }

    function selectHtml(label, id, options){
      var html = [
        '<div class="purchase-field">',
          '<label class="purchase-label" for="'+id+'">'+label+'</label>',
          '<select id="'+id+'" class="purchase-select">',
            '<option value="">Select…</option>'
      ];
      options.forEach(function(opt){
        var v = String(opt);
        html.push('<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>');
      });
      html.push('</select>','</div>');
      return html.join('');
    }

    function renderOptions(panel, sizes, materials, kinds){
      var body = panel.querySelector('#purchase-body');
      if (!body) return;
      body.innerHTML =
        '<div class="purchase-stack">' +
          selectHtml('Size', 'opt-size', sizes) +
          selectHtml('Material', 'opt-material', materials) +
          selectHtml('Extras', 'opt-kind', kinds) +
          '<div class="purchase-row qty-row">' +
            '<label class="purchase-label" for="qty">Qty</label>' +
            '<div class="qty-control">' +
              '<input id="qty" class="purchase-qty" type="number" min="1" value="1">' +
              '<div class="qty-buttons">' +
                '<button class="qtybtn" data-act="inc" type="button" aria-label="Increase">+</button>' +
                '<button class="qtybtn" data-act="dec" type="button" aria-label="Decrease">−</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="price-row" class="purchase-price-row">Price: <strong id="price-value">—</strong></div>' +
          '<div class="purchase-actions">' +
            '<button id="add-to-cart" class="btn-primary" type="button" disabled>Add to basket</button>' +
          '</div>' +
        '</div>';
    }

    function getSelection(){
      var size = ($('#opt-size')||{}).value || '';
      var material = ($('#opt-material')||{}).value || '';
      var kind = ($('#opt-kind')||{}).value || '';
      var qty = Math.max(1, Number($('#qty') ? $('#qty').value : 1) || 1);
      return { size:size, material:material, kind:kind, qty:qty };
    }

    function updatePriceAndButton(){
      var sel = getSelection();
      var priceEl = $('#price-value');
      var btn = $('#add-to-cart');
      var choseAll = !!sel.size && !!sel.material && !!sel.kind;
      var unit = priceFor(sel.size, sel.material, sel.kind);
      if (choseAll && typeof unit === 'number'){
        var total = round2(unit * Math.max(1, Number(sel.qty) || 1));
        priceEl.textContent = money(total);
        btn.disabled = false;
      } else {
        priceEl.textContent = '—';
        btn.disabled = true;
      }
    }

    function openPurchasePanelUsing(dataRef){
      if (!dataRef) return;

      var opts = dataRef.options || {};

      // Use the item’s allowed lists, but we will FILTER the "kinds" list dynamically
      var sizes     = Array.isArray(opts.sizes)     && opts.sizes.length     ? opts.sizes.slice()     : SIZES.slice();
      var materials = Array.isArray(opts.materials) && opts.materials.length ? opts.materials.slice() : MATERIALS.slice();
      var kindsAll  = Array.isArray(opts.kinds)     && opts.kinds.length     ? opts.kinds.slice()     : KINDS.slice();

      var panel = ensurePurchaseUI();
      renderOptions(panel, sizes, materials, kindsAll);

      // --- NEW: filter kinds based on selected size+material and PRICING ---
      function setSelectOptions(selectEl, values){
        if (!selectEl) return;
        var current = selectEl.value;
        var html = '<option value="">Select…</option>';
        values.forEach(function(v){
          var s = String(v);
          html += '<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>';
        });
        selectEl.innerHTML = html;

        // Keep previous selection only if it still exists
        if (values.indexOf(current) >= 0){
          selectEl.value = current;
        } else {
          selectEl.value = '';
        }
      }

      function pricedKindsFor(size, material){
        if (!size || !material) return [];
        var sk = resolveSizeKey(size);
        var m = String(material).trim();
        var bucket = (PRICING[sk] && PRICING[sk][m]) ? PRICING[sk][m] : null;
        if (!bucket) return [];
        return Object.keys(bucket);
      }

      function refreshKindDropdown(){
        var sizeSel = $('#opt-size');
        var matSel  = $('#opt-material');
        var kindSel = $('#opt-kind');
        if (!kindSel) return;

        var chosenSize = sizeSel ? sizeSel.value : '';
        var chosenMat  = matSel ? matSel.value : '';

        // Intersection: (item's allowed kinds) ∩ (priced kinds for chosen size+material)
        var priced = pricedKindsFor(chosenSize, chosenMat);
        var nextKinds = kindsAll.filter(function(k){ return priced.indexOf(String(k)) >= 0; });

        // If size/material not chosen yet, show all allowed kinds (so the UI doesn't look empty)
        if (!chosenSize || !chosenMat) nextKinds = kindsAll.slice();

        setSelectOptions(kindSel, nextKinds);
      }

      function wireOptionEvents(){
        var s1 = $('#opt-size'), s2 = $('#opt-material'), s3 = $('#opt-kind'), qty = $('#qty');

        if (s1) s1.addEventListener('change', function(){
          refreshKindDropdown();
          updatePriceAndButton();
        });
        if (s2) s2.addEventListener('change', function(){
          refreshKindDropdown();
          updatePriceAndButton();
        });
        if (s3) s3.addEventListener('change', updatePriceAndButton);

        if (qty) qty.addEventListener('input', function(){
          if (Number(qty.value) < 1) qty.value = 1;
          updatePriceAndButton();
        });

        var panel = document.getElementById('purchase-panel');
        if (panel){
          panel.addEventListener('click', function(e){
            var btn = e.target && e.target.closest && e.target.closest('.qtybtn');
            if (!btn) return;
            var input = document.getElementById('qty');
            if (!input) return;
            var val = Math.max(1, Number(input.value) || 1);
            if (btn.getAttribute('data-act') === 'inc') val++;
            if (btn.getAttribute('data-act') === 'dec') val = Math.max(1, val - 1);
            input.value = val;
            updatePriceAndButton();
          });
        }
      }

      function wireAddToCart(dataRef, sizes, materials, kinds){
        var btn = $('#add-to-cart');
        if (!btn) return;
        btn.addEventListener('click', function(){
          var sel = getSelection();
          var unit = priceFor(sel.size, sel.material, sel.kind);
          if (typeof unit !== 'number') return;

          addToBasket({
            id: dataRef.id,
            title: dataRef.title,
            thumb: dataRef.context1 || dataRef.src || '',
            src: dataRef.src || '',
            size: sel.size,
            paper: sel.material,
            kind: sel.kind,
            qty: sel.qty,
            options: { sizes: sizes.slice(), materials: materials.slice(), kinds: kinds.slice() },
            pricing: (dataRef.pricing || PRICING),
            unitPrice: round2(unit)
          });

          updateCartCount();
          try { btn.textContent = 'Added!'; setTimeout(function(){ btn.textContent = 'Add to basket'; }, 900); } catch(_){}
        });
      }

      wireOptionEvents();
      wireAddToCart(dataRef, sizes, materials, kindsAll);

      // Apply initial filtering once panel opens
      refreshKindDropdown();
      updatePriceAndButton();

      document.body.classList.add('purchase-open');
      panel.classList.add('open');

      var closeBtn = panel.querySelector('#purchase-close');
      function close(){
        panel.classList.remove('open');
        document.body.classList.remove('purchase-open');
      }
      if (closeBtn) closeBtn.onclick = close;
      document.addEventListener('keydown', function esc(e){
        if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); }
      });
    }

    // Wire button immediately (works even before data arrives thanks to detailData)
    purchaseBtn.addEventListener('click', function(){
      openPurchasePanelUsing(detailData);
    });

  }).catch(function(err){
    var hero = $('#hero');
    if (hero) hero.innerHTML = '<div class="hero-desc">Couldn’t load this item.</div>';
    try { console.error('renderItem error:', err); } catch(_){}
  });
}



// ======== Cart ========
function renderCart(){
  var items = loadBasket();

  // helpers
  function priceForCartSnapshot(it){
    var p = it && it.pricing;
    if (p && p[it.size] && p[it.size][it.paper] && typeof p[it.size][it.paper][it.kind] === 'number'){
      return Number(p[it.size][it.paper][it.kind]);
    }
    return priceFor(it.size, it.paper, it.kind);
  }
  function unitPriceForCartRow(it){
    var u = priceForCartSnapshot(it);
    if (typeof u !== 'number' || isNaN(u)) u = Number(it.unitPrice || 0);
    return round2(u);
  }
  function opts(list, selected){
    return (list || []).map(function(v){
      var s = String(v);
      return '<option value="'+s.replace(/"/g,'&quot;')+'"'
           + (s === selected ? ' selected' : '')
           + '>' + s + '</option>';
    }).join('');
  }

  // rows (div-based, not table)
  var rows = items.map(function(it, idx){
    var unit = unitPriceForCartRow(it);
    var qty  = Math.max(1, Number(it.qty) || 1);
    var line = round2(unit * qty);

    var sizes     = (it.options && it.options.sizes)     || SIZES;
    var materials = (it.options && it.options.materials) || MATERIALS;
    var kinds     = (it.options && it.options.kinds)     || KINDS;

    return [
      '<div class="cart-row" data-idx="',idx,'">',

        // ITEM
        '<div class="col-item">',
          '<a href="#/item/', it.id, '" class="cart-thumb">',
            '<img src="', escapeHtml(it.thumb || it.src || ''), '" alt="', escapeHtml(it.title), '">',
          '</a>',
          '<strong class="cart-title">', escapeHtml(it.title), '</strong>',
        '</div>',

        // SIZE
        '<div class="col-size">',
          '<select class="cart-opt cart-size">', opts(sizes, it.size), '</select>',
        '</div>',

        // MATERIAL
        '<div class="col-material">',
          '<select class="cart-opt cart-material">', opts(materials, it.paper), '</select>',
        '</div>',

        // EXTRAS
        '<div class="col-extras">',
          '<select class="cart-opt cart-kind">', opts(kinds, it.kind), '</select>',
        '</div>',

        // UNIT
        '<div class="col-unit num">', money(unit), '</div>',

        // QTY
        '<div class="col-qty">',
          '<div class="qtycell">',
            '<button class="qtybtn" data-act="dec">−</button>',
            '<input class="qtyinput" type="number" min="1" value="', qty, '">',
            '<button class="qtybtn" data-act="inc">+</button>',
          '</div>',
        '</div>',

        // TOTAL
        '<div class="col-total num">', money(line), '</div>',

        // REMOVE
        '<div class="col-remove"><button class="link danger" data-act="rm">Remove</button></div>',

      '</div>'
    ].join('');
  }).join('');

  var subtotal = round2(items.reduce(function(s, it){
    var unit = unitPriceForCartRow(it);
    var qty  = Math.max(1, Number(it.qty) || 1);
    return s + round2(unit * qty);
  }, 0));

  // render (no table)
  app.innerHTML = [
    '<section class="section"><h1>Basket</h1>',
      items.length ? [
        '<div class="cartwrap">',

          // Independent, absolutely-positioned headers
          '<div class="cart-headers">',
            '<div class="h-item">Item</div>',
            '<div class="h-size">Size</div>',
            '<div class="h-material">Material</div>',
            '<div class="h-extras">Extras</div>',
            '<div class="h-unit">Price</div>',
            '<div class="h-qty">Quantity</div>',
            '<div class="h-total">Total</div>',
            '<div class="h-remove"></div>',
          '</div>',

          // Rows container (free layout)
          '<div class="cart-rows">', rows, '</div>',

          '<div class="cartsum"><div>Subtotal: <strong>', money(subtotal), '</strong></div>',
          '<div class="sub">Taxes &amp; shipping calculated at checkout.</div></div>',

          '<div id="paypal-button-container"></div>',
          '<div id="paypal-fallback" class="sub" style="display:none">PayPal button unavailable. Check your Client ID in <code>index.html</code>.</div>',
        '</div>'
      ].join('') : '<p class="sub">Your basket is empty.</p>',
    '</section>'
  ].join('');

  if (!items.length) { updateCartCount(); return; }

  // Events on .cart-rows
  var rowsEl = $('.cart-rows', app);

  // inc/dec/remove & navigate
  rowsEl.addEventListener('click', function(e){
    var btn = e.target && e.target.closest && e.target.closest('button');
    if (btn){
      var row = btn.closest('.cart-row');
      var idx = Number(row.getAttribute('data-idx'));
      var act = btn.getAttribute('data-act');
      var list = loadBasket();
      if (act === 'rm') list.splice(idx, 1);
      else if (act === 'inc') list[idx].qty = Math.max(1, Number(list[idx].qty) || 1) + 1;
      else if (act === 'dec') list[idx].qty = Math.max(1, (Number(list[idx].qty) || 1) - 1);
      saveBasket(list);
      renderCart();
      return;
    }
    var a = e.target && e.target.closest && e.target.closest('a.cart-thumb');
    if (a){
      e.preventDefault();
      var row = a.closest('.cart-row');
      var idx = Number(row.getAttribute('data-idx'));
      var list = loadBasket();
      var itm = list[idx];
      if (itm){
        setActive('item');
        renderItem(itm.id);
        history.pushState({ route:'item', id: itm.id }, '', '#/item/'+itm.id);
      }
    }
  });

  // qty direct edit
  rowsEl.addEventListener('input', function(e){
    var input = e.target && e.target.closest && e.target.closest('input.qtyinput');
    if (!input) return;
    var row = input.closest('.cart-row');
    var idx = Number(row.getAttribute('data-idx'));
    var list = loadBasket();
    var v = Math.max(1, Number(input.value) || 1);
    list[idx].qty = v;
    saveBasket(list);
    renderCart();
  });

  // inline option edits
  rowsEl.addEventListener('change', function(e){
    var sel = e.target && e.target.closest && e.target.closest('.cart-opt');
    if (!sel) return;
    var row  = sel.closest('.cart-row');
    var idx  = Number(row.getAttribute('data-idx'));
    var list = loadBasket();
    var it   = list[idx]; if (!it) return;

    if (sel.classList.contains('cart-size'))      it.size  = sel.value;
    else if (sel.classList.contains('cart-material')) it.paper = sel.value;
    else if (sel.classList.contains('cart-kind')) it.kind  = sel.value;

    var unit = priceFor(it.size, it.paper, it.kind);
    if (typeof unit !== 'number') unit = Number(it.unitPrice || 0);
    it.unitPrice = round2(unit);

    saveBasket(list);
    renderCart();
  });

  // PayPal (unchanged)
  var buttonContainer = $('#paypal-button-container');
  var fallback = $('#paypal-fallback');
  if (typeof window.paypal === 'undefined'){ fallback.style.display='block'; return; }

  var fresh = loadBasket();
  var itemsForPayPal = fresh.map(function(it){
    var unit = priceFor(it.size, it.paper, it.kind);
    if (typeof unit !== 'number') unit = Number(it.unitPrice || 0);
    unit = round2(unit);
    return {
      name: String(it.title).slice(0,127),
      description: (it.size+' / '+it.paper+' / '+it.kind).slice(0,127),
      sku: (it.id+'-'+it.size+'-'+it.paper+'-'+it.kind).toLowerCase().replace(/\s+/g,'-').slice(0,127),
      category: 'PHYSICAL_GOODS',
      unit_amount: { currency_code:'GBP', value: unit.toFixed(2) },
      quantity: String(Math.max(1, Number(it.qty) || 1))
    };
  });
  var itemsTotal = round2(itemsForPayPal.reduce(function(s, it){
    return s + Number(it.unit_amount.value) * Number(it.quantity);
  }, 0));

  window.paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYPAL,
    style: { layout:'vertical', color:'gold', shape:'rect', label:'paypal' },
    createOrder: function(data, actions){
      if (!itemsForPayPal.length || itemsTotal <= 0){ alert('Your basket is empty.'); return; }
      return actions.order.create({
        intent: 'CAPTURE',
        application_context: { brand_name:'Gallery Shop', user_action:'PAY_NOW', shipping_preference:'GET_FROM_FILE' },
        purchase_units: [{
          description: 'Art prints and products',
          amount: {
            currency_code:'GBP',
            value: itemsTotal.toFixed(2),
            breakdown: {
              item_total: { currency_code:'GBP', value: itemsTotal.toFixed(2) },
              shipping:   { currency_code:'GBP', value: '0.00' },
              tax_total:  { currency_code:'GBP', value: '0.00' },
              discount:   { currency_code:'GBP', value: '0.00' }
            }
          },
          items: itemsForPayPal
        }]
      });
    },
    onApprove: function(data, actions){
      return actions.order.capture().then(function(details){
        saveBasket([]); updateCartCount();
        var payer = (details && details.payer && details.payer.name) ? (details.payer.name.given_name||'')+' '+(details.payer.name.surname||'') : 'Customer';
        var email = details && details.payer ? (details.payer.email_address || '') : '';
        var orderId = details && details.id ? details.id : '(no id)';
        app.innerHTML = '<section class="section"><h1>Thank you, '+payer.trim()+'!</h1><p>Your PayPal payment was captured successfully.</p><p class="sub">Order ID: <code>'+orderId+'</code>'+(email? ' • Receipt sent to <strong>'+email+'</strong>':'')+'</p><p><a href="#/gallery" class="nav-link" data-route="gallery">Continue browsing</a></p></section>';
      }).catch(function(err){
        app.innerHTML = '<section class="section"><h1>Payment issue</h1><p>Something went wrong capturing the payment.</p><p class="sub">'+String(err)+'</p><p><a href="#/cart" class="nav-link" data-route="cart">Return to basket</a></p></section>';
      });
    },
    onError: function(err){
      if (fallback) fallback.style.display='block';
      try { console.error('PayPal error:', err); } catch(e){}
    }
  }).render(buttonContainer);
}

// ======== Lightbox ========
var lightbox = $('#lightbox');
var lightboxImg = $('#lightbox-img');
var zoomInBtn = $('#zoom-in');
var zoomOutBtn = $('#zoom-out');
var zoom = 1;

function openLightbox(src, alt){
  lightboxImg.src = src; lightboxImg.alt = alt || '';
  zoom = 1; applyZoom();
  if (lightbox) lightbox.setAttribute('aria-hidden','false');
}
function closeLightbox(){
  if (!lightbox) return;
  lightbox.setAttribute('aria-hidden','true');
  if (lightboxImg) lightboxImg.src='';
}
function applyZoom(){
  var zoomLevelEl = $('#zoom-level');
  if (lightboxImg) lightboxImg.style.transform = 'scale('+zoom+')';
  if (zoomLevelEl) zoomLevelEl.textContent = Math.round(zoom*100)+'%';
}

var lbClose = $('.lightbox-close');
if (lbClose) lbClose.addEventListener('click', closeLightbox);
if (lightbox) lightbox.addEventListener('click', function(e){ if (e.target === lightbox) closeLightbox(); });
if (zoomInBtn) zoomInBtn.addEventListener('click', function(){ zoom = Math.min(zoom+0.25,5); applyZoom(); });
if (zoomOutBtn) zoomOutBtn.addEventListener('click', function(){ zoom = Math.max(0.25, zoom-0.25); applyZoom(); });
if (lightbox) lightbox.addEventListener('wheel', function(e){
  e.preventDefault();
  var delta = Math.sign(e.deltaY);
  zoom = delta>0 ? Math.max(0.5, zoom-0.1) : Math.min(5, zoom+0.1);
  applyZoom();
}, { passive:false });

// ======== Helpers ========
function bust(u){
  if (!u) return u;
  var sep = u.indexOf('?') === -1 ? '?' : '&';
  return u + sep + 'v=' + (window.__VER__ || Date.now());
}
function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// ======== Boot ========
(function boot(){
  try {
    ensureBadgeTextCentered();
    updateCartCount();

    var rp = getHashRoute();
    var route = rp[0], param = rp[1];
    if (routes[route]) {
      setActive(route);
      routes[route](param);
    } else {
      setActive('gallery');
      renderGallery();
    }
  } catch (e){
    try { setActive('gallery'); renderGallery(); } catch(_) {}
  }
})();