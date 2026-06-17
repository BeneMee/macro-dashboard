/* ═══════════════════════════════════════════════
   MACRO MONITOR — MAIN APPLICATION
   ═══════════════════════════════════════════════ */

'use strict';

// ─── STATE ────────────────────────────────────────
const state = {
  selectedCountry: COUNTRIES[0],
  compareCountries: [],
  compareMode: false,
  activeCategory: 'all',
  metricSearch: '',
  manualData: null,
  charts: {},       // chartId → Chart instance
  chartRanges: {},  // chartId → selected range ('5y'|'10y'|'20y'|'max')
};

// ─── CACHE ────────────────────────────────────────
const Cache = {
  key: (id) => `mm_${id}`,
  get(id) {
    try {
      const raw = sessionStorage.getItem(this.key(id));
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CONFIG.CACHE_TTL_MS) { sessionStorage.removeItem(this.key(id)); return null; }
      return data;
    } catch { return null; }
  },
  set(id, data) {
    try { sessionStorage.setItem(this.key(id), JSON.stringify({ ts: Date.now(), data })); } catch {}
  },
};

// ─── UTILITIES ────────────────────────────────────
function toast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function formatValue(val, format, unit) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const n = Number(val);
  switch (format) {
    case 'trillions': return (n / 1e12).toFixed(2) + 'T';
    case 'billions':  return (n / 1e9).toFixed(1) + 'B';
    case 'millions':  return (n / 1e6).toFixed(1) + 'M';
    case 'thousands': return (n / 1e3).toFixed(1) + 'K';
    case 'pct':       return n.toFixed(2);
    default:          return n.toLocaleString();
  }
}

function colorClass(val, colorize) {
  if (!colorize || val === null || val === undefined) return '';
  const n = Number(val);
  if (colorize === 'inv') return n > 5 ? 'negative' : n > 2 ? 'neutral' : 'positive';
  return n > 0 ? 'positive' : n < 0 ? 'negative' : 'neutral';
}

async function fetchWithTimeout(url, ms = CONFIG.API_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(id);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ─── MANUAL DATA ──────────────────────────────────
async function loadManualData() {
  const cached = Cache.get('manual_data');
  if (cached) { state.manualData = cached; return; }
  try {
    const data = await fetchWithTimeout(CONFIG.MANUAL_DATA_URL);
    state.manualData = data;
    Cache.set('manual_data', data);
  } catch (e) {
    state.manualData = {};
    console.warn('Could not load manual-data.json:', e.message);
  }
}

// ─── WORLD BANK API ───────────────────────────────
// Always fetches YEARS_WB years so metric cards and charts share the same cache entry.
// Cache key intentionally excludes `years` — first call wins, always 25 years.
const YEARS_WB = 25;

async function fetchWB(iso3, indicator) {
  const cacheKey = `wb_${iso3}_${indicator}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = `${CONFIG.WORLD_BANK_BASE}/country/${iso3}/indicator/${indicator}?format=json&mrv=${YEARS_WB}&per_page=${YEARS_WB}`;
  try {
    const json = await fetchWithTimeout(url);
    if (!Array.isArray(json) || json.length < 2 || !json[1]) return null;
    const data = json[1]
      .filter(d => d.value !== null)
      .map(d => ({ year: parseInt(d.date), value: d.value }))
      .sort((a, b) => a.year - b.year);
    Cache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`WB fetch failed (${iso3}/${indicator}):`, e.message);
    return null;
  }
}

async function fetchWBLatest(iso3, indicator) {
  // Reuses the same 25-year cache that charts use — no separate 5-year fetch
  const series = await fetchWB(iso3, indicator);
  if (!series || !series.length) return null;
  const latest = series[series.length - 1];
  return { value: latest.value, date: String(latest.year), source: 'wb' };
}

// ─── FRED API ─────────────────────────────────────
async function fetchFRED(seriesId, limit = 300) {
  const cacheKey = `fred_${seriesId}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = `${CONFIG.FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${CONFIG.FRED_API_KEY}&file_type=json&sort_order=asc&limit=${limit}&observation_start=2000-01-01`;
  try {
    const json = await fetchWithTimeout(url);
    if (!json.observations) return null;
    const data = json.observations
      .filter(o => o.value !== '.' && o.value !== '')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));
    Cache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`FRED fetch failed (${seriesId}):`, e.message);
    return null;
  }
}

