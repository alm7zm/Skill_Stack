/**
 * The vocabulary behind "preferred study resources", shared by the profile form,
 * the server action that saves it, and the advisor that reads it — one list, so
 * the dropdown, the validation, and the prompt can never disagree.
 *
 * Formats mirror certification_resources.type. Sites are the platforms common
 * enough to be worth a checkbox; anything else a resource lives on is simply not
 * a preferable site, which is fine — preference is a nudge, not a filter.
 */

export const RESOURCE_FORMATS = [
  'video',
  'course',
  'documentation',
  'practice-exam',
  'book',
] as const;
export type ResourceFormat = (typeof RESOURCE_FORMATS)[number];

export const RESOURCE_SITES = [
  'YouTube',
  'Udemy',
  'Coursera',
  'freeCodeCamp',
  'Pluralsight',
  'edX',
  'LinkedIn Learning',
] as const;
export type ResourceSite = (typeof RESOURCE_SITES)[number];

/** host (minus a leading www.) -> the site label a user can prefer. */
const SITE_HOSTS: Record<string, ResourceSite> = {
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'udemy.com': 'Udemy',
  'coursera.org': 'Coursera',
  'freecodecamp.org': 'freeCodeCamp',
  'pluralsight.com': 'Pluralsight',
  'edx.org': 'edX',
  'linkedin.com': 'LinkedIn Learning',
};

/**
 * Which known platform a resource URL belongs to, or null for anything else.
 *
 * Matched on host, not substring: a `?ref=youtube.com` query param on a spam
 * link must not read as YouTube. Subdomains (m.youtube.com, learn.udemy.com)
 * count, but only as a real suffix.
 */
export function siteOf(url: string): ResourceSite | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, label] of Object.entries(SITE_HOSTS)) {
    if (host === domain || host.endsWith('.' + domain)) return label;
  }
  return null;
}
