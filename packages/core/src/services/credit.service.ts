// ============================================================
// Credit Service — Gestion des credits utilisateurs
// ============================================================
//
// Securite : deductCredits utilise une transaction Firestore atomique
// pour eviter la race condition TOCTOU (Time-Of-Check to Time-Of-Use).
// La verification du solde et la deduction sont executees dans une
// seule transaction — impossible pour deux requetes paralleles de
// passer la verification simultanement.
// ============================================================

import { userRepository, creditTransactionRepository } from '../repositories/index.js';
import { BusinessError, NotFoundError } from '../errors.js';

class CreditService {
  async hasSufficientCredits(userId: string, amount: number): Promise<boolean> {
    const user = await userRepository.findById(userId, { credits: true });
    if (!user) return false;
    return ((user as any).credits ?? 0) >= amount;
  }

  /**
   * Deduit des credits de maniere atomique via transaction Firestore.
   * Elimine la race condition TOCTOU : la lecture du solde, la
   * verification et la deduction sont dans une seule transaction
   // transaction.
   */
  async deductCredits(userId: string, amount: number, description: string) {
    if (amount <= 0) {
      throw new BusinessError('INVALID_AMOUNT', 'Le montant doit etre positif');
    }

    // Transaction atomique : check + decrement en une seule operation
    const updatedUser = await userRepository.deductCreditsAtomic(userId, amount);

    // Enregistrer la transaction (hors de la transaction Firestore, 
    // echec non-critique — le credit est deja deduit)
    try {
      await creditTransactionRepository.create({
        userId,
        amount: -amount,
        type: 'usage',
        description,
      });
    } catch (logErr) {
      // La deduction a reussi, on loggue l'echec d'enregistrement
      // sans echouer la requete utilisateur
      console.error('[credit-service] Failed to log transaction:', logErr);
    }

    return updatedUser;
  }

  async addCredits(userId: string, amount: number, description: string) {
    if (amount <= 0) {
      throw new BusinessError('INVALID_AMOUNT', 'Le montant doit etre positif');
    }
    const updatedUser = await userRepository.addCredits(userId, amount);
    await creditTransactionRepository.create({
      userId,
      amount,
      type: 'purchase',
      description,
    });
    return updatedUser;
  }

  async getTransactionHistory(userId: string, limit = 50, offset = 0) {
    const transactions = await creditTransactionRepository.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const total = await creditTransactionRepository.count({ userId });
    return { transactions, total, limit, offset };
  }

  async getCreditsBalance(userId: string): Promise<number> {
    const user = await userRepository.findById(userId, { credits: true });
    if (!user) throw new NotFoundError('User', userId);
    return (user as any).credits ?? 0;
  }
}

export const creditService = new CreditService();