async function fetchFREDLatest(seriesId) {
  const url = `${CONFIG.FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${CONFIG.FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
  const cacheKey = `fred_latest_${seriesId}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;
  try {
    const json = await fetchWithTimeout(url);
    if (!json.observations || !json.observations.length) return null;
    const obs = json.observations[0];
    if (obs.value === '.' || obs.value === '') return null;
    const result = { value: parseFloat(obs.value), date: obs.date, source: 'fred' };
    Cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`FRED latest failed (${seriesId}):`, e.message);
    return null;
  }
}

// ─── ECB API ──────────────────────────────────────
async function fetchECBSeries(flowRef, key) {
  const cacheKey = `ecb_${flowRef}_${key}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = `${CONFIG.ECB_BASE}/data/${flowRef}/${key}?format=jsondata&startPeriod=2000`;
  try {
    const json = await fetchWithTimeout(url);
    const series = json.dataSets?.[0]?.series?.['0:0:0:0:0:0:0']
                || json.dataSets?.[0]?.series?.['0:0:0:0:0:0'];
    if (!series) return null;
    const periods = json.structure?.dimensions?.observation?.[0]?.values || [];
    const obs = series.observations || {};
    const data = Object.entries(obs)
      .map(([idx, vals]) => ({
        date: periods[parseInt(idx)]?.id,
        value: vals[0]
      }))
      .filter(d => d.date && d.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    Cache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`ECB fetch failed (${flowRef}/${key}):`, e.message);
    return null;
  }
}

async function fetchECBLatest(flowRef, key) {
  const data = await fetchECBSeries(flowRef, key);
  if (!data || !data.length) return null;
  const last = data[data.length - 1];
  return { value: last.value, date: last.date, source: 'ecb' };
}

// ─── IMF DATAMAPPER API ───────────────────────────
// Free, no API key. Covers policy rates + macro indicators for all 12 countries.
// Indicator list: https://www.imf.org/external/datamapper/api/v1/indicators
async function fetchIMFSeries(indicator, iso3) {
  const cacheKey = `imf_${indicator}_${iso3}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = `${CONFIG.IMF_BASE}/${indicator}/${iso3}`;
  try {
    const json = await fetchWithTimeout(url);
    const countryData = json?.values?.[indicator]?.[iso3];
    if (!countryData) return null;
    const data = Object.entries(countryData)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([year, value]) => ({ year: parseInt(year), value }))
      .sort((a, b) => a.year - b.year);
    Cache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`IMF fetch failed (${indicator}/${iso3}):`, e.message);
    return null;
  }
}

async function fetchIMFLatest(indicator, iso3) {
  const series = await fetchIMFSeries(indicator, iso3);
  if (!series || !series.length) return null;
  const latest = series[series.length - 1];
  return { value: latest.value, date: String(latest.year), source: 'imf' };
}

