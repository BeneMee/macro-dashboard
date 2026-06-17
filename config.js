/* ═══════════════════════════════════════════════
   MACRO MONITOR — CONFIGURATION
   Edit FRED_API_KEY with your own key from:
   https://fred.stlouisfed.org/docs/api/api_key.html
   ═══════════════════════════════════════════════ */

const CONFIG = {
  // Key is injected at deploy time via GitHub Actions (secret: FRED_API_KEY).
  // For local development, replace this placeholder manually.
  FRED_API_KEY: '__FRED_API_KEY__',
  CACHE_TTL_MS: 60 * 60 * 1000, // 1 hour
  API_TIMEOUT_MS: 12000,
  WORLD_BANK_BASE: 'https://api.worldbank.org/v2',
  FRED_BASE: 'https://api.stlouisfed.org/fred',
  ECB_BASE: 'https://data-api.ecb.europa.eu/service',
  IMF_BASE: 'https://www.imf.org/external/datamapper/api/v1',
  EUROSTAT_BASE: 'https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data',
  MANUAL_DATA_URL: './manual-data.json',
};

const COUNTRIES = [
  { code: 'US',  wb: 'USA', iso3: 'USA', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'DE',  wb: 'DEU', iso3: 'DEU', name: 'Germany',       flag: '🇩🇪', currency: 'EUR' },
  { code: 'JP',  wb: 'JPN', iso3: 'JPN', name: 'Japan',         flag: '🇯🇵', currency: 'JPY' },
  { code: 'FR',  wb: 'FRA', iso3: 'FRA', name: 'France',        flag: '🇫🇷', currency: 'EUR' },
  { code: 'GB',  wb: 'GBR', iso3: 'GBR', name: 'United Kingdom',flag: '🇬🇧', currency: 'GBP' },
  { code: 'IT',  wb: 'ITA', iso3: 'ITA', name: 'Italy',         flag: '🇮🇹', currency: 'EUR' },
  { code: 'CA',  wb: 'CAN', iso3: 'CAN', name: 'Canada',        flag: '🇨🇦', currency: 'CAD' },
  { code: 'CN',  wb: 'CHN', iso3: 'CHN', name: 'China',         flag: '🇨🇳', currency: 'CNY' },
  { code: 'KR',  wb: 'KOR', iso3: 'KOR', name: 'South Korea',   flag: '🇰🇷', currency: 'KRW' },
  { code: 'AU',  wb: 'AUS', iso3: 'AUS', name: 'Australia',     flag: '🇦🇺', currency: 'AUD' },
  { code: 'BR',  wb: 'BRA', iso3: 'BRA', name: 'Brazil',        flag: '🇧🇷', currency: 'BRL' },
  { code: 'IN',  wb: 'IND', iso3: 'IND', name: 'India',         flag: '🇮🇳', currency: 'INR' },
];

// WB indicator codes
const WB_INDICATORS = {
  gdp_nominal:        'NY.GDP.MKTP.CD',
  gdp_growth:         'NY.GDP.MKTP.KD.ZG',
  gdp_per_capita:     'NY.GDP.PCAP.CD',
  inflation_cpi:      'FP.CPI.TOTL.ZG',
  unemployment:       'SL.UEM.TOTL.ZS',
  youth_unemployment: 'SL.UEM.1524.ZS',
  labor_force_part:   'SL.TLF.ACTI.ZS',
  govt_debt:          'GC.DOD.TOTL.GD.ZS',
  primary_balance:    'GC.NLD.TOTL.GD.ZS',
  govt_expenditure:   'GC.XPN.TOTL.GD.ZS',
  current_account:    'BN.CAB.XOKA.GD.ZS',
  trade_balance:      'NE.RSB.GNFS.CD',
  population:         'SP.POP.TOTL',
  pop_growth:         'SP.POP.GROW',
  old_age_dep:        'SP.POP.DPND.OL',
};

