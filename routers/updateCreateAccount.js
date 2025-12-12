export async function updateCreateAccount(tx, category) {
  console.log(tx);

  // 1. Find or create counterparty account
  console.log(`[1/4] Searching for counterparty account: ${name}...`);
  let counterpartyAccount = await Account.findOne({
    userId,
    name,
    accountType: 'person',
  });

  if (!counterpartyAccount) {
    console.log(`[1/4] Creating new account for: ${name}`);
    counterpartyAccount = new Account({
      userId,
      name,
      accountType: 'person',
      balance: 0,
      isManual: false,
    });
  } else {
    console.log(
      `[1/4] Found existing account (ID: ${counterpartyAccount._id}, Balance: $${counterpartyAccount.balance})`
    );
  }

  // 2. Prepare transactions
  const amountAbsolute = Math.abs(amount);
  const description = `Transfer ${isOutgoing ? 'to' : 'from'} ${name}`;
  const transactionDate = date || new Date();

  console.log(`[2/4] Creating transaction pair:`);
  console.log(
    `       From: ${sourceAccountId} | To: ${counterpartyAccount._id}`
  );
  console.log(`       Amount: $${amountAbsolute} | Date: ${transactionDate}`);

  // Outflow transaction (from your account)
  const outflowTx = new Transaction({
    userId,
    type: 'Transfer',
    amount: -amountAbsolute,
    fromAccountId: sourceAccountId,
    toAccountId: counterpartyAccount._id,
    description,
    category: 'Outgoing Transfer',
    date: transactionDate,
    notes: note,
    isAutoCategorized: true,
  });

  // Inflow transaction (to their account)
  const inflowTx = new Transaction({
    userId,
    type: 'Transfer',
    amount: amountAbsolute,
    fromAccountId: sourceAccountId,
    toAccountId: counterpartyAccount._id,
    description,
    category: 'Incoming Transfer',
    date: transactionDate,
    notes: note,
    isAutoCategorized: true,
  });

  // Link the transactions
  outflowTx.linkedTransactionId = inflowTx._id;
  inflowTx.linkedTransactionId = outflowTx._id;

  // 3. Update balances
  if (isOutgoing) {
    // Debit your account, credit theirs
    await Account.updateOne(
      { _id: sourceAccountId },
      { $inc: { balance: -amountAbsolute } }
    );
    counterpartyAccount.balance += amountAbsolute;
  } else {
    // Credit your account, debit theirs
    await Account.updateOne(
      { _id: sourceAccountId },
      { $inc: { balance: amountAbsolute } }
    );
    counterpartyAccount.balance -= amountAbsolute;
  }

  // 4. Save all changes in a transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await counterpartyAccount.save({ session });
    await outflowTx.save({ session });
    await inflowTx.save({ session });
    await session.commitTransaction();

    return counterpartyAccount._id; // Return the counterparty account ID
  } catch (error) {
    await session.abortTransaction();
    throw new Error(`Transfer failed: ${error.message}`);
  } finally {
    session.endSession();
  }
}