// ─── EUROSTAT API ─────────────────────────────────
// Free, no API key. EU countries only. HICP = EU-harmonized CPI.
// coicop=TOT_X_NRG_FOOD → "All items excluding energy and food" = core inflation
async function fetchEurostatCoreInflation(iso3) {
  const geoCode = EUROSTAT_COUNTRIES[iso3];
  if (!geoCode) return null;

  const cacheKey = `eurostat_core_${iso3}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  // Monthly HICP rate of change, all items excl. energy & food
  const url = `${CONFIG.EUROSTAT_BASE}/PRC_HICP_MANR?format=JSON&sinceTimePeriod=2022-01&geo=${geoCode}&coicop=TOT_X_NRG_FOOD&unit=RCH_A_AVG`;
  try {
    const json = await fetchWithTimeout(url);
    // SDMX-JSON structure: datasets[0].value[] indexed by time
    const dataset = json?.datasets?.[0] || json?.dataset?.[0];
    if (!dataset) {
      // Try alternative SDMX envelope structure
      const ds = json?.value ? json : null;
      if (!ds) return null;
    }
    const values = json?.datasets?.[0]?.value ?? json?.value ?? null;
    const timeIds = json?.dimension?.time?.category?.index
                 ?? json?.structure?.dimensions?.observation?.[0]?.values;
    if (!values || !timeIds) return null;

    // Find the latest non-null value
    let lastDate = null, lastVal = null;
    if (Array.isArray(timeIds)) {
      // SDMX observation format
      for (let i = timeIds.length - 1; i >= 0; i--) {
        if (values[i] !== null && values[i] !== undefined) {
          lastDate = timeIds[i]?.id || timeIds[i];
          lastVal = values[i];
          break;
        }
      }
    } else {
      // Index-based dimension
      const entries = Object.entries(timeIds).sort(([, a], [, b]) => b - a);
      for (const [period, idx] of entries) {
        if (values[idx] !== null && values[idx] !== undefined) {
          lastDate = period;
          lastVal = values[idx];
          break;
        }
      }
    }
    if (lastVal === null) return null;
    const result = { value: Number(lastVal), date: lastDate, source: 'eurostat' };
    Cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.warn(`Eurostat core inflation failed (${iso3}):`, e.message);
    return null;
  }
}

// ─── FRED TIME SERIES (for charts) ───────────────
// Returns array of {date: 'YYYY-MM-DD', value} sorted ascending
async function fetchFREDSeries(seriesId, startYear = 2000) {
  const cacheKey = `fred_series_${seriesId}`;
  const cached = Cache.get(cacheKey);
  if (cached) return cached;

  const url = `${CONFIG.FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${CONFIG.FRED_API_KEY}&file_type=json&sort_order=asc&observation_start=${startYear}-01-01&limit=600`;
  try {
    const json = await fetchWithTimeout(url);
    if (!json.observations) return null;
    const data = json.observations
      .filter(o => o.value !== '.' && o.value !== '')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }));
    if (!data.length) return null;
    Cache.set(cacheKey, data);
    return data;
  } catch (e) {
    console.warn(`FRED series failed (${seriesId}):`, e.message);
    return null;
  }
}

// ─── METRIC FETCHERS ──────────────────────────────
// Priority: FRED (primary, monthly/daily) → ECB (Eurozone backup) → IMF → manual

async function fetchPolicyRate(country) {
  const iso3 = country.wb;
  const series = FRED_COUNTRY_SERIES[iso3];

  // FRED — primary source for all countries
  if (series?.policy_rate) {
    const r = await fetchFREDLatest(series.policy_rate);
    if (r) return r;
  }

  // ECB — backup for Eurozone if FRED ECBMRRFR is unavailable
  if (['DEU','FRA','ITA'].includes(iso3)) {
    const ecb = await fetchECBLatest('FM,1.0,', 'B.U2.EUR.4F.KR.MRR_FR.LEV');
    if (ecb) return ecb;
  }

  // IMF DataMapper — catches any country FRED misses
  const imf = await fetchIMFLatest(IMF_INDICATORS.policy_rate, iso3);
  if (imf) return imf;

  // Final fallback: manual-data.json
  if (state.manualData?.policy_rates?.[iso3]) {
    const m = state.manualData.policy_rates[iso3];
    return { value: m.value, date: m.date, source: 'manual' };
  }
  return null;
}

async function fetchBondYield(country) {
  const iso3 = country.wb;
  const series = FRED_COUNTRY_SERIES[iso3];

  // FRED — covers USA (DGS10) + DE/JP/FR/GB/IT/CA/KR/AU/BR/IN via IRLTLT01 series
  if (series?.bond_10y) {
    const r = await fetchFREDLatest(series.bond_10y);
    if (r) return r;
  }

  // ECB — backup for Eurozone bond yields (more granular)
  const ecbBondKeys = {
    DEU: 'B.DE.EUR.FR.BB.U2_10Y.YLD',
    FRA: 'B.FR.EUR.FR.BB.U2_10Y.YLD',
    ITA: 'B.IT.EUR.FR.BB.U2_10Y.YLD',
  };
  if (ecbBondKeys[iso3]) {
    const r = await fetchECBLatest('FM,1.0,', ecbBondKeys[iso3]);
    if (r) return r;
  }

  // Manual fallback (mainly China, where no free API has 10Y yield)
  if (state.manualData?.bond_yields_10y?.[iso3]) {
    const m = state.manualData.bond_yields_10y[iso3];
    return { value: m.value, date: m.date, source: 'manual' };
  }
  return null;
}

async function fetchCoreInflation(country) {
  const iso3 = country.wb;
  const series = FRED_COUNTRY_SERIES[iso3];

  // FRED — covers USA + all OECD countries (DE/JP/FR/GB/IT/CA/KR/AU via CPGRLE01 series)
  if (series?.core_cpi) {
    const r = await fetchFREDLatest(series.core_cpi);
    if (r) return r;
  }

  // Eurostat — backup for EU countries (HICP excl. food & energy, more recent)
  if (EUROSTAT_COUNTRIES[iso3]) {
    const r = await fetchEurostatCoreInflation(iso3);
    if (r) return r;
  }

  // Manual fallback (BRA, IND, CHN — no OECD core CPI series)
  if (state.manualData?.core_inflation?.[iso3]) {
    const m = state.manualData.core_inflation[iso3];
    return { value: m.value, date: m.date, source: 'manual' };
  }
  return null;
}

// ─── GOVERNMENT DEBT (special fetcher) ───────────
// Priority: FRED OECD series → IMF DataMapper → WB central-govt (last resort)
// IMF GGXWDG_NGDP = General Government Gross Debt (% GDP) — all levels of govt.
// WB GC.DOD.TOTL.GD.ZS = Central government only → understates debt for federal states.
async function fetchGovtDebt(country) {
  const iso3 = country.wb;
  const fs = FRED_COUNTRY_SERIES[iso3] || {};

  // 1. FRED OECD series (GGGDTP01{CC}A156N — general govt gross debt)
  if (fs.govt_debt) {
    const r = await fetchFREDLatest(fs.govt_debt);
    if (r) return r;
  }

  // 2. IMF DataMapper GGXWDG_NGDP — general government gross debt, all countries
  const imf = await fetchIMFLatest('GGXWDG_NGDP', iso3);
  if (imf) return imf;

  // 3. WB fallback (central govt only — flagged with source so user can see it)
  const wb = await fetchWBLatest(iso3, 'GC.DOD.TOTL.GD.ZS');
  if (wb) return { ...wb, source: 'wb_central' }; // distinct label for central-govt-only
  return null;
}

// ─── FETCH ALL METRICS FOR A COUNTRY ─────────────
// FRED is primary for monetary, inflation, unemployment, govt debt.
// World Bank is primary for GDP (USD), trade, demographics, and all
// non-OECD country data where FRED series don't exist.
async function fetchCountryMetrics(country) {
  const iso3 = country.wb;
  const fs = FRED_COUNTRY_SERIES[iso3] || {};

  // Try FRED first; if null seriesId or no data returned, fall back to WB.
  async function fredOrWB(fredSeriesId, wbCode) {
    if (fredSeriesId) {
      const r = await fetchFREDLatest(fredSeriesId);
      if (r) return r;
    }
    return wbCode ? fetchWBLatest(iso3, wbCode) : null;
  }

  const fetches = [
    // ── Growth (World Bank — standardised USD, all 12 countries)
    fetchWBLatest(iso3, 'NY.GDP.MKTP.CD').then(r  => ['gdp_nominal',    r]),
    fetchWBLatest(iso3, 'NY.GDP.MKTP.KD.ZG').then(r=> ['gdp_growth',     r]),
    fetchWBLatest(iso3, 'NY.GDP.PCAP.CD').then(r   => ['gdp_per_capita',  r]),

    // ── Inflation (FRED monthly → WB annual fallback)
    fredOrWB(fs.cpi_yoy,     'FP.CPI.TOTL.ZG').then(r => ['inflation_cpi', r]),
    fetchCoreInflation(country).then(r                  => ['core_inflation', r]),

    // ── Labor (FRED monthly → WB annual fallback)
    fredOrWB(fs.unemployment, 'SL.UEM.TOTL.ZS').then(r => ['unemployment',       r]),
    fredOrWB(fs.youth_unemp,  'SL.UEM.1524.ZS').then(r => ['youth_unemployment', r]),
    fredOrWB(fs.labor_part,   'SL.TLF.ACTI.ZS').then(r => ['labor_force_part',   r]),

    // ── Fiscal
    // Govt debt: IMF GGXWDG_NGDP = general government gross debt (all levels, % GDP)
    // This is the internationally comparable "Maastricht" measure.
    // WB GC.DOD.TOTL.GD.ZS = central government only → too low for federal states (DE, US, CA)
    fetchGovtDebt(country).then(r               => ['govt_debt',        r]),
    fetchWBLatest(iso3, 'GC.NLD.TOTL.GD.ZS').then(r => ['primary_balance',  r]),
    fetchWBLatest(iso3, 'GC.XPN.TOTL.GD.ZS').then(r => ['govt_expenditure', r]),

    // ── External (World Bank — USD trade, % GDP current account; all countries)
    fetchWBLatest(iso3, 'BN.CAB.XOKA.GD.ZS').then(r => ['current_account', r]),
    fetchWBLatest(iso3, 'NE.RSB.GNFS.CD').then(r    => ['trade_balance',    r]),

    // ── Monetary (FRED primary — policy rates, yields, core CPI)
    fetchPolicyRate(country).then(r   => ['policy_rate',    r]),
    fetchBondYield(country).then(r    => ['bond_yield_10y', r]),

    // ── Demographic (World Bank)
    fetchWBLatest(iso3, 'SP.POP.TOTL').then(r    => ['population',   r]),
    fetchWBLatest(iso3, 'SP.POP.GROW').then(r    => ['pop_growth',   r]),
    fetchWBLatest(iso3, 'SP.POP.DPND.OL').then(r => ['old_age_dep', r]),
  ];

  const results = await Promise.allSettled(fetches);
  const data = {};
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      const [id, val] = r.value;
      if (val) data[id] = val;
    }
  });
  return data;
}

// ─── RENDER METRIC CARDS ──────────────────────────
function sourceClass(src) {
  const map = { wb: 'src-wb', wb_central: 'src-manual', fred: 'src-fred', ecb: 'src-ecb', oecd: 'src-oecd', manual: 'src-manual', imf: 'src-imf', eurostat: 'src-eurostat' };
  return map[src] || 'src-unavailable';
}
function sourceLabel(src) {
  const map = { wb: 'WB', wb_central: 'WB CENTRAL ⚠', fred: 'FRED', ecb: 'ECB', oecd: 'OECD', manual: 'MANUAL ⚠', imf: 'IMF', eurostat: 'EUROSTAT' };
  return map[src] || 'N/A';
}

function renderMetricCard(metric, dataMap) {
  const info = dataMap[metric.id];
  const card = document.createElement('div');
  card.className = 'metric-card';
  card.dataset.metric = metric.id;
  card.dataset.category = metric.category;

  const catEl = document.createElement('div');
  catEl.className = 'card-category';
  catEl.textContent = metric.category.toUpperCase();

  const labelEl = document.createElement('div');
  labelEl.className = 'card-label';
  labelEl.textContent = metric.label;

  let valueEl, footerEl;

  if (!info || info.value === null || info.value === undefined) {
    card.classList.add('card-unavailable');
    valueEl = document.createElement('div');
    valueEl.className = 'card-value';
    valueEl.textContent = 'DATA UNAVAILABLE';

    footerEl = document.createElement('div');
    footerEl.className = 'card-footer';
    const srcBadge = document.createElement('span');
    srcBadge.className = `card-source src-unavailable`;
    srcBadge.textContent = 'N/A';
    footerEl.appendChild(srcBadge);
  } else {
    const formatted = formatValue(info.value, metric.format, metric.unit);
    valueEl = document.createElement('div');
    valueEl.className = `card-value ${colorClass(info.value, metric.colorize)}`;

    const numSpan = document.createElement('span');
    numSpan.textContent = formatted;
    valueEl.appendChild(numSpan);
    if (metric.unit) {
      const unitSpan = document.createElement('span');
      unitSpan.className = 'card-unit';
      unitSpan.textContent = metric.unit;
      valueEl.appendChild(unitSpan);
    }

    footerEl = document.createElement('div');
    footerEl.className = 'card-footer';

    const dateEl = document.createElement('span');
    dateEl.className = 'card-date';
    dateEl.textContent = info.date || '—';

    const srcBadge = document.createElement('span');
    srcBadge.className = `card-source ${sourceClass(info.source)}`;
    srcBadge.textContent = sourceLabel(info.source);
    if (info.source === 'manual') srcBadge.title = 'Value from manual-data.json — may be outdated';

    footerEl.appendChild(dateEl);
    footerEl.appendChild(srcBadge);
  }

  card.appendChild(catEl);
  card.appendChild(labelEl);
  card.appendChild(valueEl);
  card.appendChild(footerEl);
  return card;
}

function renderCompareCard(metric, dataMaps) {
  const card = document.createElement('div');
  card.className = 'metric-card';
  card.dataset.metric = metric.id;
  card.dataset.category = metric.category;

  const catEl = document.createElement('div');
  catEl.className = 'card-category';
  catEl.textContent = metric.category.toUpperCase();

  const labelEl = document.createElement('div');
  labelEl.className = 'card-label';
  labelEl.textContent = metric.label;

  const valuesEl = document.createElement('div');
  valuesEl.className = 'compare-values';

  const countries = [state.selectedCountry, ...state.compareCountries];
  countries.forEach((country, i) => {
    const info = dataMaps[country.wb]?.[metric.id];
    const row = document.createElement('div');
    row.className = 'compare-value-row';

    const countryLabel = document.createElement('span');
    countryLabel.className = 'compare-country-label';
    countryLabel.style.color = CHART_COLORS[i % CHART_COLORS.length];
    countryLabel.textContent = `${country.flag} ${country.code}`;

    const valSpan = document.createElement('span');
    if (info && info.value !== null && info.value !== undefined) {
      valSpan.className = `compare-val ${colorClass(info.value, metric.colorize)}`;
      valSpan.textContent = formatValue(info.value, metric.format, metric.unit) + (metric.unit ? metric.unit : '');
    } else {
      valSpan.className = 'compare-val';
      valSpan.style.color = 'var(--text-3)';
      valSpan.textContent = '—';
    }

    row.appendChild(countryLabel);
    row.appendChild(valSpan);
    valuesEl.appendChild(row);
  });

  card.appendChild(catEl);
  card.appendChild(labelEl);
  card.appendChild(valuesEl);
  return card;
}

function applyFilters() {
  const cards = document.querySelectorAll('.metric-card');
  const search = state.metricSearch.toLowerCase().trim();
  const cat = state.activeCategory;
  cards.forEach(card => {
    const metricId = card.dataset.metric;
    const def = METRIC_DEFINITIONS.find(m => m.id === metricId);
    if (!def) return;
    const matchCat = cat === 'all' || def.category === cat;
    const matchSearch = !search || def.label.toLowerCase().includes(search) || def.category.toLowerCase().includes(search);
    card.classList.toggle('hidden', !(matchCat && matchSearch));
  });
  // Also filter chart cards
  const chartCards = document.querySelectorAll('.chart-card');
  chartCards.forEach(card => {
    const chartId = card.dataset.chartId;
    const cm = CHART_METRICS.find(m => m.id === chartId);
    if (!cm) return;
    const def = METRIC_DEFINITIONS.find(m => m.id === chartId);
    const matchCat = cat === 'all' || (def && def.category === cat);
    card.classList.toggle('hidden', !matchCat);
  });
}

// ─── CHARTS ───────────────────────────────────────
function filterByRange(data, range) {
  if (!data || !data.length) return data;
  const maxYear = new Date().getFullYear();
  const ranges = { '5y': 5, '10y': 10, '20y': 20 };
  if (range === 'max') return data;
  const cutoff = maxYear - (ranges[range] || 20);
  return data.filter(d => {
    const y = d.year || parseInt(d.date);
    return y >= cutoff;
  });
}

function buildChartDatasets(seriesMap) {
  return Object.entries(seriesMap).map(([countryWb, series], i) => {
    const country = COUNTRIES.find(c => c.wb === countryWb);
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return {
      label: country ? `${country.flag} ${country.name}` : countryWb,
      data: series.map(d => ({ x: d.year || parseInt(d.date), y: d.value })),
      borderColor: color,
      backgroundColor: color + '18',
      borderWidth: 1.5,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    };
  });
}

function createOrUpdateChart(canvasId, chartDef, seriesMap, unit) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (state.charts[canvasId]) {
    state.charts[canvasId].destroy();
    delete state.charts[canvasId];
  }

  const datasets = buildChartDatasets(seriesMap);
  if (!datasets.length || !datasets.some(d => d.data.length > 0)) {
    const wrapper = canvas.parentElement;
    wrapper.innerHTML = `<div class="chart-unavailable">NO CHART DATA AVAILABLE</div>`;
    return;
  }

  const chart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: {
            color: '#a8b8cc',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            boxWidth: 12,
            padding: 8,
          }
        },
        tooltip: {
          backgroundColor: '#0d1117',
          borderColor: '#1e2d3d',
          borderWidth: 1,
          titleColor: '#e8edf3',
          bodyColor: '#a8b8cc',
          padding: 10,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}${unit === '%' ? '%' : ''}`
          }
        },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: {
            color: '#5a7a99',
            font: { family: "'JetBrains Mono', monospace", size: 9 },
            maxTicksLimit: 8,
            callback: v => Math.round(v),
          },
          grid: { color: '#1a2332' },
          border: { color: '#1e2d3d' },
        },
        y: {
          ticks: {
            color: '#5a7a99',
            font: { family: "'JetBrains Mono', monospace", size: 9 },
            callback: v => v.toFixed(1) + (unit === '%' ? '%' : ''),
          },
          grid: { color: '#1a2332' },
          border: { color: '#1e2d3d' },
        }
      }
    }
  });
  state.charts[canvasId] = chart;
}

