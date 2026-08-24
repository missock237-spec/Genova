import { FieldValue } from 'firebase-admin/firestore';
import { BaseRepository } from './base.repository.js';

// ============================================================
// UserRepository — collection Firestore 'users'
// ============================================================

export interface UserRecord extends Record<string, unknown> {
  id: string;
  name?: string;
  email?: string;
  credits?: number;
  plan?: string;
  createdAt?: Date;
}

export class UserRepository extends BaseRepository<UserRecord> {
  constructor() {
    super('users');
  }

  /**
   * Deduction atomique avec verification du solde dans une transaction.
   * Elimine la race condition TOCTOU : Firestore serialize l'acces
   * au document, donc deux transactions concurrentes sur le meme user
   * s'executeront sequentiellement. La seconde verra le solde mis a jour.
   */
  async deductCreditsAtomic(userId: string, amount: number): Promise<UserRecord> {
    const db = this.db();
    const docRef = db.collection('users').doc(userId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(docRef);
      if (!snap.exists) {
        throw new Error(`User ${userId} introuvable`);
      }

      const currentCredits = (snap.data()?.credits as number) ?? 0;

      if (currentCredits < amount) {
        // On utilise un objet erreur compatible avec BusinessError
        const err = new Error('Credits insuffisants');
        (err as any).code = 'INSUFFICIENT_CREDITS';
        throw err;
      }

      transaction.update(docRef, {
        credits: FieldValue.increment(-amount),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return snap;
    });

    // Relire le document pour retourner l'etat final
    const finalSnap = await docRef.get();
    const data = finalSnap.data() ?? {};
    return { ...data, id: finalSnap.id } as UserRecord;
  }

  /**
   * @deprecated Utiliser deductCreditsAtomic pour eviter les race conditions.
   * Conserve pour compatibilite avec les appels non-critiques.
   */
  async deductCredits(userId: string, amount: number): Promise<UserRecord> {
    const docRef = this.db().collection('users').doc(userId);
    await docRef.update({ credits: FieldValue.increment(-amount) });
    const snap = await docRef.get();
    const data = snap.data() ?? {};
    return { ...data, id: snap.id } as UserRecord;
  }

  async addCredits(userId: string, amount: number): Promise<UserRecord> {
    const docRef = this.db().collection('users').doc(userId);
    await docRef.update({ credits: FieldValue.increment(amount) });
    const snap = await docRef.get();
    const data = snap.data() ?? {};
    return { ...data, id: snap.id } as UserRecord;
  }
}

export const userRepository = new UserRepository();
