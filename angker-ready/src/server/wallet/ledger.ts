import { Prisma, TxType } from "@prisma/client";

/** Must run inside db.$transaction. Locks the wallet row, applies a signed
 *  amount, writes an immutable ledger row. (type, reference) is unique, so a
 *  replayed credit/debit throws instead of double-applying. */
export async function applyLedger(
  tx: Prisma.TransactionClient,
  p: { userId: string; type: TxType; amount: Prisma.Decimal.Value; reference: string; description?: string }
) {
  const rows = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal; currency: string }[]>`
    SELECT id, balance, currency FROM "Wallet" WHERE "userId" = ${p.userId} FOR UPDATE`;
  const w = rows[0];
  if (!w) throw new Error("WALLET_NOT_FOUND");
  const amount = new Prisma.Decimal(p.amount);
  const after = w.balance.plus(amount);
  if (after.isNegative()) throw new Error("INSUFFICIENT_BALANCE");
  await tx.wallet.update({ where: { id: w.id }, data: { balance: after } });
  return tx.walletTransaction.create({
    data: { walletId: w.id, userId: p.userId, type: p.type, amount, balanceAfter: after,
      currency: w.currency, reference: p.reference, description: p.description ?? "" },
  });
}
