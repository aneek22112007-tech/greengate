const state = {
  identifier: localStorage.getItem('gg_uid') || crypto.randomUUID(),
  level: sessionStorage.getItem('gg_level') || '',
  slug: null,
  feed: null,
  finished: new Set(),
  stopWatch: null,
};

localStorage.setItem('gg_uid', state.identifier);

const rail = document.querySelector('#rail');
const story = document.querySelector('#story');

function format(number) {
  return Number(number).toFixed(number >= 10 ? 1 : 3);
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-gg-uid': state.identifier },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

async function get(url) {
  const response = await fetch(url, { headers: { 'x-gg-uid': state.identifier } });
  if (!response.ok) throw new Error(`${url} failed`);
  return response.json();
}

function levelQuery() {
  return state.level ? `?level=${encodeURIComponent(state.level)}` : '';
}

function badge(level) {
  const label = level === 'low' ? 'Low' : level === 'high' ? 'High' : 'Moderate';
  return `<span class="badge ${level}">${label}</span>`;
}

function meter(energy) {
  const max = Math.max(energy.alwaysFullWh, 0.001);
  const usedPct = Math.round((energy.usedWh / max) * 100);
  const savedPct = Math.round((energy.savedWh / max) * 100);
  return `
    <div class="meter">
      <div class="meter-label">Estimated energy and CO₂e · ${energy.label}</div>
      <div class="bars">
        <div class="bar-row"><span>This mode</span><div class="track"><div class="fill" style="width:${usedPct}%"></div></div></div>
        <div class="bar-row"><span>Saved</span><div class="track"><div class="fill saved" style="width:${savedPct}%"></div></div></div>
      </div>
      <p class="fine">
        ${format(energy.usedWh)} Wh used · ${format(energy.savedWh)} Wh saved vs always-full ·
        ${format(energy.co2eGrams)} gCO₂e · grid ${energy.intensityGPerKwh} g/kWh
      </p>
    </div>
  `;
}

function renderRail() {
  const decision = state.feed.decision;
  const source = decision.simulated ? 'Simulated' : 'Live Electricity Maps';
  const decided = decision.source === 'flagsmith' ? 'Flagsmith' : decision.source;
  const articles = state.feed.articles
    .map(
      (article) => `
        <li>
          <button type="button" data-slug="${article.slug}" ${article.slug === state.slug ? 'aria-current="true"' : ''}>
            ${article.title}
            <small>${article.section} · ${article.minutes} min</small>
          </button>
        </li>`,
    )
    .join('');
  const dev = state.feed.devTools
    ? `
      <section class="dev">
        <h2>Dev panel</h2>
        <p>Force the carbon level. This is hidden in production. The variant still comes from Flagsmith.</p>
        <div class="dev-row">
          ${['low', 'moderate', 'high']
            .map(
              (level) =>
                `<button type="button" data-level="${level}" aria-pressed="${state.level === level}">${level}</button>`,
            )
            .join('')}
          <button type="button" data-level="">clear</button>
          <button type="button" id="reset-user">Reset user id</button>
        </div>
      </section>`
    : '';
  rail.innerHTML = `
    <section class="panel" aria-label="Carbon">
      <h2>Grid</h2>
      <div class="meta">
        ${badge(decision.carbonLevel)}
        <span class="badge">${decision.variant}</span>
      </div>
      <p class="fine">Zone ${decision.zone} · ${source} · mode ${decision.variant} · decided by ${decided}</p>
      ${meter(state.feed.energy)}
      <p class="fine">Assumptions: 0.3 Wh live summary, 0.05 Wh cached, 0.2 Wh autoplay, default 450 gCO₂/kWh. Estimate only.</p>
    </section>
    ${dev}
    <ol class="article-list">${articles}</ol>
  `;
}

function hero(variant) {
  if (variant === 'full') {
    return `<div class="hero hero-live" aria-label="Autoplay hero"><p>Autoplay · animated stand-in</p></div>`;
  }
  if (variant === 'eco') {
    return `<div class="hero hero-still" aria-label="Static hero"><div class="hill"></div><p>Static image</p></div>`;
  }
  return '';
}

function renderStory(payload) {
  const article = payload.article;
  const variant = payload.decision.variant;
  const summary = payload.summary;
  const paused = variant === 'off';
  const summaryHtml = paused
    ? `<p class="paused">Paused because the grid is dirty right now</p>`
    : `
      <div class="summary">
        <p class="fine">AI Summary · ${summary.cached ? 'cached' : 'live'} · ${summary.label}</p>
        <p>${summary.text}</p>
        <div class="actions">
          <button type="button" class="action" data-vote="up" aria-label="Thumbs up">👍</button>
          <button type="button" class="action" data-vote="down" aria-label="Thumbs down">👎</button>
          <span id="vote-note" class="fine"></span>
        </div>
      </div>`;
  const finished = state.finished.has(article.slug);
  story.innerHTML = `
    <article class="story">
      <p class="fine">${article.section} · ${article.minutes} min read</p>
      <h2>${article.title}</h2>
      <p class="dek">${article.dek}</p>
      ${hero(variant)}
      ${summaryHtml}
      <div class="body">${article.body
        .split(/(?<=[.!?])\s+(?=[A-Z])/)
        .map((paragraph) => `<p>${paragraph}</p>`)
        .join('')}</div>
      <div id="end"></div>
      <div class="actions">
        <button type="button" class="action primary" id="finish" ${finished ? 'disabled' : ''}>I finished reading</button>
        <span id="finish-note" class="done">${finished ? 'Counted' : ''}</span>
      </div>
      <p class="fine">This article's estimate: ${format(payload.energy.usedWh)} Wh, ${format(payload.energy.savedWh)} Wh saved vs always-full. ${payload.energy.label}.</p>
    </article>
  `;
  story.focus();
}

async function track(name, extra) {
  await post('/api/events', { name, identifier: state.identifier, ...extra });
}

async function finish(slug) {
  if (state.finished.has(slug)) return;
  state.finished.add(slug);
  await track('article_completed', { slug, value: 1 });
  const note = document.querySelector('#finish-note');
  const button = document.querySelector('#finish');
  if (note) note.textContent = 'Counted';
  if (button) button.disabled = true;
}

async function openArticle(slug) {
  state.slug = slug;
  renderRail();
  const payload = await get(`/api/articles/${slug}${levelQuery()}`);
  renderStory(payload);
  if (payload.summary) {
    await track('summary_shown', { slug, value: payload.summaryLatencyMs });
  }
  if (state.stopWatch) state.stopWatch();
  const end = document.querySelector('#end');
  if (end) {
    const onScroll = () => {
      if (window.scrollY <= 40) return;
      const rect = end.getBoundingClientRect();
      const visible = rect.top < window.innerHeight && rect.bottom > 0;
      if (!visible) return;
      state.stopWatch?.();
      void finish(slug);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    state.stopWatch = () => {
      window.removeEventListener('scroll', onScroll);
      state.stopWatch = null;
    };
  }
}

async function boot() {
  try {
    await post('/api/session', { identifier: state.identifier });
    state.feed = await get(`/api/feed${levelQuery()}`);
    state.identifier = state.feed.identifier;
    localStorage.setItem('gg_uid', state.identifier);
    if (!state.slug) state.slug = state.feed.articles[0].slug;
    await openArticle(state.slug);
  } catch (error) {
    story.innerHTML = `<p class="error">${error instanceof Error ? error.message : 'The reader failed to load.'}</p>`;
  }
}

rail.addEventListener('click', (event) => {
  const slug = event.target.closest('[data-slug]')?.dataset.slug;
  if (slug) {
    void openArticle(slug);
    return;
  }
  const levelButton = event.target.closest('[data-level]');
  if (levelButton) {
    state.level = levelButton.dataset.level;
    if (state.level) sessionStorage.setItem('gg_level', state.level);
    else sessionStorage.removeItem('gg_level');
    void boot();
    return;
  }
  if (event.target.closest('#reset-user')) {
    state.identifier = crypto.randomUUID();
    localStorage.setItem('gg_uid', state.identifier);
    state.finished.clear();
    void post('/api/session', { identifier: state.identifier }).then(() => boot());
  }
});

story.addEventListener('click', (event) => {
  if (event.target.closest('#finish')) {
    void finish(state.slug);
    return;
  }
  const vote = event.target.closest('[data-vote]')?.dataset.vote;
  if (vote) {
    void track('summary_feedback', { slug: state.slug, value: vote === 'up' ? 1 : 0 }).then(() => {
      const note = document.querySelector('#vote-note');
      if (note) note.textContent = vote === 'up' ? 'Thanks' : 'Noted';
    });
  }
});

void boot();
