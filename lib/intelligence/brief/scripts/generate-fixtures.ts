import { writeFileSync, mkdirSync } from 'fs';
import {
  composeRatingBrief,
  composePerformanceBrief,
  composeQuadrantBrief,
  composePortfolioHoldingBrief,
  composeOverviewBrief,
} from '../index';

const byComposer = {
  rating: [
    {
      input: {
        ticker: 'AAPL',
        daily_trend_score: 4.2,
        daily_rating: 'Strong Uptrend',
        daily_outlook: 'Extended',
        daily_trend_description:
          'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion.',
      },
    },
    {
      input: {
        ticker: 'XLU',
        daily_trend_score: 1.2,
        daily_rating: 'Downtrend',
        daily_outlook: 'Warming',
        daily_trend_description: 'XLU remains in a Downtrend with a Warming outlook on the daily timeframe.',
      },
    },
    { input: { ticker: 'ZZZ' } },
    {
      input: {
        ticker: 'SPY',
        timeframe: 'weekly' as const,
        weekly_trend_score: 3.5,
        weekly_rating: 'Uptrend',
        weekly_outlook: 'Stable',
        weekly_trend_description: 'Continuation is the base case as long as price holds above the 9-week EMA.',
      },
    },
    {
      input: {
        ticker: 'QQQ',
        daily_trend_score: 2.1,
        daily_trend_description: 'QQQ shows mixed EMA alignment on the daily timeframe.',
      },
    },
  ].map((c) => ({ ...c, output: composeRatingBrief(c.input) })),
  performance: [
    {
      input: {
        ticker: 'AAPL',
        performance_strength: 'Strong',
        distance_to_highs: 'Close to Highs',
        daily_performance_description:
          '$AAPL has posted solid recent results, performing broadly in line with main benchmarks. It remains close to its 1-year high, indicating steady absolute performance and continued price stability within an elevated range.',
        daily_performance_summary: 'Strong performer | In line vs benchmarks',
        '1m_percent': 0.05,
        '3m_percent': 0.12,
      },
    },
    {
      input: {
        ticker: 'XLF',
        performance_strength: 'Mixed',
        daily_performance_summary: 'Mixed performer | In line vs benchmarks',
      },
    },
    { input: { ticker: 'NONE' } },
    {
      input: {
        ticker: 'NVDA',
        performance_strength: 'Strong',
        distance_to_highs: 'Medium distance to Highs',
        daily_performance_description: 'NVDA remains a Strong performer versus benchmarks.',
        daily_vs_spy_comparison: '$SPY: Leading',
        daily_vs_sector_comparison: '$XLK: In line',
      },
    },
    {
      input: {
        ticker: 'XLU',
        performance_strength: 'Weak',
        distance_to_highs: 'Far from Highs',
        daily_performance_description: 'XLU shows Weak performance and is Far from Highs.',
      },
    },
  ].map((c) => ({ ...c, output: composePerformanceBrief(c.input) })),
  quadrant: [
    { input: { ticker: 'XLK', pct_from_sma50: 0.05, pct_from_sma200: 0.2 } },
    { input: { ticker: 'XLY', pct_from_sma50: -0.03, pct_from_sma200: 0.08 } },
    { input: { ticker: 'XLU', pct_from_sma50: -0.03, pct_from_sma200: -0.03 } },
    { input: { ticker: 'XLC', pct_from_sma50: 0.01, pct_from_sma200: -0.03 } },
    { input: { ticker: 'NEW' } },
  ].map((c) => ({ ...c, output: composeQuadrantBrief(c.input) })),
  portfolio_holding: [
    {
      input: {
        ticker: 'AAPL',
        daily_rating: 'Uptrend',
        daily_outlook: 'Stable',
        daily_trend_score: 3.1,
        performance_strength: 'Mixed',
        daily_trend_description: 'AAPL remains in an Uptrend with a Stable outlook.',
        daily_performance_description: 'AAPL performance is Mixed versus benchmarks.',
        in_mws_coverage: true,
      },
    },
    { input: { ticker: 'FOO', in_mws_coverage: false } },
    {
      input: {
        ticker: 'MSFT',
        daily_rating: 'Strong Uptrend',
        daily_performance_summary: 'Strong performer | Leading vs benchmarks',
        in_mws_coverage: true,
      },
    },
    { input: { ticker: 'IBM', in_mws_coverage: true } },
    {
      input: {
        ticker: 'AMD',
        performance_strength: 'Strong',
        daily_performance_description: 'AMD shows Strong performance strength.',
        in_mws_coverage: true,
      },
    },
  ].map((c) => ({ ...c, output: composePortfolioHoldingBrief(c.input) })),
  overview: [
    {
      input: {
        ticker: 'AAPL',
        daily_rating: 'Strong Uptrend',
        daily_outlook: 'Extended',
        daily_trend_description:
          'Momentum signals are fully aligned to the upside, with price trading above both EMAs. Price action is healthy, confirming trend strength with limited signs of exhaustion. Continuation is the base case as long as price holds above the 9-week EMA, which serves as the short-term anchor.',
        performance_strength: 'Strong',
        daily_performance_description:
          '$AAPL has posted solid recent results, performing broadly in line with main benchmarks. It remains close to its 1-year high, indicating steady absolute performance and continued price stability within an elevated range.',
        daily_performance_summary: 'Strong performer | In line vs benchmarks',
      },
    },
    { input: { ticker: 'EMPTY' } },
    {
      input: {
        ticker: 'XLK',
        daily_trend_description: 'XLK trend description only.',
      },
    },
    {
      input: {
        ticker: 'XLF',
        daily_performance_description: 'XLF performance description only.',
      },
    },
    {
      input: {
        ticker: 'SPY',
        timeframe: 'weekly' as const,
        weekly_rating: 'Uptrend',
        weekly_trend_description: 'Weekly packaged trend text for SPY.',
        daily_performance_summary: 'Mixed performer | In line vs benchmarks',
      },
    },
  ].map((c) => ({ ...c, output: composeOverviewBrief(c.input) })),
};

mkdirSync('docs/fixtures/brief', { recursive: true });
mkdirSync('lib/intelligence/brief/__fixtures__', { recursive: true });

for (const [name, cases] of Object.entries(byComposer)) {
  const json = JSON.stringify({ composerId: name, version: '1.0.0', cases }, null, 2);
  writeFileSync(`docs/fixtures/brief/${name}.json`, json);
  writeFileSync(`lib/intelligence/brief/__fixtures__/${name}.json`, json);
}

console.log('ok', Object.keys(byComposer));
