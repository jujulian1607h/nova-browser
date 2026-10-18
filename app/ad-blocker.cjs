const fs = require('node:fs/promises');
const path = require('node:path');

const FILTER_LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt'
];
const UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const REQUEST_TYPES = {
  script: ['script'],
  image: ['image'],
  stylesheet: ['stylesheet'],
  css: ['stylesheet'],
  object: ['object'],
  'object-subrequest': ['object'],
  xmlhttprequest: ['xhr', 'fetch'],
  xhr: ['xhr', 'fetch'],
  subdocument: ['subFrame'],
  frame: ['subFrame'],
  font: ['font'],
  media: ['media'],
  websocket: ['webSocket'],
  ping: ['ping'],
  other: ['other']
};
const FALLBACK_FILTERS = [
  '||doubleclick.net^',
  '||googlesyndication.com^',
  '||googleadservices.com^',
  '||adservice.google.com^',
  '||adnxs.com^',
  '||adform.net^',
  '||adsrvr.org^',
  '||adservice.google.*^',
  '||amazon-adsystem.com^',
  '||criteo.com^',
  '||criteo.net^',
  '||outbrain.com^',
  '||taboola.com^',
  '||tracking.*^'
];

function parseFilter(line) {
  const value = line.trim();
  if (!value || value.startsWith('!') || value.startsWith('[') || value.includes('##') || value.includes('#@#')) {
    return null;
  }

  const exception = value.startsWith('@@');
  const rawRule = exception ? value.slice(2) : value;
  const separator = rawRule.lastIndexOf('$');
  const pattern = separator === -1 ? rawRule : rawRule.slice(0, separator);
  const optionText = separator === -1 ? '' : rawRule.slice(separator + 1);
  if (!pattern || pattern.startsWith('@@')) return null;

  const rule = {
    pattern,
    exception,
    important: false,
    matchCase: false,
    includeDomains: [],
    excludeDomains: [],
    includeTypes: [],
    excludeTypes: [],
    thirdParty: null,
    document: false,
    popup: false
  };

  for (const option of optionText.split(',').filter(Boolean)) {
    if (option === 'important') {
      rule.important = true;
    } else if (option === 'match-case') {
      rule.matchCase = true;
    } else if (option === 'third-party' || option === '3p') {
      rule.thirdParty = true;
    } else if (option === '~third-party' || option === '~3p') {
      rule.thirdParty = false;
    } else if (option === 'first-party' || option === '1p') {
      rule.thirdParty = false;
    } else if (option === 'document') {
      rule.document = true;
    } else if (option === 'popup') {
      rule.popup = true;
    } else if (option === 'all') {
      continue;
    } else if (option.startsWith('domain=')) {
      for (const domain of option.slice(7).split('|')) {
        if (!domain) continue;
        const excluded = domain.startsWith('~');
        const hostname = normalizeHostname(excluded ? domain.slice(1) : domain);
        if (!hostname) return null;
        (excluded ? rule.excludeDomains : rule.includeDomains).push(hostname);
      }
    } else {
      const excluded = option.startsWith('~');
      const type = excluded ? option.slice(1) : option;
      if (!REQUEST_TYPES[type]) return null;
      (excluded ? rule.excludeTypes : rule.includeTypes).push(...REQUEST_TYPES[type]);
    }
  }

  const regex = patternToRegExp(pattern, rule.matchCase);
  if (!regex) return null;
  rule.regex = regex;
  return rule;
}