async function renderChart(chartDef, countries, range) {
  const canvasId = `chart-${chartDef.id}`;
  const seriesMap = {};

  if (chartDef.src === 'imf') {
    // IMF DataMapper annual time series
    const fetches = countries.map(async (country) => {
      const data = await fetchIMFSeries(chartDef.imfCode, country.wb);
      if (data && data.length) {
        seriesMap[country.wb] = filterByRange(data, range);
      }
    });
    await Promise.all(fetches);
  } else if (chartDef.src === 'fred') {
    // FRED monthly charts — convert date strings to pseudo-year decimals for x-axis
    const fetches = countries.map(async (country) => {
      const fredSeries = FRED_COUNTRY_SERIES[country.wb];
      const seriesId = fredSeries?.[chartDef.fredKey];
      if (!seriesId) return;
      const data = await fetchFREDSeries(seriesId, 2000);
      if (!data || !data.length) return;
      // Filter by range and convert to {year, value} format for chart compatibility
      const cutoffYears = { '5y': 5, '10y': 10, '20y': 20 };
      const cutoff = range === 'max' ? 0 : new Date().getFullYear() - (cutoffYears[range] || 20);
      const filtered = data
        .filter(d => parseInt(d.date) >= cutoff)
        .map(d => ({ year: parseFloat(d.date.slice(0,4)) + (parseInt(d.date.slice(5,7))-1)/12, value: d.value }));
      if (filtered.length) seriesMap[country.wb] = filtered;
    });
    await Promise.all(fetches);
  } else {
    // World Bank annual charts
    const fetches = countries.map(async (country) => {
      const series = await fetchWB(country.wb, chartDef.wbCode);
      if (series && series.length) {
        seriesMap[country.wb] = filterByRange(series, range);
      }
    });
    await Promise.all(fetches);
  }

  createOrUpdateChart(canvasId, chartDef, seriesMap, chartDef.unit);
}