// FRED series IDs
const FRED_SERIES = {
  fed_funds_rate:     'FEDFUNDS',
  us_10y_yield:       'DGS10',
  us_core_cpi:        'CPILFESL', // Index — we derive YoY from series
  us_core_cpi_yoy:    'CORESTICKM159SFRBATL',
};

// ECB series keys (SDMX-compliant flow references)
const ECB_SERIES = {
  ecb_rate:       'FM.B.U2.EUR.4F.KR.MRR_FR.LEV', // Main refinancing rate
  de_10y_yield:   'FM.B.DE.EUR.FR.BB.U2_10Y.YLD',
  fr_10y_yield:   'FM.B.FR.EUR.FR.BB.U2_10Y.YLD',
  it_10y_yield:   'FM.B.IT.EUR.FR.BB.U2_10Y.YLD',
};

// IMF DataMapper indicator codes
// Full list: https://www.imf.org/external/datamapper/api/v1/indicators
const IMF_INDICATORS = {
  policy_rate:    'FPOLM_PA',   // Monetary Policy Rate, % per annum — covers all 12 countries
  gdp_growth:     'NGDP_RPCH',  // Real GDP growth (% change) — more recent than WB
  cpi_inflation:  'PCPIPCH',    // CPI inflation (% change)
  unemployment:   'LUR',        // Unemployment rate
  govt_debt:      'GGXWDG_NGDP',// General govt gross debt (% of GDP)
  current_acct:   'BCA_NGDPD',  // Current account (% of GDP)
};

// IMF country codes (same as ISO 3-letter, matching our wb field)
// USA, DEU, JPN, FRA, GBR, ITA, CAN, CHN, KOR, AUS, BRA, IND — all supported

// Eurostat geo codes for HICP core inflation (TOT_X_NRG_FOOD = excl. energy & food)
const EUROSTAT_COUNTRIES = {
  DEU: 'DE', FRA: 'FR', ITA: 'IT',
};

// ── FRED series IDs per country ──────────────────────────────────────────────
// Sources: OECD Main Economic Indicators via FRED (free, comprehensive)
//
// Policy rates: IRSTCB01{CC}M156N  — immediate/overnight interbank rate (tracks CB rate)
//   Eurozone: ECBMRRFR             — ECB Main Refinancing Rate (exact official rate)
//
// 10Y bond yields: IRLTLT01{CC}M156N — long-term government bond yield, monthly
//   USA: DGS10                     — daily constant-maturity 10Y (more timely)
//
// Core CPI (excl. food & energy, YoY %): CPGRLE01{CC}M657N — OECD MEI, monthly
//   USA: CORESTICKM159SFRBATL      — Atlanta Fed Sticky Price Core CPI
//
// null = no FRED series exists; falls back to IMF DataMapper → manual-data.json
const FRED_COUNTRY_SERIES = {
  USA: {
    policy_rate: 'FEDFUNDS',
    bond_10y:    'DGS10',
    core_cpi:    'CORESTICKM159SFRBATL',
  },
  DEU: {
    policy_rate: 'ECBMRRFR',
    bond_10y:    'IRLTLT01DEM156N',
    core_cpi:    'CPGRLE01DEM657N',
  },
  JPN: {
    policy_rate: 'IRSTCB01JPM156N',
    bond_10y:    'IRLTLT01JPM156N',
    core_cpi:    'CPGRLE01JPM657N',
  },
  FRA: {
    policy_rate: 'ECBMRRFR',
    bond_10y:    'IRLTLT01FRM156N',
    core_cpi:    'CPGRLE01FRM657N',
  },
  GBR: {
    policy_rate: 'IRSTCB01GBM156N',
    bond_10y:    'IRLTLT01GBM156N',
    core_cpi:    'CPGRLE01GBM657N',
  },
  ITA: {
    policy_rate: 'ECBMRRFR',
    bond_10y:    'IRLTLT01ITM156N',
    core_cpi:    'CPGRLE01ITM657N',
  },
  CAN: {
    policy_rate: 'IRSTCB01CAM156N',
    bond_10y:    'IRLTLT01CAM156N',
    core_cpi:    'CPGRLE01CAM657N',
  },
  CHN: {
    // China is not OECD — limited FRED coverage
    policy_rate: 'IRSTCB01CNM156N',
    bond_10y:    null,              // No FRED series; manual-data.json fallback
    core_cpi:    null,
  },
  KOR: {
    policy_rate: 'IRSTCB01KRM156N',
    bond_10y:    'IRLTLT01KRM156N',
    core_cpi:    'CPGRLE01KRM657N',
  },
  AUS: {
    policy_rate: 'IRSTCB01AUM156N',
    bond_10y:    'IRLTLT01AUM156N',
    core_cpi:    'CPGRLE01AUM657N',
  },
  BRA: {
    policy_rate: 'IRSTCB01BRM156N',
    bond_10y:    'IRLTLT01BRM156N',
    core_cpi:    null,              // Brazil not in OECD core CPI dataset
  },
  IND: {
    policy_rate: 'IRSTCB01INM156N',
    bond_10y:    'IRLTLT01INM156N',
    core_cpi:    null,
  },
};

