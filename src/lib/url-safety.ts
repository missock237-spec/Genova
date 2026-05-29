// URL Safety Checker — Protect the system from malicious websites
// Checks URLs against a database blocklist and pattern-based detection.
// Seeds initial blocklist with common malicious patterns on first call.

import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface URLSafetyResult {
  safe: boolean;
  threats: string[];
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface BlockedDomainOptions {
  limit?: number;
  offset?: number;
  threatType?: string;
  severity?: string;
  activeOnly?: boolean;
}

// ============================================================
// Known Malicious Patterns
// ============================================================

// Suspicious TLDs commonly used in phishing/malware
const SUSPICIOUS_TLDS = [
  '.tk', '.ml', '.ga', '.cf', '.gq', // Free Freenom TLDs
  '.xyz', '.top', '.work', '.biz', '.info', // Commonly abused
  '.click', '.link', '.zip', '.review', '.country',
  '.stream', '.download', '.racing', '.win', '.party',
  '.cricket', '.science', '.accountant', '.faith',
];

// Known URL shortener domains (potential for hiding malicious URLs)
const URL_SHORTENERS = [
  'bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly',
  'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'short.io',
  'tiny.cc', 'soo.gd', 's2r.co', 'clicky.me', 'bl.ink',
  'shorturl.at', 'tny.im', 'v.gd', 'qr.ae',
];

// Known malware/phishing domains (initial seed data)
const INITIAL_BLOCKLIST = [
  { domain: 'malware-site.example', reason: 'Known malware distribution site', threatType: 'malware', severity: 'critical' },
  { domain: 'phishing-login.example', reason: 'Phishing site mimicking login pages', threatType: 'phishing', severity: 'critical' },
  { domain: 'drive-by-download.example', reason: 'Drive-by download attack site', threatType: 'malware', severity: 'critical' },
  { domain: 'fake-bank.example', reason: 'Phishing site impersonating a bank', threatType: 'phishing', severity: 'high' },
  { domain: 'crypto-scam.example', reason: 'Cryptocurrency scam site', threatType: 'scam', severity: 'high' },
  { domain: 'tech-support-scam.example', reason: 'Tech support scam site', threatType: 'scam', severity: 'high' },
  { domain: 'ransomware-c2.example', reason: 'Ransomware command and control server', threatType: 'malware', severity: 'critical' },
  { domain: 'credential-harvester.example', reason: 'Credential harvesting site', threatType: 'phishing', severity: 'high' },
  { domain: 'spam-relay.example', reason: 'Known spam relay', threatType: 'spam', severity: 'medium' },
  { domain: 'ad-fraud.example', reason: 'Ad fraud / click fraud site', threatType: 'spam', severity: 'medium' },
];

// ============================================================
// Seed Initial Blocklist (runs once)
// ============================================================

let blocklistSeeded = false;

async function ensureBlocklistSeeded(): Promise<void> {
  if (blocklistSeeded) return;

  try {
    // Check if blocklist has entries
    const count = await db.uRLBlocklist.count();
    if (count === 0) {
      // Seed the initial blocklist
      for (const entry of INITIAL_BLOCKLIST) {
        await db.uRLBlocklist.create({
          data: {
            domain: entry.domain,
            reason: entry.reason,
            threatType: entry.threatType,
            severity: entry.severity,
            source: 'system',
            isActive: true,
          },
        }).catch(() => {
          // Ignore duplicate errors during seed
        });
      }
    }
    blocklistSeeded = true;
  } catch {
    // If seeding fails, don't block the check — pattern-based detection still works
    blocklistSeeded = true;
  }
}

// ============================================================
// Extract Domain from URL
// ============================================================

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Try treating the input as a domain directly
    const cleaned = url.trim().toLowerCase().replace(/^www\./, '');
    // Basic domain validation
    if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(cleaned)) {
      return cleaned;
    }
    return null;
  }
}

// ============================================================
// Check if Domain is Blocked (DB lookup)
// ============================================================

