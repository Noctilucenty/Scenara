type AccountSnapshot = {
  id: number;
  user_id: number;
  currency: string;
  balance: number;
  account_type: string;
  is_active: boolean;
} | null;

type Listener = () => void;

let currentAccount: AccountSnapshot = null;
const listeners = new Set<Listener>();

export function getAccountSnapshot() {
  return currentAccount;
}

export function setAccountSnapshot(account: AccountSnapshot) {
  currentAccount = account;
  listeners.forEach((listener) => listener());
}

export function patchAccountBalance(nextBalance: number) {
  if (!currentAccount) return;
  currentAccount = {
    ...currentAccount,
    balance: nextBalance,
  };
  listeners.forEach((listener) => listener());
}

export function subscribeAccount(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
