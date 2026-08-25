import { FieldValue } from 'firebase-admin/firestore'
import { db } from '../src/lib/db'
import { hashApiKey, keyPrefix } from '../src/lib/api-key'

const DRY_RUN = process.env.DRY_RUN === '1'

/**
 * Migration one-time : rétrocompat des clés créées AVANT le correctif de
 * sécurité du système développeur.
 *
 * Contexte
 * --------
 * Avant commit 377634a (api-key.ts) + 7f4d918/12e0e47 (route /api/keys),
 * la clé brute était persistée tel quel dans le champ `keyValue`.
 * Désormais on ne stocke PLUS que l'empreinte scrypt (`keyHash`) et un
 * préfixe d'affichage (`prefix`). Les clés héritées possèdent `keyValue`
 * mais pas `keyHash` : elles ne peuvent plus s'authentifier via
 * `authenticateApiKey()` (qui cherche par `keyHash == hash(x-api-key)`).
 *
 * Cette migration :
 *   1. lit chaque document de `api_keys` possédant encore `keyValue`
 *   2. calcule son empreinte `keyHash = hashApiKey(keyValue)` (scrypt,
 *      sel pepperé par env API_KEY_HASH_SALT)
 *   3. fixe `prefix` si absent (affichage masqué de l'UI)
 *   4. PURGE le champ `keyValue` (clé brute) avec FieldValue.delete()
 *
 * IMPORTANT — VAR D'ENV
 * ----------------------
 * Le hash dépend du secret `API_KEY_HASH_SALT`. Cette migration DOIT donc
 * être exécutée avec la MÊME valeur d'env que la production (Vercel),
 * sinon les `keyHash` écrits ici ne matcheront jamais les clés entrantes
 * en production (toutes les clés migrées seraient rejetées).
 *
 * Usage
 * -----
 *   DRY_RUN=1 bunx tsx scripts/migrate-api-key-hash.ts   # aperçu, rien n'est écrit
 *   bunx tsx scripts/migrate-api-key-hash.ts             # applique la migration
 *
 * Idempotent : les docs sans `keyValue` (déjà migrés ou créés après le
 * fix) sont ignorés.
 */

async function main(): Promise<void> {
  const warn = '[migrate-api-key-hash]'

  if (!process.env.API_KEY_HASH_SALT) {
    console.warn(
      `${warn} API_KEY_HASH_SALT n'est PAS définie. Le sel déterministe sera ` +
        `gen3ia-api-key-salt: (vide). Vérifiez que c'est la même valeur que ` +
        `celle utilisée en production, sinon les clés migrées seront invalides.`,
    )
  }

  console.log(`${warn} ${DRY_RUN ? 'DRY RUN (aucune écriture)' : 'MIGRATION ACTIVE'}`)
  console.log(`${warn} Lecture de la collection api_keys...`)

  // On lit explicitement keyValue + keyHash + prefix. findMany sans where
  // évite tout dépendance à un index composite éventuellement non déployé.
  const keys = (await db.apiKey.findMany({
    select: {
      id: true,
      keyValue: true,
      keyHash: true,
      prefix: true,
    },
  })) as Array<Record<string, unknown>>

  let migrated = 0
  let skipped = 0

  for (const key of keys) {
    const raw = key.keyValue
    const hasRaw = typeof raw === 'string' && raw.length > 0
    const alreadyHashed = typeof key.keyHash === 'string' && key.keyHash.length > 0

    if (!hasRaw) {
      skipped++ // déjà migré, ou clé révoquée/partielle — rien à faire
      continue
    }

    const data: Record<string, unknown> = {
      keyHash: hashApiKey(raw),
      // Purge définitive de la clé brute en base.
      keyValue: FieldValue.delete(),
    }

    if (!alreadyHashed) data.keyHash = hashApiKey(raw)
    if (typeof key.prefix !== 'string' || key.prefix.length === 0) {
      data.prefix = keyPrefix(raw)
    }

    if (!DRY_RUN) {
      await db.apiKey.update({ where: { id: key.id as string }, data })
    }
    migrated++

    console.log(`${warn}   [${key.id}] keyValue${DRY_RUN ? ' (serait)' : ''} purgé, keyHash écrit`)
  }

  console.log('')
  console.log(`${warn} --- Résumé ---`)
  console.log(`${warn} total=${keys.length} migrées=${migrated} ignorées=${skipped}`)

  if (migrated > 0 && !DRY_RUN) {
    console.log(`${warn} Migration terminée avec succès.`)
  } else if (migrated > 0 && DRY_RUN) {
    console.log(`${warn} Aucune écriture réelle effectuée (mode dry-run).`)
  } else {
    console.log(`${warn} Aucune clé léguée à migrer.`)
  }
}

main()
  .catch((error) => {
    console.error('[migrate-api-key-hash] Échec de la migration :', error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
