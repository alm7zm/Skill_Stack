/**
 * Checks every workflow in this folder against n8n's own node definitions.
 *
 * These JSON files are hand-written, and a workflow that fails to import is
 * worse than no workflow: n8n reports it as one unhelpful line. This loads the
 * real `n8n-nodes-base` package and asserts each node type exists, each
 * typeVersion is one the node actually declares, every parameter name is real,
 * and every connection points at a node that exists.
 *
 * Run:  npm --prefix <somewhere> i n8n-nodes-base && node n8n/validate.mjs <path-to-n8n-nodes-base>
 *
 * ponytail: not part of `npm test` — it needs a ~200MB dependency this app does
 * not otherwise use, and the workflows change about as often as n8n does. Run it
 * when you touch a workflow.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2];
if (!base) {
  console.error('usage: node n8n/validate.mjs <path to n8n-nodes-base>');
  process.exit(2);
}

const require = createRequire(import.meta.url);

/**
 * n8n-nodes-base exports classes from <Name>.node.js under dist/nodes.
 *
 * Two shapes exist and they matter. A plain node carries `.description` with its
 * properties on it. A VersionedNodeType (If, Code, Merge...) carries only a
 * `baseDescription` and hides the real properties under
 * `.nodeVersions[v].description` — so reading `.description.properties` off one
 * gives undefined, and a validator that trusts that declares every parameter
 * invalid. Returns the description for the exact typeVersion asked for.
 */
function loadNode(type, typeVersion) {
  const short = type.replace('n8n-nodes-base.', '');
  const cap = short[0].toUpperCase() + short.slice(1);
  const candidates = [
    `${base}/dist/nodes/${cap}/${cap}.node.js`,
    // A few live in folders named differently from the node itself.
    `${base}/dist/nodes/Schedule/${cap}.node.js`,
  ];

  for (const path of candidates) {
    let inst;
    try {
      const mod = require(path);
      const Cls = mod[cap] ?? Object.values(mod).find((v) => typeof v === 'function');
      inst = new Cls();
    } catch {
      continue;
    }

    if (inst.nodeVersions) {
      const base = inst.description ?? inst.baseDescription;
      const versions = Object.keys(inst.nodeVersions).map(Number);
      const picked = inst.nodeVersions[typeVersion];
      return {
        versions,
        properties: picked?.description?.properties ?? [],
        credentials: picked?.description?.credentials ?? base?.credentials ?? [],
        known: picked !== undefined,
      };
    }

    const desc = inst.description;
    return {
      versions: [desc.version ?? desc.defaultVersion].flat(),
      properties: desc.properties ?? [],
      credentials: desc.credentials ?? [],
      known: true,
    };
  }
  return null;
}

/**
 * Credential types flagged `genericAuth` — the ones the HTTP Request node can be
 * pointed at. Read from the package rather than listed here, so a new one does
 * not silently fail validation.
 */
let genericCache;
function genericCredentials() {
  if (genericCache) return genericCache;
  genericCache = new Set();
  const dir = `${base}/dist/credentials`;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.credentials.js')) continue;
    try {
      const mod = require(join(dir, file));
      const Cls = Object.values(mod).find((v) => typeof v === 'function');
      const inst = new Cls();
      if (inst.genericAuth) genericCache.add(inst.name);
    } catch {
      /* some credentials need runtime context to construct; they are not generic */
    }
  }
  return genericCache;
}

/** Parameter names a node declares, including those nested in collections. */
function declaredParams(properties) {
  const names = new Set();
  const walk = (props) => {
    for (const p of props ?? []) {
      names.add(p.name);
      for (const o of p.options ?? []) {
        if (o && typeof o === 'object' && 'values' in o) walk(o.values);
      }
    }
  };
  walk(properties);
  return names;
}

let failures = 0;
const fail = (file, msg) => {
  console.error(`  FAIL ${file}: ${msg}`);
  failures++;
};

const files = readdirSync(here).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('no workflow json found');
  process.exit(2);
}

for (const file of files) {
  console.log(`\n${file}`);
  const wf = JSON.parse(readFileSync(join(here, file), 'utf8'));
  const names = new Set(wf.nodes.map((n) => n.name));

  for (const node of wf.nodes) {
    const desc = loadNode(node.type, node.typeVersion);
    if (!desc) {
      fail(file, `unknown node type "${node.type}" (${node.name})`);
      continue;
    }

    if (!desc.versions.includes(node.typeVersion)) {
      fail(
        file,
        `${node.name}: typeVersion ${node.typeVersion} not in [${desc.versions.join(', ')}]`
      );
      continue;
    }

    const declared = declaredParams(desc.properties);
    for (const key of Object.keys(node.parameters ?? {})) {
      if (!declared.has(key)) {
        fail(file, `${node.name}: parameter "${key}" is not declared by ${node.type}`);
      }
    }

    for (const credType of Object.keys(node.credentials ?? {})) {
      const declaredCreds = desc.credentials.map((c) => c.name);

      // A node declares the credentials it is hardwired to. The HTTP Request
      // node is different: with authentication=genericCredentialType it accepts
      // any credential flagged genericAuth, chosen at runtime via genericAuthType
      // — so those never appear in `description.credentials` and a strict check
      // rejects a perfectly valid workflow.
      const isGeneric =
        node.parameters?.authentication === 'genericCredentialType' &&
        genericCredentials().has(credType);

      if (!declaredCreds.includes(credType) && !isGeneric) {
        fail(
          file,
          `${node.name}: credential "${credType}" not in [${declaredCreds.join(', ')}]` +
            ` and is not a generic credential`
        );
      }

      if (isGeneric && node.parameters.genericAuthType !== credType) {
        fail(
          file,
          `${node.name}: genericAuthType is "${node.parameters.genericAuthType}"` +
            ` but the attached credential is "${credType}" — n8n will ignore the credential`
        );
      }
    }

    console.log(`  ok   ${node.name} (${node.type}@${node.typeVersion})`);
  }

  // A connection to a node that does not exist imports silently and then does
  // nothing at runtime, which is the worst way to find out.
  for (const [from, outputs] of Object.entries(wf.connections ?? {})) {
    if (!names.has(from)) fail(file, `connection from unknown node "${from}"`);
    for (const branch of outputs.main ?? []) {
      for (const conn of branch ?? []) {
        if (!names.has(conn.node)) fail(file, `"${from}" connects to unknown node "${conn.node}"`);
      }
    }
  }
}

console.log(failures === 0 ? '\nall workflows valid' : `\n${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
