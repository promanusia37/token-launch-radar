// Token Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders three views with no network: the ranked board (with search and filters), a detail view for
// every protocol (its thesis, the model's working and its farm plan), and the live-token comparables
// the prices come from. Routes live in the hash: #/ is the board, #/p/<slug> a protocol, and the
// board's filters ride along as #/?cat=Lending&tier=watchlist so a filtered view can be linked.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var main = document.getElementById('board');
  if (!DATA || !main) return;

  // ---------- formatting ----------
  function money(n) {
    if (n === null || n === undefined) return '—';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function moneyFull(n) {
    return n === null || n === undefined ? '—' : '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n === null || n === undefined) return '<span class="muted">n/a</span>';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function mult(x) { return x === null || x === undefined ? '—' : x.toFixed(2) + 'x'; }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30.4) + ' mo';
    return (days / 365).toFixed(1) + ' yrs';
  }

  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });
  var categories = [];
  var chains = [];
  DATA.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();

  // ---------- routing ----------
  function parseHash() {
    var h = location.hash.replace(/^#/, '') || '/';
    var q = h.indexOf('?');
    var path = q < 0 ? h : h.slice(0, q);
    var params = {};
    if (q >= 0) {
      h.slice(q + 1).split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { path: path, params: params };
  }
  function boardHash(f) {
    var parts = [];
    ['q', 'cat', 'chain', 'tier', 'sort', 'view'].forEach(function (k) {
      if (f[k]) parts.push(k + '=' + encodeURIComponent(f[k]));
    });
    return '#/' + (parts.length ? '?' + parts.join('&') : '');
  }

  function render() {
    var route = parseHash();
    main.setAttribute('aria-busy', 'true');
    if (route.path.indexOf('/p/') === 0) renderDetail(route.path.slice(3));
    else renderBoard(route.params);
    main.removeAttribute('aria-busy');
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', render);

  // ---------- shared chrome ----------
  function header(active) {
    return (
      '<h1>Token Launch Radar</h1>' +
      '<p class="sub">Every protocol in the snapshot that records no token yet, priced by the protocols ' +
      'that already launched: a launch value implied by comparable market caps, the working shown, and a ' +
      'farm plan for each. An implied value is this board&rsquo;s own model claim, not a prediction that ' +
      'a token will be issued.</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>protocols ranked</span></div>' +
      '<div class="stat"><b>' + DATA.watchlist_size + '</b><span>on the watchlist</span></div>' +
      '<div class="stat"><b>' + DATA.early_size + '</b><span>early, below the floor</span></div>' +
      '<div class="stat"><b>' + money(DATA.total_implied_usd) + '</b><span>total implied value</span></div>' +
      '<div class="stat"><b>' + mult(DATA.global_multiple) + '</b><span>market median, mcap/TVL</span></div>' +
      '<div class="stat"><b>' + esc(DATA.as_of) + '</b><span>snapshot date</span></div>' +
      '</div>' +
      '<div class="tabs" role="tablist">' +
      '<button role="tab" aria-selected="' + (active === 'board') + '" data-go="#/">The board</button>' +
      '<button role="tab" aria-selected="' + (active === 'live') + '" data-go="#/?view=live">Live comparables</button>' +
      '<button role="tab" aria-selected="' + (active === 'model') + '" data-go="#/?view=model">How the pricing works</button>' +
      '</div>'
    );
  }
  function footer() {
    return (
      '<footer>Model <b>' + esc(DATA.model_version) + '</b>, run on the sealed snapshot: ' + esc(DATA.source) + '. ' +
      'The watchlist floor is ' + moneyFull(DATA.floor_usd) + ' of TVL; the board covers all ' + DATA.watchlist_size +
      ' watchlist protocols and adds ' + DATA.early_size + ' pre-token protocols below it. A protocol here ' +
      '<i>records</i> no token in DefiLlama&rsquo;s data; that is not proof it has none. Implied values are ' +
      'the entry&rsquo;s own model output, stated so a reader can disagree with them line by line.</footer>'
    );
  }
  function wireTabs() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-go]'), function (b) {
      b.addEventListener('click', function () { location.hash = b.getAttribute('data-go'); });
    });
  }

  // ---------- the board ----------
  function renderBoard(params) {
    if (params.view === 'live') return renderLive();
    if (params.view === 'model') return renderModel();
    var f = {
      q: params.q || '',
      cat: params.cat || '',
      chain: params.chain || '',
      tier: params.tier || '',
      sort: params.sort || 'implied',
    };
    var html = header('board');
    html +=
      '<div class="controls">' +
      '<label>Search<input type="search" id="f-q" placeholder="Name, slug or chain" value="' + esc(f.q) + '"></label>' +
      '<label>Category<select id="f-cat"><option value="">All categories</option>' +
      categories.map(function (c) { return '<option' + (c === f.cat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Chain<select id="f-chain"><option value="">All chains</option>' +
      chains.map(function (c) { return '<option' + (c === f.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Tier<select id="f-tier">' +
      '<option value="">Watchlist + early</option>' +
      '<option value="watchlist"' + (f.tier === 'watchlist' ? ' selected' : '') + '>Watchlist only</option>' +
      '<option value="early"' + (f.tier === 'early' ? ' selected' : '') + '>Early radar only</option>' +
      '</select></label>' +
      '<label>Sort by<select id="f-sort">' +
      '<option value="implied"' + (f.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
      '<option value="tvl"' + (f.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
      '<option value="multiple"' + (f.sort === 'multiple' ? ' selected' : '') + '>Implied per $ of TVL</option>' +
      '<option value="growth"' + (f.sort === 'growth' ? ' selected' : '') + '>7d TVL change</option>' +
      '<option value="name"' + (f.sort === 'name' ? ' selected' : '') + '>Name</option>' +
      '</select></label>' +
      '</div><div id="board-body"></div>' + footer();
    main.innerHTML = html;
    wireTabs();
    function readFilters() {
      return {
        q: document.getElementById('f-q').value.trim().toLowerCase(),
        cat: document.getElementById('f-cat').value,
        chain: document.getElementById('f-chain').value,
        tier: document.getElementById('f-tier').value,
        sort: document.getElementById('f-sort').value,
      };
    }
    function apply(push) {
      var cur = readFilters();
      if (push) history.replaceState(null, '', boardHash(cur));
      draw(cur);
    }
    ['f-q', 'f-cat', 'f-chain', 'f-tier', 'f-sort'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener('input', function () { apply(true); });
      el.addEventListener('change', function () { apply(true); });
    });
    draw(f);
  }

  function draw(f) {
    var rows = DATA.rows.filter(function (r) {
      if (f.cat && r.category !== f.cat) return false;
      if (f.chain && r.chains.indexOf(f.chain) < 0) return false;
      if (f.tier && r.tier !== f.tier) return false;
      if (f.q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
        if (hay.indexOf(f.q) < 0) return false;
      }
      return true;
    });
    var sorters = {
      implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      multiple: function (a, b) { return b.implied_value_usd / b.tvl_usd - a.implied_value_usd / a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; },
    };
    rows.sort(sorters[f.sort] || sorters.implied);
    var body = document.getElementById('board-body');
    if (rows.length === 0) {
      body.innerHTML = '<div class="panel empty">No protocol matches those filters. Loosen one and the board refills.</div>';
      return;
    }
    var html = '<p class="count">Showing ' + rows.length + ' of ' + DATA.board_size + ' ranked protocols. Click a row for its thesis, the model&rsquo;s working and its farm plan.</p>';
    html += '<table><thead><tr>' +
      '<th class="num">#</th><th>Protocol</th><th class="hideS">Category</th><th class="hideS">Chains</th>' +
      '<th class="num">TVL</th><th class="num">7d</th><th class="num hideS">Priced at</th><th class="num">Implied value</th><th class="num hideS">Per $ TVL</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html +=
        '<tr class="rowlink" data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span> <span class="badge ' + (r.tier === 'watchlist' ? 'watch' : 'early') + '">' +
        (r.tier === 'watchlist' ? 'watchlist' : 'early') + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="hideS">' + esc(r.category || '—') + '</td>' +
        '<td class="hideS">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num hideS">' + mult(r.category_multiple) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num hideS">' + (r.implied_value_usd / r.tvl_usd).toFixed(2) + 'x</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
    Array.prototype.forEach.call(body.querySelectorAll('tr.rowlink'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  // ---------- one protocol ----------
  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) {
      main.innerHTML = header('board') + '<div class="panel empty">No protocol with that slug is on the board. <a href="#/">Back to the board</a>.</div>' + footer();
      wireTabs();
      return;
    }
    var perTvl = (r.implied_value_usd / r.tvl_usd).toFixed(2);
    var html = header('board');
    html += '<button class="back" id="back">&larr; Back to the board</button>';
    html += '<h2 style="margin-top:2px">' + esc(r.name) + ' <span class="badge ' + (r.tier === 'watchlist' ? 'watch' : 'early') + '">' +
      (r.tier === 'watchlist' ? 'watchlist' : 'early radar') + '</span></h2>';
    html += '<p class="thesis">' + esc(r.thesis) + '</p>';
    html += '<div class="kv">' +
      '<div><b>' + moneyFull(r.implied_value_usd) + '</b><span>implied launch value</span></div>' +
      '<div><b>' + moneyFull(r.tvl_usd) + '</b><span>TVL in the snapshot</span></div>' +
      '<div><b>' + perTvl + 'x</b><span>implied per $ of TVL</span></div>' +
      '<div><b>#' + r.rank + '</b><span>rank of ' + DATA.board_size + '</span></div>' +
      '<div><b>' + ageText(r.age_days) + '</b><span>tracked by DefiLlama</span></div>' +
      '<div><b>' + (r.listed_at || 'unknown') + '</b><span>first tracked</span></div>' +
      '</div>';
    html += '<div class="panel"><h3 style="margin-top:0">How this price is built</h3>' +
      '<table><tbody>' +
      '<tr><td>TVL &times; category multiple (' + esc(r.category || 'uncategorised') + ', ' + r.comps + ' launched comparable' + (r.comps === 1 ? '' : 's') + ')</td><td class="num">' + moneyFull(r.tvl_usd) + ' &times; ' + r.category_multiple.toFixed(2) + 'x</td><td class="num">' + moneyFull(r.base_usd) + '</td></tr>' +
      '<tr><td>&times; growth (7d TVL change ' + (r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%') + ', credited at 35%)</td><td class="num">&times; ' + r.growth_multiplier.toFixed(3) + '</td><td class="num">' + moneyFull(r.base_usd * r.growth_multiplier) + '</td></tr>' +
      '<tr><td>&times; maturity (record length, three years for full credit)</td><td class="num">&times; ' + r.maturity_multiplier.toFixed(3) + '</td><td class="num">' + moneyFull(r.base_usd * r.growth_multiplier * r.maturity_multiplier) + '</td></tr>' +
      '<tr><td>&times; breadth (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ': ' + esc(r.chains.join(', ') || 'none named') + ')</td><td class="num">&times; ' + r.breadth_multiplier.toFixed(3) + '</td><td class="num"><b>' + moneyFull(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="muted">The multiple is the median market-cap/TVL of the category&rsquo;s launched protocols in this same snapshot, ' +
      'shrunk toward the market-wide median (' + mult(DATA.global_multiple) + ') by how few comparables stand behind it, and clamped to 0.03x&ndash;2.50x. ' +
      'Change any constant in <i>How the pricing works</i> and the whole board reprices the same way: no protocol is priced by hand.</p></div>';
    html += '<div class="panel"><h3 style="margin-top:0">Farm plan: what to do before any launch</h3><ol class="steps">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ol><p class="muted">One wallet, real usage, a written log. The plan never asks for a payment to the protocol beyond the position itself, and never a &ldquo;claim fee&rdquo;: anyone charging one is not the protocol.</p></div>';
    html += footer();
    main.innerHTML = html;
    wireTabs();
    document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
  }

  // ---------- live comparables ----------
  function renderLive() {
    var html = header('live');
    html += '<div class="panel"><h3 style="margin-top:0">The comparables: protocols that already trade</h3>' +
      '<p>These are the snapshot&rsquo;s largest launched protocols by market cap. Their market-cap/TVL ratios are the ' +
      'raw material of the board&rsquo;s prices: each category&rsquo;s multiple is the median of its launched members, ' +
      'shrunk toward the market median of ' + mult(DATA.global_multiple) + '. A pre-token protocol is priced as if the ' +
      'market would pay the same rate for its TVL that it pays for theirs.</p></div>';
    html += '<table><thead><tr><th>Protocol</th><th class="hideS">Category</th><th class="num">Market cap</th><th class="num">TVL</th><th class="num">Mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    DATA.live.forEach(function (r) {
      html += '<tr><td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="hideS">' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.mcap_usd) + '</td><td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + mult(r.multiple) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    });
    html += '</tbody></table>' + footer();
    main.innerHTML = html;
    wireTabs();
  }

  // ---------- the model ----------
  function renderModel() {
    var m = DATA.model;
    var html = header('model');
    html += '<div class="panel"><h3 style="margin-top:0">How the pricing works (model ' + esc(DATA.model_version) + ')</h3>' +
      '<p>A token that does not exist yet has no price; what it has is a balance sheet the market already knows how to ' +
      'price, because hundreds of protocols with the same shape have launched. This model takes its multiples from those ' +
      'launches — all of them inside the sealed snapshot, so the board can be rebuilt and checked byte for byte.</p>' +
      '<div class="formula">implied = TVL &times; category multiple &times; growth &times; maturity &times; breadth</div>' +
      '<p><b>Category multiple.</b> For every launched protocol in the snapshot, its ratio is market cap / TVL. A category&rsquo;s ' +
      'multiple is the median of its members&rsquo; ratios, shrunk toward the market-wide median (' + mult(DATA.global_multiple) + ') ' +
      'with weight n/(n+' + m.shrink_k + ') for n comparables, and clamped to ' + m.mult_floor + 'x&ndash;' + m.mult_cap + 'x so one ' +
      'outlier category cannot price a row. A category with no launched member is priced at the market median.</p>' +
      '<p><b>Growth.</b> The 7-day TVL change, clamped to ' + m.growth_floor + '%&hellip;+' + m.growth_cap + '%, moves the price by ' +
      (m.growth_weight * 100) + '% of itself: a hot week is a tailwind, never the story.</p>' +
      '<p><b>Maturity.</b> A protocol tracked for three years earns full credit (' + (m.maturity_floor + m.maturity_range).toFixed(2) + 'x); ' +
      'a brand-new one is discounted to ' + m.maturity_floor + 'x, because a launch is priced on a record, and an unknown age counts as one year.</p>' +
      '<p><b>Breadth.</b> Each chain past the first adds ' + (m.breadth_per_chain * 100) + '% (up to ' + m.breadth_max_chains + ' extra chains): ' +
      'a token launches into every chain the protocol already serves.</p>' +
      '<p><b>What the model refuses to do.</b> It never names a protocol: the same function prices rank 1 and rank ' + DATA.board_size + '. ' +
      'It excludes wrapped, staked and bridged products of tokens that already trade, exchanges and versioned pools of other protocols, ' +
      'on the early rows just as the house does on the watchlist. And it says a protocol <i>records</i> no token — DefiLlama&rsquo;s ' +
      'record is the evidence, not proof.</p></div>';
    html += '<h2>The multiples, category by category</h2><table><thead><tr><th>Category</th><th class="num">Launched comparables</th><th class="num">Median mcap/TVL</th><th class="num">Applied multiple</th></tr></thead><tbody>';
    DATA.comps.forEach(function (c) {
      html += '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.comps + '</td><td class="num">' + mult(c.median_multiple) + '</td><td class="num"><b>' + mult(c.applied_multiple) + '</b></td></tr>';
    });
    html += '</tbody></table>' + footer();
    main.innerHTML = html;
    wireTabs();
  }

  render();
})();