function buildChartCard(chartDef) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  card.dataset.chartId = chartDef.id;

  const header = document.createElement('div');
  header.className = 'chart-header';

  const titleBlock = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'chart-title';
  title.textContent = chartDef.label;
  const subtitle = document.createElement('div');
  subtitle.className = 'chart-subtitle';
  subtitle.textContent = 'World Bank Data  ·  Annual';
  titleBlock.appendChild(title);
  titleBlock.appendChild(subtitle);

  const timeRange = document.createElement('div');
  timeRange.className = 'chart-timerange';
  ['5y','10y','20y','max'].forEach(r => {
    const btn = document.createElement('button');
    btn.className = `time-btn ${r === '20y' ? 'active' : ''}`;
    btn.textContent = r.toUpperCase();
    btn.dataset.range = r;
    btn.addEventListener('click', async () => {
      timeRange.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.chartRanges[chartDef.id] = r;
      const countries = [state.selectedCountry, ...state.compareCountries];
      await renderChart(chartDef, countries, r);
    });
    timeRange.appendChild(btn);
  });

  header.appendChild(titleBlock);
  header.appendChild(timeRange);

  const wrapper = document.createElement('div');
  wrapper.className = 'chart-wrapper';

  const loadingEl = document.createElement('div');
  loadingEl.className = 'chart-loading';
  loadingEl.textContent = 'LOADING CHART DATA…';
  wrapper.appendChild(loadingEl);

  const canvas = document.createElement('canvas');
  canvas.id = `chart-${chartDef.id}`;
  wrapper.appendChild(canvas);

  card.appendChild(header);
  card.appendChild(wrapper);
  return card;
}

