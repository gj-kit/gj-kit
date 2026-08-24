/**
 * ingress·계정 수명주기 포트와 의무 I1–I3 · L1–L4 (설계 §3.3.6).
 *
 * 파이프라인은 이 파일의 어떤 메서드도 호출하지 않는다. 그런데도 `./core`에 있는 이유는
 * 이 패키지의 첫 보증(G1: ingress 멱등)과 유일한 "개인정보 사고" 등급 보증(G7: tombstone
 * 이후 배달 0)이 전적으로 이 두 포트 위에 서 있기 때문이다. 라이브러리가 이 의무를 강제할
 * 수 없다는 사실도 그대로 적는다 — 강제하는 것은 `./testing`의 적합성 케이스뿐이다.
 */

/**
 * Recipient lifecycle barrier. The library calls neither method: staging calls
 * `ensureLive` from the host publisher, and account deletion calls `tombstone`
 * from the host lifecycle.
 *
 * `notificationRecipientKey(applicationKey, recipientRef)` is the intended key
 * for the tombstone row: it lets an implementation retain the barrier after a
 * purge without retaining the raw recipient reference.
 *
 * Obligations (design 3.3.6):
 *
 * - **I2** — `stage` calls `ensureLive` inside its own transaction, before the
 *   insert, and writes nothing when it returns false. Acquiring - not merely
 *   reading - is what makes stage and purge serialise against each other.
 * - **L3** — the tombstone row survives the purge that follows it. Delete it and
 *   a late `ensureLive` returns true, so a deleted account starts receiving
 *   notifications again.
 */
export interface NotificationRecipientLiveness<Transaction = unknown> {
  /**
   * Acquires the recipient gate inside this transaction and returns false once
   * the ref is tombstoned (I2).
   */
  ensureLive(
    transaction: Transaction,
    applicationKey: string,
    recipientRef: string,
  ): Promise<boolean>;
  /** Marks deletion. The tombstone row must survive the purge that follows (L3). */
  tombstone(
    transaction: Transaction,
    applicationKey: string,
    recipientRef: string,
  ): Promise<void>;
}

/**
 * Host bridge for account deletion. Call both methods inside the same host
 * transaction as the deletion itself; the ordering obligations L1-L4 are the
 * entire basis of G7 ("no delivery after a tombstone"), and nothing in this
 * library can enforce them.
 *
 * - **L1** — `tombstone` and every delete run in one transaction with the
 *   account deletion. Commit the tombstone first and a relay running in between
 *   leaves a delivery behind; commit the purge first and a late stage creates a
 *   new outbox row.
 * - **L2** — delete ingress rows *before* deliveries: the ingress `DELETE` blocks
 *   on the relay transaction's row lock (R7), so that relay serialises either
 *   side of this statement, and the delivery/message deletes that follow remove
 *   whatever it just committed. Delete deliveries first and a relay that
 *   committed in between survives the deletion and pushes.
 * - **L3** — the tombstone row survives; everything else goes.
 * - **L4** — `anonymizeActor` clears actor references left in *other* recipients'
 *   messages. A recipient purge does not do it for you.
 *
 * The full order is: tombstone -> ingress -> delivery -> message -> endpoint ->
 * preference.
 */
export interface NotificationAccountLifecycle<Transaction = unknown> {
  purgeRecipient(
    transaction: Transaction,
    applicationKey: string,
    recipientRef: string,
  ): Promise<void>;
  anonymizeActor(
    transaction: Transaction,
    applicationKey: string,
    actorRef: string,
  ): Promise<void>;
}
