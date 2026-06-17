/* ═══════════════════════════════════════════════
   MACRO MONITOR — CONFIGURATION
   FRED API key is injected at deploy time via GitHub Actions secret FRED_API_KEY.
   For local development replace __FRED_API_KEY__ manually.
   ═══════════════════════════════════════════════ */

const CONFIG = {
  FRED_API_KEY:    '__FRED_API_KEY__',
  CACHE_TTL_MS:    60 * 60 * 1000,   // 1 hour
  API_TIMEOUT_MS:  12000,
  WORLD_BANK_BASE: 'https://api.worldbank.org/v2',
  FRED_BASE:       'https://api.stlouisfed.org/fred',
  ECB_BASE:        'https://data-api.ecb.europa.eu/service',
  IMF_BASE:        'https://www.imf.org/external/datamapper/api/v1',
  EUROSTAT_BASE:   'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data',
  MANUAL_DATA_URL: './manual-data.json',
};

// Eurostat geo codes for EU/EEA countries (ISO3 → Eurostat code)
const EUROSTAT_COUNTRIES = {
  DEU: 'DE',
  FRA: 'FR',
  ITA: 'IT',
  GBR: 'UK',
};

const COUNTRIES = [
  { code: 'US', wb: 'USA', name: 'United States', flag: '🇺🇸', currency: 'USD' },
  { code: 'DE', wb: 'DEU', name: 'Germany',        flag: '🇩🇪', currency: 'EUR' },
  { code: 'JP', wb: 'JPN', name: 'Japan',           flag: '🇯🇵', currency: 'JPY' },
  { code: 'FR', wb: 'FRA', name: 'France',          flag: '🇫🇷', currency: 'EUR' },
  { code: 'GB', wb: 'GBR', name: 'United Kingdom',  flag: '🇬🇧', currency: 'GBP' },
  { code: 'IT', wb: 'ITA', name: 'Italy',           flag: '🇮🇹', currency: 'EUR' },
  { code: 'CA', wb: 'CAN', name: 'Canada',          flag: '🇨🇦', currency: 'CAD' },
  { code: 'CN', wb: 'CHN', name: 'China',           flag: '🇨🇳', currency: 'CNY' },
  { code: 'KR', wb: 'KOR', name: 'South Korea',     flag: '🇰🇷', currency: 'KRW' },
  { code: 'AU', wb: 'AUS', name: 'Australia',       flag: '🇦🇺', currency: 'AUD' },
  { code: 'BR', wb: 'BRA', name: 'Brazil',          flag: '🇧🇷', currency: 'BRL' },
  { code: 'IN', wb: 'IND', name: 'India',           flag: '🇮🇳', currency: 'INR' },
];

/* ══════════════════════════════════════════════════════════════════════════════
   FRED SERIES PER COUNTRY
   All series from FRED (St. Louis Fed): https://fred.stlouisfed.org
   Sources behind the series:
     OECD MEI = Main Economic Indicators (OECD member countries)
     BLS/BEA  = US Bureau of Labor Statistics / Bureau of Economic Analysis
     ECB      = European Central Bank
   null = no FRED series; app falls back to World Bank → IMF → manual-data.json
   ══════════════════════════════════════════════════════════════════════════════ */