// ─── MAIN RENDER ──────────────────────────────────
async function renderDashboard() {
  const grid = document.getElementById('metrics-grid');
  const chartsGrid = document.getElementById('charts-grid');
  grid.innerHTML = '';
  chartsGrid.innerHTML = '';

  // Destroy existing charts
  Object.values(state.charts).forEach(c => c.destroy());
  state.charts = {};

  showLoading(true);

  const countries = [state.selectedCountry, ...state.compareCountries];

  // Fetch all metric data
  const dataMaps = {};
  await Promise.all(countries.map(async (country) => {
    const data = await fetchCountryMetrics(country);
    dataMaps[country.wb] = data;
  }));

  // Render metric cards
  METRIC_DEFINITIONS.forEach(metric => {
    let card;
    if (state.compareMode && state.compareCountries.length > 0) {
      card = renderCompareCard(metric, dataMaps);
    } else {
      const info = dataMaps[state.selectedCountry.wb]?.[metric.id];
      card = renderMetricCard(metric, { [metric.id]: info });
    }
    grid.appendChild(card);
  });

  // Render chart cards and load data async
  CHART_METRICS.forEach(chartDef => {
    const card = buildChartCard(chartDef);
    chartsGrid.appendChild(card);
  });

  showLoading(false);
  applyFilters();

  // Load charts after UI is shown
  CHART_METRICS.forEach(async (chartDef) => {
    const range = state.chartRanges[chartDef.id] || '20y';
    const loadEl = document.querySelector(`#chart-${chartDef.id}`)?.parentElement?.querySelector('.chart-loading');
    await renderChart(chartDef, countries, range);
    if (loadEl) loadEl.remove();
  });

  document.getElementById('footer-last-fetch').textContent =
    'Last fetch: ' + new Date().toLocaleTimeString();
}