// FRED series for multi-country monetary time-series charts
const FRED_CHART_MONETARY = [
  {
    id: 'policy_rate_chart',
    label: 'Central Bank Policy Rates (%)',
    unit: '%',
    seriesKey: 'policy_rate',
  },
  {
    id: 'bond_yield_10y_chart',
    label: '10Y Government Bond Yields (%)',
    unit: '%',
    seriesKey: 'bond_10y',
  },
];


const METRIC_DEFINITIONS = [
  // Growth & Output
  { id: 'gdp_nominal',        label: 'GDP (Nominal)',          unit: 'USD',  category: 'growth',      source: 'wb',     wbCode: 'NY.GDP.MKTP.CD',   format: 'trillions', colorize: false },
  { id: 'gdp_growth',         label: 'Real GDP Growth',        unit: '%',    category: 'growth',      source: 'wb',     wbCode: 'NY.GDP.MKTP.KD.ZG', format: 'pct',      colorize: true  },
  { id: 'gdp_per_capita',     label: 'GDP per Capita',         unit: 'USD',  category: 'growth',      source: 'wb',     wbCode: 'NY.GDP.PCAP.CD',   format: 'thousands', colorize: false },
  // Prices & Inflation
  { id: 'inflation_cpi',      label: 'Inflation CPI (YoY)',    unit: '%',    category: 'inflation',   source: 'wb',     wbCode: 'FP.CPI.TOTL.ZG',   format: 'pct',      colorize: 'inv' },
  { id: 'core_inflation',     label: 'Core Inflation',         unit: '%',    category: 'inflation',   source: 'mixed',  format: 'pct',               colorize: 'inv' },
  // Labor Market
  { id: 'unemployment',       label: 'Unemployment Rate',      unit: '%',    category: 'labor',       source: 'wb',     wbCode: 'SL.UEM.TOTL.ZS',   format: 'pct',      colorize: 'inv' },
  { id: 'youth_unemployment', label: 'Youth Unemployment',     unit: '%',    category: 'labor',       source: 'wb',     wbCode: 'SL.UEM.1524.ZS',   format: 'pct',      colorize: 'inv' },
  { id: 'labor_force_part',   label: 'Labor Force Part. Rate', unit: '%',    category: 'labor',       source: 'wb',     wbCode: 'SL.TLF.ACTI.ZS',   format: 'pct',      colorize: false },
  // Fiscal
  { id: 'govt_debt',          label: 'Govt. Debt (% GDP)',     unit: '%',    category: 'fiscal',      source: 'wb',     wbCode: 'GC.DOD.TOTL.GD.ZS', format: 'pct',     colorize: 'inv' },
  { id: 'primary_balance',    label: 'Primary Balance (% GDP)',unit: '%',    category: 'fiscal',      source: 'wb',     wbCode: 'GC.NLD.TOTL.GD.ZS', format: 'pct',     colorize: true  },
  { id: 'govt_expenditure',   label: 'Govt. Expenditure (% GDP)', unit: '%', category: 'fiscal',     source: 'wb',     wbCode: 'GC.XPN.TOTL.GD.ZS', format: 'pct',     colorize: false },
  // External
  { id: 'current_account',    label: 'Current Account (% GDP)',unit: '%',    category: 'external',    source: 'wb',     wbCode: 'BN.CAB.XOKA.GD.ZS', format: 'pct',     colorize: true  },
  { id: 'trade_balance',      label: 'Trade Balance',          unit: 'USD',  category: 'external',    source: 'wb',     wbCode: 'NE.RSB.GNFS.CD',   format: 'billions', colorize: true  },
  // Monetary
  { id: 'policy_rate',        label: 'Central Bank Rate',      unit: '%',    category: 'monetary',    source: 'mixed',  format: 'pct',               colorize: false },
  { id: 'bond_yield_10y',     label: '10Y Govt Bond Yield',    unit: '%',    category: 'monetary',    source: 'mixed',  format: 'pct',               colorize: false },
  // Demographic
  { id: 'population',         label: 'Population',             unit: '',     category: 'demographic', source: 'wb',     wbCode: 'SP.POP.TOTL',      format: 'millions', colorize: false },
  { id: 'pop_growth',         label: 'Population Growth',      unit: '%',    category: 'demographic', source: 'wb',     wbCode: 'SP.POP.GROW',      format: 'pct',      colorize: false },
  { id: 'old_age_dep',        label: 'Old-Age Dependency Ratio',unit: '%',   category: 'demographic', source: 'wb',     wbCode: 'SP.POP.DPND.OL',   format: 'pct',      colorize: false },
];