function patternToRegExp(pattern, matchCase) {
  let source = '';
  let rest = pattern;
  if (rest.startsWith('||')) {
    rest = rest.slice(2);
    const boundary = rest.search(/[\/^*|]/);
    const host = boundary === -1 ? rest : rest.slice(0, boundary);
    if (!host) return null;
    source = `^(?:[^:/?#]+:)?//(?:[^/?#]*\\.)?${escapeRegExp(host)}`;
    if (boundary === -1) source += '(?=[:/?#]|$)';
    rest = boundary === -1 ? '' : rest.slice(boundary);
  } else if (rest.startsWith('|')) {
    source = '^';
    rest = rest.slice(1);
  }

  let endsWithSeparator = false;
  if (rest.endsWith('|')) {
    endsWithSeparator = true;
    rest = rest.slice(0, -1);
  }
  for (const character of rest) {
    if (character === '*') source += '.*';
    else if (character === '^') source += '(?:[^a-zA-Z0-9_.%-]|$)';
    else source += escapeRegExp(character);
  }
  if (endsWithSeparator) source += '$';

  try {
    return new RegExp(source, matchCase ? '' : 'i');
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHostname(value) {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function hostnameFromUrl(value) {
  try {
    return normalizeHostname(new URL(value).hostname);
  } catch {
    return '';
  }
}

function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isThirdParty(requestHost, sourceHost) {
  if (!requestHost || !sourceHost) return false;
  return !matchesDomain(requestHost, sourceHost) && !matchesDomain(sourceHost, requestHost);
}

function matchesRule(
  rule,
  request,
  requestHost = hostnameFromUrl(request.url),
  sourceHost = hostnameFromUrl(request.documentUrl || request.referrer || '')
) {
  const thirdParty = isThirdParty(requestHost, sourceHost);

  if (rule.thirdParty !== null && rule.thirdParty !== thirdParty) return false;
  if (rule.includeTypes.length && !rule.includeTypes.includes(request.type)) return false;
  if (rule.excludeTypes.includes(request.type)) return false;
  if (rule.includeDomains.length && !rule.includeDomains.some((domain) => matchesDomain(sourceHost, domain))) return false;
  if (rule.excludeDomains.some((domain) => matchesDomain(sourceHost, domain))) return false;
  return rule.regex.test(request.url);
}

class AdBlocker {
  constructor({
    settingsPath,
    cachePath,
    onBlocked = () => {},
    onError = () => {},
    getDocumentUrl = (_webContentsId, referrer) => referrer || '',
    fetchImpl = fetch
  }) {
    this.settingsPath = settingsPath;
    this.cachePath = cachePath;
    this.onBlocked = onBlocked;
    this.onError = onError;
    this.getDocumentUrl = getDocumentUrl;
    this.fetchImpl = fetchImpl;
    this.enabled = true;
    this.exceptions = [];
    this.rules = [];
    this.documentExceptions = [];
    this.rulesByGram = new Map();
    this.unindexedRules = [];
    this.updatedAt = null;
    this.blockedCount = 0;
    this.sessions = new WeakSet();
    this.refreshPromise = null;
  }

  async initialize() {
    await Promise.all([this.loadSettings(), this.loadCache()]);
    if (this.rules.length === 0) this.setRules(FALLBACK_FILTERS);

    if (!this.updatedAt || Date.now() - Date.parse(this.updatedAt) >= UPDATE_INTERVAL) {
      this.refreshFilters().catch((error) => this.onError(error));
    }
    this.refreshTimer = setInterval(() => {
      this.refreshFilters().catch((error) => this.onError(error));
    }, UPDATE_INTERVAL);
    this.refreshTimer.unref();
  }

  async loadSettings() {
    try {
      const settings = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'));
      if (typeof settings.enabled === 'boolean') this.enabled = settings.enabled;
      if (Array.isArray(settings.exceptions)) {
        this.exceptions = [...new Set(settings.exceptions.map(normalizeHostname).filter(Boolean))];
      }
    } catch (error) {
      if (error.code !== 'ENOENT') this.onError(error);
    }
  }

  async loadCache() {
    try {
      const cache = JSON.parse(await fs.readFile(this.cachePath, 'utf8'));
      if (!Array.isArray(cache.lists) || cache.lists.some((list) => typeof list !== 'string')) {
        throw new Error('Le cache des filtres du bloqueur est invalide.');
      }
      this.setRules(cache.lists);
      if (this.rules.length === 0) throw new Error('Le cache ne contient aucune règle de filtrage valide.');
      this.updatedAt = typeof cache.updatedAt === 'string' && Number.isFinite(Date.parse(cache.updatedAt))
        ? cache.updatedAt
        : null;
    } catch (error) {
      if (error.code !== 'ENOENT') this.onError(error);
    }
  }

  setRules(lists) {
    this.setParsedRules(lists.flatMap((list) => list.split(/\r?\n/)).map(parseFilter).filter(Boolean));
  }

  setParsedRules(rules) {
    this.rules = rules;
    this.documentExceptions = rules.filter((rule) => rule.exception && rule.document);
    this.rulesByGram = new Map();
    this.unindexedRules = [];
    const indexedRules = [];
    const gramCounts = new Map();
    for (const rule of this.rules.filter((entry) => !entry.document)) {
      const token = rule.pattern.split(/[\*^|]/).filter(Boolean).sort((a, b) => b.length - a.length)[0];
      if (!token || token.length < 3) {
        this.unindexedRules.push(rule);
        continue;
      }
      const grams = new Set();
      const normalizedToken = token.toLowerCase();
      for (let index = 0; index <= normalizedToken.length - 3; index += 1) {
        const gram = normalizedToken.slice(index, index + 3);
        grams.add(gram);
        gramCounts.set(gram, (gramCounts.get(gram) || 0) + 1);
      }
      indexedRules.push({ rule, grams });
    }
    for (const { rule, grams } of indexedRules) {
      const key = [...grams].sort((a, b) => gramCounts.get(a) - gramCounts.get(b))[0];
      const indexed = this.rulesByGram.get(key) || [];
      indexed.push(rule);
      this.rulesByGram.set(key, indexed);
    }
  }

  async refreshFilters() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.downloadFilterLists();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async downloadFilterLists() {
    const lists = await Promise.all(FILTER_LISTS.map(async (url) => {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Échec du téléchargement d’une liste de filtres (${response.status}).`);
      const content = await response.text();
      if (content.length > 20_000_000) throw new Error('Une liste de filtres dépasse la taille autorisée.');
      return content;
    }));

    const rules = lists.flatMap((list) => list.split(/\r?\n/)).map(parseFilter).filter(Boolean);
    if (rules.length === 0) throw new Error('Les listes téléchargées ne contiennent aucune règle valide.');
    const updatedAt = new Date().toISOString();
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    const temporaryPath = `${this.cachePath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify({ lists, updatedAt }), 'utf8');
    await fs.rename(temporaryPath, this.cachePath);
    this.setParsedRules(rules);
    this.updatedAt = updatedAt;
    return this.getState('');
  }

  async saveSettings() {
    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    const temporaryPath = `${this.settingsPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify({
      enabled: this.enabled,
      exceptions: this.exceptions
    }), 'utf8');
    await fs.rename(temporaryPath, this.settingsPath);
  }

  enableInSession(session) {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        const blocked = details.resourceType !== 'mainFrame'
          && this.shouldBlock({
            url: details.url,
            referrer: details.referrer,
            documentUrl: this.getDocumentUrl(details.webContentsId, details.referrer),
            type: details.resourceType
          });
        if (blocked) {
          this.recordBlockedRequest();
        }
        callback({ cancel: blocked });
      }
    );
  }

  recordBlockedRequest() {
    this.blockedCount += 1;
    this.onBlocked(this.blockedCount);
  }

  shouldBlock(request, popupOnly = false) {
    const requestHost = hostnameFromUrl(request.url);
    if (!this.enabled || !requestHost) return false;
    const sourceHost = hostnameFromUrl(request.documentUrl || request.referrer || '');
    if (this.exceptions.includes(sourceHost)) return false;
    const documentUrl = request.documentUrl || request.referrer || '';
    if (documentUrl && this.documentExceptions.some((rule) => matchesRule(
      rule,
      { url: documentUrl, documentUrl, type: 'mainFrame' }
    ))) return false;

    let allowedByException = false;
    let blockedByRule = false;
    let blockedByImportantRule = false;
    const url = request.url.toLowerCase();
    const candidates = new Set(this.unindexedRules);
    for (let index = 0; index <= url.length - 3; index += 1) {
      const rules = this.rulesByGram.get(url.slice(index, index + 3));
      if (rules) {
        for (const rule of rules) candidates.add(rule);
      }
    }
    for (const rule of candidates) {
      if (popupOnly ? (!rule.popup && !rule.exception) : rule.popup) continue;
      if (!matchesRule(rule, request, requestHost, sourceHost)) continue;
      if (rule.exception && rule.important) return false;
      if (rule.exception) allowedByException = true;
      else {
        blockedByRule = true;
        if (rule.important) blockedByImportantRule = true;
      }
    }
    return blockedByImportantRule || (blockedByRule && !allowedByException);
  }

  async setEnabled(enabled) {
    const previous = this.enabled;
    this.enabled = Boolean(enabled);
    try {
      await this.saveSettings();
    } catch (error) {
      this.enabled = previous;
      throw error;
    }
  }

  async toggleException(domain) {
    const hostname = hostnameFromUrl(domain) || normalizeHostname(domain);
    if (!hostname) throw new Error('Impossible de déterminer le site actuel.');
    const previous = this.exceptions;
    if (this.exceptions.includes(hostname)) {
      this.exceptions = this.exceptions.filter((exception) => exception !== hostname);
    } else {
      this.exceptions = [...this.exceptions, hostname];
    }
    try {
      await this.saveSettings();
    } catch (error) {
      this.exceptions = previous;
      throw error;
    }
  }

  getState(url) {
    const hostname = hostnameFromUrl(url);
    return {
      enabled: this.enabled,
      currentDomain: hostname,
      isAllowlisted: this.exceptions.includes(hostname),
      blockedCount: this.blockedCount,
      updatedAt: this.updatedAt,
      filterCount: this.rules.length
    };
  }
}

module.exports = { AdBlocker, matchesRule, parseFilter };
