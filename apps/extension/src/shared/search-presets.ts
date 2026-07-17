/**
 * Common search/shopping destinations for the wheel's "AI identify →
 * open URL" action — mirrors the Android app's SearchPresets so ordinary
 * users pick from a list instead of hand-writing URL prefixes. Editing
 * the raw URL stays available as the advanced "Custom URL…" path.
 */

export interface SearchPreset {
  label: string;
  url: string;
}

export const SEARCH_PRESETS: SearchPreset[] = [
  { label: 'Google Search', url: 'https://www.google.com/search?q=' },
  { label: 'Google Images', url: 'https://www.google.com/search?udm=2&q=' },
  { label: 'Google Shopping', url: 'https://www.google.com/search?udm=28&q=' },
  { label: 'Amazon', url: 'https://www.amazon.com/s?k=' },
  { label: 'eBay', url: 'https://www.ebay.com/sch/i.html?_nkw=' },
  { label: 'Temu', url: 'https://www.temu.com/search_result.html?search_key=' },
  { label: 'AliExpress', url: 'https://www.aliexpress.com/wholesale?SearchText=' },
  { label: 'Taobao 淘宝', url: 'https://s.taobao.com/search?q=' },
  { label: 'JD 京东', url: 'https://search.jd.com/Search?keyword=' },
  { label: 'Xiaohongshu 小红书', url: 'https://www.xiaohongshu.com/search_result?keyword=' },
  { label: 'Bing', url: 'https://www.bing.com/search?q=' },
  { label: 'YouTube', url: 'https://www.youtube.com/results?search_query=' },
  { label: 'Bilibili', url: 'https://search.bilibili.com/all?keyword=' },
  { label: 'X (Twitter)', url: 'https://x.com/search?q=' },
  { label: 'Reddit', url: 'https://www.reddit.com/search/?q=' },
  { label: 'Zhihu 知乎', url: 'https://www.zhihu.com/search?type=content&q=' },
  { label: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=' },
  { label: 'arXiv', url: 'https://arxiv.org/search/?searchtype=all&query=' },
  { label: 'Google Scholar', url: 'https://scholar.google.com/scholar?q=' },
  { label: 'GitHub', url: 'https://github.com/search?q=' },
  { label: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];