// Time-series charts (World Bank annual data)
const CHART_METRICS = [
  { id: 'gdp_growth',      label: 'Real GDP Growth (%)',      wbCode: 'NY.GDP.MKTP.KD.ZG', unit: '%',  src: 'wb' },
  { id: 'inflation_cpi',   label: 'Inflation CPI (YoY, %)',   wbCode: 'FP.CPI.TOTL.ZG',    unit: '%',  src: 'wb' },
  { id: 'gdp_per_capita',  label: 'GDP per Capita (USD)',     wbCode: 'NY.GDP.PCAP.CD',     unit: 'USD', src: 'wb' },
  { id: 'unemployment',    label: 'Unemployment Rate (%)',    wbCode: 'SL.UEM.TOTL.ZS',    unit: '%',  src: 'wb' },
  { id: 'govt_debt',       label: 'Govt. Debt (% of GDP)',   wbCode: 'GC.DOD.TOTL.GD.ZS', unit: '%',  src: 'wb' },
  { id: 'current_account', label: 'Current Account (% GDP)', wbCode: 'BN.CAB.XOKA.GD.ZS', unit: '%',  src: 'wb' },
  // FRED-sourced monthly charts (monetary data)
  { id: 'policy_rate_chart',   label: 'Central Bank Rates (%)',    unit: '%', src: 'fred', fredKey: 'policy_rate',  category: 'monetary' },
  { id: 'bond_yield_10y_chart', label: '10Y Govt Bond Yields (%)', unit: '%', src: 'fred', fredKey: 'bond_10y',     category: 'monetary' },
];

// Chart color palette for compare mode
const CHART_COLORS = [
  '#00d4ff', '#00ff88', '#ff6b35', '#ffd740', '#cc66ff',
  '#ff5252', '#4da6ff', '#00e5cc', '#ffab40', '#69f0ae',
];
