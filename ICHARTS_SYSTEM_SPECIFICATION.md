{\rtf1\ansi\ansicpg1252\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fmodern\fcharset0 Courier-Bold;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\deftab720
\pard\pardeftab720\partightenfactor0

\f0\b\fs26 \cf0 \expnd0\expndtw0\kerning0
\outl0\strokewidth0 \strokec2 # ICHARTS_SYSTEM_SPECIFICATION.md\
\
## Product Requirements Document & Architecture Blueprint\
### Reverse-Engineering Analysis of app.icharts.co.il\
\
---\
\
## 1. Executive Summary\
\
iCharts is a lightweight, dark-mode-only financial intelligence dashboard aimed at retail investors who track both US and Israeli (TASE) equities. Contrary to what the product name suggests, the application is **not** a technical-trading terminal \'97 there are no candlestick charts, no drawing tools, no technical indicator overlays (RSI/MACD/Bollinger), and no dedicated stock screener/scanner module in the current build. Instead, the product's center of gravity is **fundamental analysis**: a company profile page with expandable valuation/balance-sheet/margin metrics, a simple area-line price chart with preset time ranges, and a deep tab system covering income statements, balance sheets, cash flow, quarterly/annual reports, ratios, analyst estimates, peer comparison, and a self-serve valuation calculator. Portfolio and Watchlist modules exist as manual-entry trackers (no brokerage linkage detected). Several sections (Macro, Score, AI Insights) are explicitly stubbed as "coming soon," indicating this is an MVP/early-access build.\
\
The UI follows a clean shadcn/ui-style dark theme with card-based widgets, a fixed left icon-and-label sidebar (collapsible to icon-only), a global omnibox-style search with multi-exchange typeahead, and monospace typography for all numeric/price data to aid scannability. Green/red semantic coloring is used consistently for gains/losses. The one standout differentiator is native handling of dual currency/exchange contexts \'97 the same search result list surfaces a ticker across NASDAQ, LSE, XETRA, TLV (Tel Aviv), NEO, and MEX listings, each tagged with its native currency, and the TASE listing renders prices in agorot ("ILA") with shekel (\uc0\u8362 ) formatted deltas and market cap.\
\
---\
\
## 2. Feature Inventory (Module by Module)\
\
### 2.1 Global Shell / Navigation\
- Fixed left sidebar with logo/wordmark ("iCharts \'97 Financial Intelligence"), collapsible via a toggle button to an icon-only rail.\
- Five primary routes: **Home** (`/`), **Watchlist** (`/watchlist`), **Portfolio** (`/portfolio`), **Macro** (`/macro` \'97 placeholder), **Settings** (`/settings`).\
- Global top bar: full-width search input ("Search stocks, symbol, companies...") with live typeahead, and a user-avatar menu (initials badge) opening a dropdown with **Account**, **Payment**, **Contact**, and **Logout**.\
- Ticker/company detail pages live under `/analysis/[SYMBOL]` (e.g. `/analysis/AAPL`, `/analysis/TEVA.TA`) and are reached only via search selection, not a persistent nav item.\
- No breadcrumbs; back-navigation relies on browser history or re-search.\
\
### 2.2 Home / Market Summary Dashboard\
- **Market Summary** widget: 6 index/asset cards (TA-125, S&P 500, NASDAQ Composite, Dow Jones, Russell 2000, Bitcoin USD) each showing logo placeholder, name, symbol, last price, absolute change, and % change with directional arrow icon and green/red coloring.\
- **Most Active** widget: a responsive 3-column grid of individual stock cards (logo, company name, symbol, price, change), populated with a mix of high-volatility large caps and penny stocks \'97 appears to be a "most active/most volatile" feed rather than a curated watchlist.\
- Cards use consistent skeleton/loading placeholders before data hydration.\
\
### 2.3 Watchlist\
- Multi-list support: a dropdown selector plus a "New List" button opens a **Create New Watchlist** modal (name input + Create List button).\
- Summary stat cards: Total Stocks, Gainers, Losers (all zero-state by default).\
- Empty state: icon + "No Watchlist Selected" + prompt to create one.\
- No evidence of drag-and-drop reordering, tagging, or alerting features in this build.\
\
### 2.4 Portfolio\
- **Portfolio Overview** header: total value, total gain/loss (absolute + %), and a currency toggle switch (USD / ILS \'97 "$" / "\uc0\u8362 ") affecting the entire page's denomination.\
- Three summary cards: **Total Dividends** (Dividends Paid, Dividends Yield), **Cash Balance** (Cash USD, Cash ILS), **Daily Gain/Loss** (Gain/Loss $, Gain/Loss %).\
- **Add Stock** action opens an **Add New Stock** modal with three manual fields: Stock Symbol, Number of Shares, Purchase Price \'97 confirming this is a manually-tracked paper-portfolio model, not a linked-brokerage integration.\
- Empty state: "Holdings are empty" with a call-to-action button.\
\
### 2.5 Macro\
- Entirely a placeholder: wrench icon, "Feature Coming Soon" / "Macro in development" messaging, and a "Back to dashboard" button. No functional content shipped yet \'97 presumably intended for macro/economic indicators (rates, inflation, indices) in a future release.\
\
### 2.6 Settings\
- Single "General" card: **Theme** dropdown (System/Light/Dark implied), **Language** dropdown (English shown; likely Hebrew as a second option given the .il domain and RTL market), and a "Reset to Default" button.\
\
### 2.7 Global Search / Symbol Resolution\
- Typeahead activates after a few keystrokes with a "Searching..." loading state, then returns a ranked list of cross-listed instruments for the query, each row showing: ticker, exchange code (NASDAQ, LSE, XETRA, NEO, MEX, TLV, OTC, CNQ...), company/instrument name, and a right-aligned currency code badge (USD, GBp, EUR, CAD, MXN, ILA).\
- Selecting a result routes to `/analysis/\{TICKER\}`.\
\
### 2.8 Company Analysis Page (the "chart" experience)\
This is the richest module and is organized as a top profile block + a tabbed financial-data explorer.\
\
**Profile header block**\
- Company logo, name, ticker | exchange, an info ("i") icon that reveals a hover tooltip with a full company description (sourced from what is likely a third-party fundamentals API).\
- Key facts: Sector, Industry, Website (external link), CEO.\
- Four collapsible accordion groups, each independently expandable/collapsible: **Financials** (Market Cap, P/E, FWD P/E, FWD PEG, P/CF), **Yields** (Earnings Yield, Cash Flow Yield, Free Cash Flow Yield, Dividend Yield, Payout Ratio), **Balances** (Total Cash, Total Debt, Net Cash Position), **Margins** (Gross Margin, Operating Margin, Net Income Margin).\
\
**Price chart block**\
- Large price readout with absolute/percent change, plus a secondary "Post" (post-market) price line showing post-market price and change with a full timestamp including timezone (e.g., "GMT+0300 Israel Daylight Time") \'97 confirms pre/post-market awareness even without a distinct market-session badge system.\
- Time-range selector as a pill/segmented control: **1D, 5D, 1M, 6M, YTD, 1Y, 3Y, 5Y, 10Y, Max**. Each range re-fetches and redraws.\
- The chart itself is a single-series **area/line chart** (gradient-filled) with a hover crosshair tooltip showing date + price. There is **no** candlestick/OHLC mode, no chart-type switcher, no volume pane, no technical indicator picker, and no drawing toolbar \'97 a materially simpler engine than a TradingView-style widget.\
\
**Tabbed data explorer** (tabs: Income \'b7 Balance \'b7 Cash Flow \'b7 Reports \'b7 Ratios \'b7 Estimates \'b7 Compare \'b7 Score \'b7 Valuation \'b7 AI Insights)\
- **Income**: "Income Statement Analysis" \'97 six-plus bar charts (Total Revenues, Gross Profit, Operating Income, Net Income, Earnings Per Share, Shares Outstanding Diluted, Rule of 40, Dividends Per Share), each with a fullscreen-expand icon, annual bars 2022\uc0\u8594 TTM.\
- **Balance**: "Balance Sheet Analysis" \'97 Short-term Position (mini bar + legend), Total Structure (Assets/Liabilities/Equity), Debt vs Liquidity, each with descriptive captions and color-coded legends.\
- **Cash Flow**: "Cash Flow Analysis" \'97 cash generation/capital efficiency bar charts (loading-state captured; same visual pattern as Income/Balance).\
- **Reports**: "Financial Reports" \'97 a Quarterly/Annual toggle driving a dense data table (Metric \'d7 last 4 periods \'d7 YOY column), grouped by section headers like "REVENUE & PROFITABILITY" and "SHARE DATA".\
- **Ratios**: "Financial Ratios Analysis" \'97 dashed-gridline line/area charts (e.g., Return on Equity) with explanatory captions under each chart.\
- **Estimates**: "Analyst Estimates" \'97 Quarterly/Annual toggle; tables for Revenue and EPS annual estimates with columns Fiscal Period Ending, Estimate, YoY Growth %, Average, Low, High, # of Analysts, plus a "beat"/"miss" tag per historical period.\
- **Compare**: "Stock Comparison" \'97 add-a-ticker input to benchmark up to 5 symbols side-by-side across the same metric set (Market Cap, etc.) in a column-per-stock table.\
- **Score**: placeholder ("Feature in development").\
- **Valuation**: an interactive **Valuation Tool** \'97 inputs for Base Revenue, Forecast Years, Revenue Growth Rate %, Target Profit Margin %, current Year, and three editable P/E multiples (Low/Base/High). Outputs a Revenue & Profit Forecast table plus three color-coded **Target Price Scenario** cards (red/amber/green) each showing P/E Multiple, Target Price, Estimated Market Cap, and Annual Return, plus an "Investment Summary" strip.\
- **AI Insights**: placeholder ("AI-powered analysis is on the way...").\
\
### 2.9 TASE vs. US Market Differentiation\
- No separate "market switch" toggle exists; differentiation is implicit and metadata-driven:\
  - Search results tag each row with an exchange code (NASDAQ vs. TLV) and a currency code (USD vs. ILA).\
  - On the analysis page, the ticker line shows `SYMBOL.TA | TLV` for Israeli listings vs. `SYMBOL | NASDAQ` for US ones.\
  - Price is prefixed with a currency label \'97 `$` for USD tickers, `ILA` (agorot) for TASE tickers \'97 and the absolute change uses a `\uc0\u8362 ` (shekel) glyph rather than `$`.\
  - Market Cap and other monetary fields switch currency symbol accordingly (e.g., `\uc0\u8362 111.57B` for Teva vs. `$4.89T` for Apple).\
  - The Home page's Market Summary includes the TA-125 index (`^TA125.TA`) alongside US indices, so Israeli macro context is surfaced even on the default dashboard.\
\
### 2.10 Absent / Not-Found Features (relative to the brief)\
To be fully transparent for planning purposes, the following items requested for documentation were **not present** in the live app and should be treated as gaps to design fresh rather than clone: a dedicated Stock Screener/Scanner page; heatmaps; candlestick/Heikin-Ashi/bar chart types; technical indicators (RSI, MACD, Bollinger Bands, moving averages); drawing tools (trendlines, Fibonacci, S/R lines); intraday sub-minute/hour timeframes (only 1D as the shortest, itself an aggregated intraday line, not tick data); and volume-leader or pre/post-market badge components beyond the single "Post:" price line.\
\
---\
\
## 3. Data Schema & API Requirements\
\
To rebuild equivalent functionality, the following data domains and fields need to be sourced from a financial data API (e.g., a fundamentals+quotes provider):\
\
**Instrument / Symbol Resolution**\
`symbol, exchangeCode (NASDAQ/TLV/LSE/XETRA/NEO/MEX/OTC/CNQ), companyName, currencyCode, instrumentType (equity/etf/index/crypto), logoUrl`\
\
**Real-time / Delayed Quote**\
`lastPrice, changeAbs, changePct, postMarketPrice, postMarketChangeAbs, postMarketChangePct, quoteTimestamp, timezone, marketSession (pre/regular/post/closed)`\
\
**Historical Price Series** (per selected range: 1D/5D/1M/6M/YTD/1Y/3Y/5Y/10Y/Max)\
`timestamp, close (and open/high/low/volume if upgrading to candlesticks later)`\
\
**Company Profile**\
`sector, industry, website, ceo, description (long-form), employeeCount (optional), headquarters (optional)`\
\
**Valuation Snapshot**\
`marketCap, peRatio, forwardPE, forwardPEG, priceToCashFlow`\
\
**Yields**\
`earningsYield, cashFlowYield, freeCashFlowYield, dividendYield, payoutRatio`\
\
**Balance Snapshot**\
`totalCash, totalDebt, netCashPosition`\
\
**Margins**\
`grossMargin, operatingMargin, netIncomeMargin`\
\
**Income Statement (annual + TTM, multi-year array)**\
`fiscalYear, totalRevenue, grossProfit, operatingIncome, netIncome, eps, sharesOutstandingDiluted, dividendsPerShare, ruleOf40Score`\
\
**Balance Sheet (annual + MRQ array)**\
`cashAndShortTerm, totalCurrentAssets, totalCurrentLiabilities, totalAssets, totalLiabilities, totalEquity, totalDebt`\
\
**Cash Flow Statement (annual array)**\
`operatingCashFlow, capex, freeCashFlow, financingCashFlow, investingCashFlow`\
\
**Quarterly/Annual Reports Table**\
`period, metricGroup (Revenue & Profitability / Share Data / etc.), metricName, value, yoyChangePct`\
\
**Ratios (time series)**\
`period, roe, roa, currentRatio, quickRatio, debtToEquity, ...`\
\
**Analyst Estimates**\
`fiscalPeriodEnding, estimateValue, yoyGrowthPct, averageEstimate, lowEstimate, highEstimate, numberOfAnalysts, actualVsEstimate (beat/miss/inline)` \'97 needed for both Revenue and EPS, quarterly and annual.\
\
**Peer Comparison**\
`symbol[] (up to 5), sharedMetricSet (same as valuation snapshot fields above)`\
\
**Valuation Tool Inputs (user-editable, client-side compute)**\
`baseRevenue, forecastYears, revenueGrowthRatePct, targetProfitMarginPct, peMultipleLow/Base/High` \uc0\u8594  derive `projectedRevenue[], projectedMargin[], targetPrice, estimatedMarketCap, impliedAnnualReturn` per scenario \'97 this can be a pure front-end calculator requiring only the current price + shares outstanding + one revenue baseline from the API.\
\
**User-Owned Data (own DB, not third-party API)**\
`watchlists(id, name, userId), watchlistItems(watchlistId, symbol)`\
`portfolioHoldings(id, userId, symbol, shares, purchasePrice, purchaseDate)`\
`userSettings(userId, theme, language, defaultCurrency)`\
\
---\
\
## 4. Recommended Next.js & Lightweight-Charts Component Structure\
\
Proposed structure inside `/Users/YUVAL/Claude/charts`:\
\
```\
charts/\
\uc0\u9500 \u9472  app/\
\uc0\u9474   \u9500 \u9472  (dashboard)/\
\uc0\u9474   \u9474   \u9500 \u9472  page.tsx                      # Home \'97 Market Summary + Most Active\
\uc0\u9474   \u9474   \u9500 \u9472  watchlist/page.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  portfolio/page.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  macro/page.tsx                # stub for now\
\uc0\u9474   \u9474   \u9500 \u9472  settings/page.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  layout.tsx                    # sidebar + topbar shell\
\uc0\u9474   \u9500 \u9472  analysis/\
\uc0\u9474   \u9474   \u9492 \u9472  [symbol]/\
\uc0\u9474   \u9474      \u9500 \u9472  page.tsx                   # server component: fetch profile+quote\
\uc0\u9474   \u9474      \u9492 \u9472  tabs/\
\uc0\u9474   \u9474         \u9500 \u9472  income/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  balance/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  cash-flow/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  reports/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  ratios/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  estimates/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  compare/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  score/page.tsx\
\uc0\u9474   \u9474         \u9500 \u9472  valuation/page.tsx\
\uc0\u9474   \u9474         \u9492 \u9472  ai-insights/page.tsx\
\uc0\u9474   \u9492 \u9472  api/\
\uc0\u9474      \u9500 \u9472  quotes/[symbol]/route.ts\
\uc0\u9474      \u9500 \u9472  search/route.ts\
\uc0\u9474      \u9500 \u9472  fundamentals/[symbol]/route.ts\
\uc0\u9474      \u9492 \u9472  history/[symbol]/route.ts\
\uc0\u9500 \u9472  components/\
\uc0\u9474   \u9500 \u9472  layout/\
\uc0\u9474   \u9474   \u9500 \u9472  Sidebar.tsx                   # collapsible, icon+label rail\
\uc0\u9474   \u9474   \u9500 \u9472  Topbar.tsx                    # search + avatar menu\
\uc0\u9474   \u9474   \u9492 \u9472  UserMenu.tsx\
\uc0\u9474   \u9500 \u9472  search/\
\uc0\u9474   \u9474   \u9500 \u9472  SymbolSearchInput.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  SymbolSearchResultRow.tsx     # exchange + currency badge\
\uc0\u9474   \u9500 \u9472  dashboard/\
\uc0\u9474   \u9474   \u9500 \u9472  MarketSummaryGrid.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  IndexCard.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  MostActiveGrid.tsx\
\uc0\u9474   \u9500 \u9472  watchlist/\
\uc0\u9474   \u9474   \u9500 \u9472  WatchlistSelector.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  CreateWatchlistModal.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  WatchlistStatsCards.tsx\
\uc0\u9474   \u9500 \u9472  portfolio/\
\uc0\u9474   \u9474   \u9500 \u9472  PortfolioOverviewHeader.tsx   # incl. currency toggle\
\uc0\u9474   \u9474   \u9500 \u9472  AddStockModal.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  HoldingsTable.tsx\
\uc0\u9474   \u9500 \u9472  ticker/\
\uc0\u9474   \u9474   \u9500 \u9472  CompanyProfileHeader.tsx      # logo, name, sector/industry, CEO\
\uc0\u9474   \u9474   \u9500 \u9472  CompanyDescriptionTooltip.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  MetricAccordionGroup.tsx      # reusable for Financials/Yields/Balances/Margins\
\uc0\u9474   \u9474   \u9500 \u9472  PriceHeaderBlock.tsx          # price + post-market line\
\uc0\u9474   \u9474   \u9500 \u9472  TimeRangeSelector.tsx         # 1D...Max pill control\
\uc0\u9474   \u9474   \u9492 \u9472  PriceAreaChart.tsx            # Lightweight-Charts wrapper (area series)\
\uc0\u9474   \u9500 \u9472  financials/\
\uc0\u9474   \u9474   \u9500 \u9472  FinancialBarChartCard.tsx     # reusable, expandable chart card\
\uc0\u9474   \u9474   \u9500 \u9472  FinancialsGrid.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  ReportsTable.tsx              # grouped rows + YoY column\
\uc0\u9474   \u9474   \u9492 \u9472  RatioLineChartCard.tsx\
\uc0\u9474   \u9500 \u9472  estimates/\
\uc0\u9474   \u9474   \u9500 \u9472  EstimatesTable.tsx            # revenue/EPS, beat/miss tag\
\uc0\u9474   \u9474   \u9492 \u9472  PeriodToggle.tsx              # Quarterly/Annual\
\uc0\u9474   \u9500 \u9472  compare/\
\uc0\u9474   \u9474   \u9500 \u9472  CompareTable.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  AddCompareSymbolInput.tsx\
\uc0\u9474   \u9500 \u9472  valuation/\
\uc0\u9474   \u9474   \u9500 \u9472  ValuationAssumptionsForm.tsx\
\uc0\u9474   \u9474   \u9500 \u9472  RevenueForecastTable.tsx\
\uc0\u9474   \u9474   \u9492 \u9472  TargetPriceScenarioCard.tsx   # low/base/high, color-coded\
\uc0\u9474   \u9492 \u9472  shared/\
\uc0\u9474      \u9500 \u9472  StatCard.tsx\
\uc0\u9474      \u9500 \u9472  CurrencyBadge.tsx             # USD/ILA/EUR/etc.\
\uc0\u9474      \u9500 \u9472  ChangeIndicator.tsx           # colored arrow + %/abs\
\uc0\u9474      \u9492 \u9472  EmptyState.tsx\
\uc0\u9500 \u9472  lib/\
\uc0\u9474   \u9500 \u9472  api/                             # typed fetchers per data domain in Section 3\
\uc0\u9474   \u9500 \u9472  format/\
\uc0\u9474   \u9474   \u9500 \u9472  currency.ts                   # USD $, ILA agorot, \u8362  shekel formatting\
\uc0\u9474   \u9474   \u9492 \u9472  number.ts\
\uc0\u9474   \u9492 \u9472  charts/\
\uc0\u9474      \u9492 \u9472  lightweightChartTheme.ts      # maps design tokens (Section 2 colors) to chart theme\
\uc0\u9500 \u9472  stores/                             # zustand or React Query cache for watchlist/portfolio/settings\
\uc0\u9492 \u9472  styles/\
   \uc0\u9492 \u9472  tokens.css                       # HSL CSS variables (see design tokens below)\
```\
\
**Design tokens observed** (CSS custom properties, HSL format, dark theme only detected):\
`--background: 220 27% 8%` (~#0F131A) \'b7 `--card: 220 25% 10%` \'b7 `--foreground: 220 10% 95%` \'b7 `--primary: 214 84% 56%` (~#3B82F6, Tailwind blue-500) \'b7 `--success: 142 76% 42%` (~#1ABC55, gains) \'b7 `--destructive: 0 84% 65%` (~#F16060, losses) \'b7 `--border: 220 20% 18%` \'b7 `--muted: 220 20% 14%` \'b7 `--accent: 220 25% 16%`.\
Typography: UI text in **Open Sans**; all numeric/price/ticker data in **JetBrains Mono** (with SF Mono/Consolas fallback) for tabular alignment \'97 recommend replicating this dual-font system exactly, as it's a meaningful readability pattern for financial data.\
\
**Lightweight-Charts integration notes**: since the source app only implements a single-series area chart with a time-range pill selector and a hover tooltip (date + price), an MVP clone can ship with `AreaSeries` alone; architect `PriceAreaChart.tsx` so a `seriesType` prop (`area | candlestick | line`) can be added later without breaking the range-selector or tooltip contract \'97 this future-proofs the gap identified in Section 2.10 (no candlesticks/indicators/drawing tools exist yet in the reference product, but your own roadmap may want them).}