function showLoading(visible) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !visible);
}

// ─── COUNTRY DROPDOWN ─────────────────────────────
function buildDropdownItems(listEl, searchEl, onSelect, excludeCodes = []) {
  function render(filter = '') {
    listEl.innerHTML = '';
    COUNTRIES
      .filter(c => !excludeCodes.includes(c.wb))
      .filter(c => !filter || c.name.toLowerCase().includes(filter.toLowerCase()) || c.code.toLowerCase().includes(filter.toLowerCase()))
      .forEach(country => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `<span class="item-flag">${country.flag}</span><span>${country.name}</span><span class="item-code">${country.code}</span>`;
        item.addEventListener('click', () => onSelect(country));
        listEl.appendChild(item);
      });
  }
  render();
  searchEl.addEventListener('input', e => render(e.target.value));
}

function setupCountrySelect() {
  const wrapper = document.getElementById('country-select-wrapper');
  const display = document.getElementById('country-select-display');
  const dropdown = document.getElementById('country-dropdown');
  const listEl = document.getElementById('dropdown-list');
  const searchEl = document.getElementById('country-search');

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    display.classList.toggle('open', open);
    if (open) searchEl.focus();
  });

  buildDropdownItems(listEl, searchEl, (country) => {
    state.selectedCountry = country;
    document.getElementById('selected-flag').textContent = country.flag;
    document.getElementById('selected-country-name').textContent = country.name;
    dropdown.classList.remove('open');
    display.classList.remove('open');
    searchEl.value = '';
    renderDashboard();
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    display.classList.remove('open');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());
}

