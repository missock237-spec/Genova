import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('credits-cron');

/**
 * Ensures all free-tier users have at least 500 credits at the start of each day.
 * Implements PRD requirement 13 & 14.
 */
export async function resetDailyCredits() {
  log.info('Running daily credit reset for free tier');

  try {
    const freeUsers = await db.user.findMany({
      where: { plan: 'free' },
      select: { id: true, email: true }
    });

    for (const user of freeUsers) {
      const latestTransaction = await db.creditTransaction.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      const currentBalance = latestTransaction?.balance ?? 0;

      if (currentBalance < 500) {
        const topUpAmount = 500 - currentBalance;

        await db.creditTransaction.create({
          data: {
            userId: user.id,
            amount: topUpAmount,
            balance: 500,
            type: 'bonus',
            resourceType: 'plan_upgrade',
            description: 'Réinitialisation quotidienne (500 crédits)',
            metadata: JSON.stringify({ reason: 'daily_reset' }),
          }
        });
      }
    }
    log.info(`Daily credit reset complete for ${freeUsers.length} users`);
  } catch (error) {
    log.error('Failed to reset daily credits', { error });
  }
}