export async function isDomainBlocked(domain: string): Promise<boolean> {
  await ensureBlocklistSeeded();

  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

  const blocked = await db.uRLBlocklist.findFirst({
    where: {
      domain: normalizedDomain,
      isActive: true,
    },
  });

  return !!blocked;
}

// ============================================================
// Pattern-Based Threat Detection
// ============================================================

function detectPatternThreats(url: string, domain: string): { threats: string[]; riskLevel: URLSafetyResult['riskLevel'] } {
  const threats: string[] = [];
  let riskLevel: URLSafetyResult['riskLevel'] = 'none';

  // 1. Check for IP address as domain (common in phishing/malware)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipWithPortPattern = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
  if (ipPattern.test(domain) || ipWithPortPattern.test(domain)) {
    threats.push('IP address used as domain — common in phishing/malware');
    riskLevel = 'high';
  }

  // 2. Check for suspicious TLDs
  const domainLower = domain.toLowerCase();
  for (const tld of SUSPICIOUS_TLDS) {
    if (domainLower.endsWith(tld)) {
      threats.push(`Suspicious TLD detected: ${tld}`);
      if (riskLevel === 'none') riskLevel = 'medium';
      break;
    }
  }

  // 3. Check for URL shorteners
  for (const shortener of URL_SHORTENERS) {
    if (domainLower === shortener) {
      threats.push(`URL shortener detected: ${shortener} — destination unknown`);
      if (riskLevel === 'none') riskLevel = 'low';
      break;
    }
  }

  // 4. Check for excessively long subdomains (potential obfuscation)
  const parts = domainLower.split('.');
  if (parts.length > 5) {
    threats.push('Excessive subdomain depth — potential obfuscation');
    if (riskLevel === 'none') riskLevel = 'low';
  }

  // 5. Check for homograph attack indicators (mixed scripts)
  const hasCyrillic = /[а-яё]/i.test(domain);
  const hasLatin = /[a-z]/i.test(domain);
  if (hasCyrillic && hasLatin) {
    threats.push('Mixed script characters detected — potential homograph attack');
    riskLevel = 'critical';
  }

  // 6. Check for private/internal IPs (SSRF prevention)
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      // Check 172.16.0.0/12 (172.16.x.x through 172.31.x.x only — RFC 1918)
      (() => {
        const octets = hostname.split('.');
        if (octets.length === 4 && octets[0] === '172') {
          const secondOctet = parseInt(octets[1], 10);
          if (secondOctet >= 16 && secondOctet <= 31) {
            return true; // private
          }
        }
        return false;
      })() ||
      hostname.startsWith('192.168.') ||
      hostname === '::1' ||
      hostname.startsWith('::ffff:') ||
      hostname === '169.254.169.254' ||
      hostname === 'metadata.google.internal' ||
      hostname === 'host.docker.internal'
    ) {
      threats.push('Internal/private IP address — potential SSRF');
      riskLevel = 'critical';
    }
  } catch {
    // URL parsing already failed, skip this check
  }

  // 7. Check for suspicious URL patterns
  const urlStr = url.toLowerCase();
  const suspiciousPatterns = [
    { pattern: /login.*secure/i, desc: 'Suspicious login URL pattern' },
    { pattern: /verify.*account/i, desc: 'Account verification URL pattern' },
    { pattern: /update.*password/i, desc: 'Password update URL pattern' },
    { pattern: /bank.*secure/i, desc: 'Banking security URL pattern' },
    { pattern: /free.*download/i, desc: 'Free download URL pattern' },
    { pattern: /\.exe|\.msi|\.bat|\.cmd|\.ps1|\.vbs/i, desc: 'Executable download detected' },
  ];

  for (const { pattern, desc } of suspiciousPatterns) {
    if (pattern.test(urlStr)) {
      threats.push(desc);
      if (riskLevel === 'none') riskLevel = 'low';
      break; // Only report one pattern match
    }
  }

  return { threats, riskLevel };
}

// ============================================================
// Main Export — checkUrlSafety
// ============================================================