function setupCompareSelect() {
  const wrapper = document.getElementById('compare-select-wrapper');
  const display = document.getElementById('compare-select-display');
  const dropdown = document.getElementById('compare-dropdown');
  const listEl = document.getElementById('compare-dropdown-list');
  const searchEl = document.getElementById('compare-search');

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    display.classList.toggle('open', open);
    if (open) { rebuildCompareDropdown(); searchEl.focus(); }
  });

  function rebuildCompareDropdown() {
    const exclude = [state.selectedCountry.wb, ...state.compareCountries.map(c => c.wb)];
    buildDropdownItems(listEl, searchEl, (country) => {
      if (state.compareCountries.length >= 4) {
        toast('Max 4 comparison countries', 'warn');
        return;
      }
      state.compareCountries.push(country);
      dropdown.classList.remove('open');
      display.classList.remove('open');
      searchEl.value = '';
      updateCompareTags();
      renderDashboard();
    }, exclude);
  }

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    display.classList.remove('open');
  });
  dropdown.addEventListener('click', e => e.stopPropagation());
}

function updateCompareTags() {
  const container = document.getElementById('compare-tags');
  container.innerHTML = '';
  state.compareCountries.forEach((country, i) => {
    const tag = document.createElement('div');
    tag.className = 'compare-tag';
    tag.innerHTML = `<span style="color:${CHART_COLORS[i+1]}">${country.flag} ${country.code}</span><span class="tag-remove">×</span>`;
    tag.querySelector('.tag-remove').addEventListener('click', () => {
      state.compareCountries.splice(i, 1);
      updateCompareTags();
      renderDashboard();
    });
    container.appendChild(tag);
  });
}

// ─── CLOCK ────────────────────────────────────────
function startClock() {
  function update() {
    const now = new Date();
    const utc = now.toUTCString().split(' ')[4];
    document.getElementById('clock').textContent = utc + ' UTC';
  }
  update();
  setInterval(update, 1000);
}

// ─── STATUS ───────────────────────────────────────
function setStatus(text, color = 'var(--accent)') {
  const el = document.getElementById('global-status');
  el.textContent = text;
  el.style.color = color;
}

// ─── INIT ─────────────────────────────────────────
async function init() {
  startClock();
  setStatus('LOADING…', 'var(--warn)');

  setupCountrySelect();
  setupCompareSelect();

  // Compare mode toggle
  const compareBtn = document.getElementById('btn-compare-toggle');
  compareBtn.addEventListener('click', () => {
    state.compareMode = !state.compareMode;
    compareBtn.classList.toggle('active', state.compareMode);
    document.getElementById('compare-tags').style.display = state.compareMode ? 'flex' : 'none';
    document.getElementById('compare-select-wrapper').style.display = state.compareMode ? 'block' : 'none';
    if (!state.compareMode) {
      state.compareCountries = [];
      updateCompareTags();
    }
    renderDashboard();
  });

  // Category tabs
  document.getElementById('category-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    state.activeCategory = btn.dataset.cat;
    applyFilters();
  });

  // Metric search
  document.getElementById('metric-search').addEventListener('input', (e) => {
    state.metricSearch = e.target.value;
    applyFilters();
  });

  // Load manual data then render
  await loadManualData();
  setStatus('LIVE', 'var(--positive)');
  await renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