const FRED_COUNTRY_SERIES = {

  USA: {
    // Monetary
    policy_rate:   'FEDFUNDS',              // Federal Funds Effective Rate (monthly avg)
    bond_10y:      'DGS10',                 // 10-Year Treasury Constant Maturity (daily)
    core_cpi:      'CORESTICKM159SFRBATL',  // Atlanta Fed Sticky-Price Core CPI YoY %

    // Prices
    cpi_yoy:       'CPALTT01USM657N',       // CPI All Items YoY % — OECD via FRED

    // Labor
    unemployment:  'UNRATE',               // Civilian Unemployment Rate (BLS, monthly)
    youth_unemp:   'LNS14000012',          // 16–24 year unemployment rate (BLS)
    labor_part:    'CIVPART',              // Civilian Labor Force Participation Rate

    // Fiscal (note: US federal debt only, not general govt — WB used as supplement)
    govt_debt:     'GFDEGDQ188S',          // Federal Debt: Total Public Debt as % GDP

    // External (WB used for current account; FRED US trade balance is goods only)
    trade_balance: 'BOPGSTB',             // US Trade Balance in Goods & Services (BEA, $B)
  },

  DEU: {
    policy_rate:   'ECBMRRFR',             // ECB Main Refinancing Rate
    bond_10y:      'IRLTLT01DEM156N',      // Germany 10Y Govt Bond Yield (OECD MEI)
    core_cpi:      'CPGRLE01DEM657N',      // Core CPI excl. food & energy YoY % (OECD)
    cpi_yoy:       'CPALTT01DEM657N',      // Headline CPI YoY %
    unemployment:  'LMUNRRTTDEM156S',      // Germany unemployment rate (Bundesagentur für Arbeit via OECD)
    youth_unemp:   'SLUEM1524ZSDEA',       // Youth unemployment 15–24 (World Bank via FRED)
    labor_part:    null,                   // LRAC64TTDEM156S no longer on FRED → WB fallback
    // govt_debt removed — GGGDTP01DEA156N returns HTTP 400; IMF DataMapper is primary
  },

  JPN: {
    policy_rate:   'IRSTCB01JPM156N',      // Bank of Japan policy rate proxy (OECD)
    bond_10y:      'IRLTLT01JPM156N',      // Japan 10Y Govt Bond Yield (OECD)
    core_cpi:      'CPGRLE01JPM657N',      // Core CPI YoY % (OECD, 657N = same period prev year)
    cpi_yoy:       'CPALTT01JPM657N',      // Headline CPI YoY %
    unemployment:  'LRUNTTTTJPM156S',      // Unemployment rate (OECD)
    youth_unemp:   'SLUEM1524ZSJPA',       // Youth unemployment (World Bank via FRED)
    labor_part:    'LRAC64TTJPM156S',      // Labour force participation (OECD)
    // govt_debt removed — GGGDTP01JPA156N returns HTTP 400; IMF DataMapper is primary
  },

  FRA: {
    policy_rate:   'ECBMRRFR',
    bond_10y:      'IRLTLT01FRM156N',
    core_cpi:      'CPGRLE01FRM657N',
    cpi_yoy:       'CPALTT01FRM657N',
    unemployment:  'LRUNTTTTFRM156S',
    youth_unemp:   'SLUEM1524ZSFRA',
    labor_part:    'LRAC64TTFRM156S',
    // govt_debt removed — GGGDTP01FRA156N returns HTTP 400
  },

  GBR: {
    policy_rate:   'IRSTCB01GBM156N',      // Bank of England rate proxy (OECD)
    bond_10y:      'IRLTLT01GBM156N',
    core_cpi:      'CPGRLE01GBM657N',
    cpi_yoy:       'CPALTT01GBM657N',
    unemployment:  'LRUNTTTTGBM156S',
    youth_unemp:   'SLUEM1524ZSGBA',
    labor_part:    'LRAC64TTGBM156S',
    // govt_debt removed — GGGDTP01GBA156N returns HTTP 400
  },

  ITA: {
    policy_rate:   'ECBMRRFR',
    bond_10y:      'IRLTLT01ITM156N',
    core_cpi:      'CPGRLE01ITM657N',
    cpi_yoy:       'CPALTT01ITM657N',
    unemployment:  'LRUNTTTTITM156S',
    youth_unemp:   'SLUEM1524ZSITA',
    labor_part:    'LRAC64TTITM156S',
    // govt_debt removed — GGGDTP01ITA156N returns HTTP 400
  },

  CAN: {
    policy_rate:   'IRSTCB01CAM156N',
    bond_10y:      'IRLTLT01CAM156N',
    core_cpi:      'CPGRLE01CAM657N',
    cpi_yoy:       'CPALTT01CAM657N',
    unemployment:  'LRUNTTTTCAM156S',
    youth_unemp:   'SLUEM1524ZSCAA',
    labor_part:    'LRAC64TTCAM156S',
    // govt_debt removed — GGGDTP01CAA156N returns HTTP 400
  },

  CHN: {
    // China is not an OECD member — OECD MEI series don't exist.
    policy_rate:   'IRSTCB01CNM156N',      // China interbank rate (OECD has partial)
    bond_10y:      null,                   // No free API — manual-data.json
    core_cpi:      null,                   // Not in OECD dataset — manual-data.json
    cpi_yoy:       'CPALTT01CNM657N',      // OECD has some China CPI data
    unemployment:  null,                   // China official data unreliable on FRED
    youth_unemp:   null,
    labor_part:    null,
    // govt_debt removed — GGGDTP01CNA156N returns HTTP 400
  },

  KOR: {
    policy_rate:   'IRSTCB01KRM156N',
    bond_10y:      'IRLTLT01KRM156N',
    core_cpi:      'CPGRLE01KRM657N',
    cpi_yoy:       'CPALTT01KRM657N',
    unemployment:  'LRUNTTTTKRM156S',
    youth_unemp:   'SLUEM1524ZSKRA',
    labor_part:    'LRAC64TTKRM156S',
    // govt_debt removed — GGGDTP01KRA156N returns HTTP 400
  },

  AUS: {
    policy_rate:   'IRSTCB01AUM156N',
    bond_10y:      'IRLTLT01AUM156N',
    core_cpi:      'CPGRLE01AUM657N',
    cpi_yoy:       null,                   // CPALTT01AUM657N returns HTTP 400 → WB fallback
    unemployment:  'LRUNTTTTAUM156S',
    youth_unemp:   'SLUEM1524ZSAUA',
    labor_part:    'LRAC64TTAUM156S',
    // govt_debt removed — GGGDTP01AUA156N returns HTTP 400
  },

  BRA: {
    // Brazil is not OECD — limited MEI coverage
    policy_rate:   'IRSTCB01BRM156N',
    bond_10y:      'IRLTLT01BRM156N',
    core_cpi:      null,                   // No OECD core CPI — manual-data.json
    cpi_yoy:       'CPALTT01BRM657N',      // OECD has partial Brazil data
    unemployment:  'LRUNTTTTBRM156S',
    youth_unemp:   'SLUEM1524ZSBRA',
    labor_part:    null,
    // govt_debt removed — GGGDTP01BRA156N returns HTTP 400
  },

  IND: {
    // India is not OECD — limited MEI coverage
    policy_rate:   'IRSTCB01INM156N',
    bond_10y:      'IRLTLT01INM156N',
    core_cpi:      null,                   // No OECD core CPI — manual-data.json
    cpi_yoy:       'CPALTT01INM657N',
    unemployment:  null,                   // India unemployment not well-covered on FRED
    youth_unemp:   null,
    labor_part:    null,
    // govt_debt removed — GGGDTP01INA156N returns HTTP 400
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   WORLD BANK — fallback for GDP (USD standardised), demographics, trade in USD,
   and all non-OECD country metrics that FRED doesn't cover
   ══════════════════════════════════════════════════════════════════════════════ */

const WB_ONLY_METRICS = {
  gdp_nominal:     'NY.GDP.MKTP.CD',   // No FRED equivalent (USD, all countries)
  gdp_growth:      'NY.GDP.MKTP.KD.ZG',// Annual real growth (WB more comparable)
  gdp_per_capita:  'NY.GDP.PCAP.CD',   // USD per capita (all countries)
  current_account: 'BN.CAB.XOKA.GD.ZS',// % GDP (all countries)
  trade_balance_wb:'NE.RSB.GNFS.CD',   // USD (for non-US countries)
  primary_balance: 'GC.NLD.TOTL.GD.ZS',
  govt_expenditure:'GC.XPN.TOTL.GD.ZS',
  population:      'SP.POP.TOTL',
  pop_growth:      'SP.POP.GROW',
  old_age_dep:     'SP.POP.DPND.OL',
  // Fallbacks for non-OECD countries where FRED series is null:
  cpi_yoy_fb:      'FP.CPI.TOTL.ZG',
  unemployment_fb: 'SL.UEM.TOTL.ZS',
  youth_unemp_fb:  'SL.UEM.1524.ZS',
  labor_part_fb:   'SL.TLF.ACTI.ZS',
  govt_debt_fb:    'GC.DOD.TOTL.GD.ZS',
};

/* ══════════════════════════════════════════════════════════════════════════════
   METRIC DEFINITIONS — used for card rendering and category filtering
   source field is informational; actual source resolved at runtime per country
   ══════════════════════════════════════════════════════════════════════════════ */

const METRIC_DEFINITIONS = [
  // Growth & Output  (World Bank — no FRED equivalent in USD for all countries)
  { id: 'gdp_nominal',        label: 'GDP (Nominal)',            unit: 'USD', category: 'growth',      format: 'trillions', colorize: false },
  { id: 'gdp_growth',         label: 'Real GDP Growth',          unit: '%',   category: 'growth',      format: 'pct',       colorize: true  },
  { id: 'gdp_per_capita',     label: 'GDP per Capita',           unit: 'USD', category: 'growth',      format: 'thousands', colorize: false },

  // Prices & Inflation  (FRED primary → WB fallback)
  { id: 'inflation_cpi',      label: 'Inflation CPI (YoY)',      unit: '%',   category: 'inflation',   format: 'pct',       colorize: 'inv' },
  { id: 'core_inflation',     label: 'Core Inflation',           unit: '%',   category: 'inflation',   format: 'pct',       colorize: 'inv' },

  // Labor Market  (FRED primary → WB fallback)
  { id: 'unemployment',       label: 'Unemployment Rate',        unit: '%',   category: 'labor',       format: 'pct',       colorize: 'inv' },
  { id: 'youth_unemployment', label: 'Youth Unemployment',       unit: '%',   category: 'labor',       format: 'pct',       colorize: 'inv' },
  { id: 'labor_force_part',   label: 'Labor Force Part. Rate',   unit: '%',   category: 'labor',       format: 'pct',       colorize: false },

  // Fiscal  (FRED primary → WB fallback)
  { id: 'govt_debt',          label: 'Govt. Debt (% GDP)',       unit: '%',   category: 'fiscal',      format: 'pct',       colorize: 'inv' },
  { id: 'primary_balance',    label: 'Primary Balance (% GDP)',  unit: '%',   category: 'fiscal',      format: 'pct',       colorize: true  },
  { id: 'govt_expenditure',   label: 'Govt. Expenditure (% GDP)',unit: '%',   category: 'fiscal',      format: 'pct',       colorize: false },

  // External  (World Bank — USD trade, % GDP current account)
  { id: 'current_account',    label: 'Current Account (% GDP)',  unit: '%',   category: 'external',    format: 'pct',       colorize: true  },
  { id: 'trade_balance',      label: 'Trade Balance',            unit: 'USD', category: 'external',    format: 'billions',  colorize: true  },

  // Monetary  (FRED primary)
  { id: 'policy_rate',        label: 'Central Bank Rate',        unit: '%',   category: 'monetary',    format: 'pct',       colorize: false },
  { id: 'bond_yield_10y',     label: '10Y Govt Bond Yield',      unit: '%',   category: 'monetary',    format: 'pct',       colorize: false },

  // Demographic  (World Bank)
  { id: 'population',         label: 'Population',               unit: '',    category: 'demographic', format: 'millions',  colorize: false },
  { id: 'pop_growth',         label: 'Population Growth',        unit: '%',   category: 'demographic', format: 'pct',       colorize: false },
  { id: 'old_age_dep',        label: 'Old-Age Dependency Ratio', unit: '%',   category: 'demographic', format: 'pct',       colorize: false },
];

/* ══════════════════════════════════════════════════════════════════════════════
   TIME-SERIES CHARTS
   src:'fred' = monthly FRED data (more granular, more recent)
   src:'wb'   = annual World Bank data (longer history, all countries)
   ══════════════════════════════════════════════════════════════════════════════ */

const CHART_METRICS = [
  // GDP and macro (World Bank annual — all 12 countries, long history)
  { id: 'gdp_growth',     label: 'Real GDP Growth (%)',      src: 'wb', wbCode: 'NY.GDP.MKTP.KD.ZG', unit: '%'  },
  { id: 'gdp_per_capita', label: 'GDP per Capita (USD)',     src: 'wb', wbCode: 'NY.GDP.PCAP.CD',    unit: 'USD'},
  { id: 'current_account',label: 'Current Account (% GDP)', src: 'wb', wbCode: 'BN.CAB.XOKA.GD.ZS', unit: '%'  },
  { id: 'govt_debt_wb',   label: 'Govt. Debt — General (% GDP)', src: 'imf', imfCode: 'GGXWDG_NGDP', unit: '%' },

  // Inflation — World Bank annual (covers all 12 countries reliably)
  { id: 'inflation_chart',  label: 'Headline CPI Inflation (%)',  src: 'wb',   wbCode: 'FP.CPI.TOTL.ZG', unit: '%', category: 'inflation' },

  // FRED monthly charts (higher frequency, more timely — uses fixed series per country)
  { id: 'unemp_chart',      label: 'Unemployment Rate (%)',       src: 'fred', fredKey: 'unemployment', unit: '%', category: 'labor'    },
  { id: 'policy_rate_chart',label: 'Central Bank Rates (%)',      src: 'fred', fredKey: 'policy_rate',  unit: '%', category: 'monetary' },
  { id: 'yield_chart',      label: '10Y Govt Bond Yields (%)',    src: 'fred', fredKey: 'bond_10y',     unit: '%', category: 'monetary' },
];

// Chart colour palette for multi-country compare mode
const CHART_COLORS = [
  '#00d4ff','#00ff88','#ff6b35','#ffd740','#cc66ff',
  '#ff5252','#4da6ff','#00e5cc','#ffab40','#69f0ae',
];