export async function checkUrlSafety(url: string): Promise<URLSafetyResult> {
  await ensureBlocklistSeeded();

  const threats: string[] = [];
  let riskLevel: URLSafetyResult['riskLevel'] = 'none';

  // 1. Validate URL format
  let domain: string | null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        safe: false,
        threats: ['Only HTTP and HTTPS protocols are allowed'],
        riskLevel: 'high',
      };
    }
    domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return {
      safe: false,
      threats: ['Invalid URL format'],
      riskLevel: 'high',
    };
  }

  if (!domain) {
    return {
      safe: false,
      threats: ['Could not extract domain from URL'],
      riskLevel: 'high',
    };
  }

  // 2. Check DB blocklist first
  const blockedEntry = await db.uRLBlocklist.findFirst({
    where: {
      domain,
      isActive: true,
    },
  });

  if (blockedEntry) {
    // Increment hit counter
    await db.uRLBlocklist.update({
      where: { id: blockedEntry.id },
      data: { hits: { increment: 1 } },
    }).catch(() => {});

    threats.push(`Domain blocked: ${blockedEntry.reason} (${blockedEntry.threatType})`);
    riskLevel = blockedEntry.severity as URLSafetyResult['riskLevel'];
  }

  // 3. Pattern-based detection
  const patternResult = detectPatternThreats(url, domain);
  threats.push(...patternResult.threats);

  // Upgrade risk level if pattern detection found higher risk
  const riskLevels: URLSafetyResult['riskLevel'][] = ['none', 'low', 'medium', 'high', 'critical'];
  const currentIdx = riskLevels.indexOf(riskLevel);
  const patternIdx = riskLevels.indexOf(patternResult.riskLevel);
  if (patternIdx > currentIdx) {
    riskLevel = patternResult.riskLevel;
  }

  return {
    safe: threats.length === 0,
    threats,
    riskLevel,
  };
}

// ============================================================
// Add a Domain to the Blocklist
// ============================================================

export async function addBlockedDomain(
  domain: string,
  reason: string,
  threatType: string = 'malware',
  severity: string = 'high'
): Promise<{ id: string; domain: string; reason: string }> {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();

  if (!normalizedDomain) {
    throw new Error('Domain is required');
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('Reason is required');
  }

  const validThreatTypes = ['malware', 'phishing', 'spam', 'scam', 'suspicious'];
  if (!validThreatTypes.includes(threatType)) {
    throw new Error(`Invalid threat type. Allowed: ${validThreatTypes.join(', ')}`);
  }

  const validSeverities = ['low', 'medium', 'high', 'critical'];
  if (!validSeverities.includes(severity)) {
    throw new Error(`Invalid severity. Allowed: ${validSeverities.join(', ')}`);
  }

  const entry = await db.uRLBlocklist.upsert({
    where: { domain: normalizedDomain },
    create: {
      domain: normalizedDomain,
      reason: reason.trim(),
      threatType,
      severity,
      source: 'user',
      isActive: true,
    },
    update: {
      reason: reason.trim(),
      threatType,
      severity,
      source: 'user',
      isActive: true,
    },
  });

  return { id: entry.id, domain: entry.domain, reason: entry.reason };
}

// ============================================================
// Remove a Domain from the Blocklist
// ============================================================

export async function removeBlockedDomain(domain: string): Promise<boolean> {
  const normalizedDomain = domain.toLowerCase().replace(/^www\./, '').trim();

  const entry = await db.uRLBlocklist.findUnique({
    where: { domain: normalizedDomain },
  });

  if (!entry) {
    return false;
  }

  await db.uRLBlocklist.delete({
    where: { domain: normalizedDomain },
  });

  return true;
}

// ============================================================
// Get Blocked Domains (with filtering and pagination)
// ============================================================

export async function getBlockedDomains(
  options: BlockedDomainOptions = {}
) {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const offset = Math.max(options.offset || 0, 0);

  const where: Record<string, unknown> = {};

  if (options.activeOnly !== false) {
    where.isActive = true;
  }

  if (options.threatType) {
    where.threatType = options.threatType;
  }

  if (options.severity) {
    where.severity = options.severity;
  }

  const [domains, total] = await Promise.all([
    db.uRLBlocklist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.uRLBlocklist.count({ where }),
  ]);

  return { domains, total, limit, offset };
}
