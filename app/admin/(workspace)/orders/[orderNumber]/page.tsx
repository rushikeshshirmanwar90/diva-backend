"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  CreditCard,
  FileText,
  Loader2,
  MapPin,
  PackageCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { useAsyncData } from "@/app/admin/_lib/use-async-data";
import {
  api,
  AdminApiError,
  type AdminOrderDetail,
  type OrderStatus,
} from "@/app/admin/_lib/api";
import { money, number, when } from "@/app/admin/_lib/format";
import { orderStatusMeta, PAYMENT_METHOD_LABEL } from "@/app/admin/_lib/orders";
import {
  EditorSkeleton,
  ErrorDialog,
  ErrorRow,
  PageHeading,
  ProductMark,
  StatusBadge,
} from "@/app/admin/_components/ui";
import { useErrorDialog } from "@/app/admin/_lib/use-error-dialog";
import { useToast } from "@/app/admin/_components/shell";

/**
 * One order, and everything an operator can do to it.
 *
 * The actions offered are exactly the ones the backend will accept from the
 * order's current status — `manualTransitions` comes from the state machine
 * on the server, so this page never shows a "Mark delivered" button that
 * would answer 409. Cancel and Create shipment follow the same rule.
 */

/** What the manual-status buttons say. Returns are worded as what happened, not a command. */
const MANUAL_LABELS: Partial<Record<OrderStatus, string>> = {
  SHIPPED: "Mark shipped",
  OUT_FOR_DELIVERY: "Mark out for delivery",
  DELIVERED: "Mark delivered",
  RETURN_REQUESTED: "Return requested",
  RETURN_PICKED: "Return picked up",
};

/** Mirrors the state machine: CANCELLED is legal from these. */
const STAFF_CANCELLABLE = new Set<OrderStatus>([
  "PENDING",
  "PAYMENT_FAILED",
  "PAYMENT_SUCCESS",
  "CONFIRMED",
  "SHIPMENT_CREATED",
]);

export default function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const { data, loading, error, reload } = useAsyncData(
    async () => (await api.get<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}`)).data,
    [orderNumber],
    { errorMessage: "Could not load that order." },
  );

  const errorDialog = useErrorDialog(error, reload);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setActionError("");
    try {
      await action();
      notify(done);
      await reload();
    } catch (caught) {
      setActionError(caught instanceof AdminApiError ? caught.message : "That action failed.");
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: OrderStatus) => {
    const label = MANUAL_LABELS[status] ?? status;
    if (!window.confirm(`${label} for ${orderNumber}? The customer will be notified.`)) return;
    void run(
      status,
      () => api.post(`/admin/orders/${encodeURIComponent(orderNumber)}/status`, { status }),
      `Order marked ${orderStatusMeta(status).label.toLowerCase()}`,
    );
  };

  const createShipment = () =>
    void run(
      "ship",
      () => api.post(`/admin/orders/${encodeURIComponent(orderNumber)}/ship`),
      "Shipment created with the courier",
    );

  const cancel = () => {
    const reason = window.prompt(`Cancel ${orderNumber}? Add a reason for the record (optional):`);
    if (reason === null) return;
    void run(
      "cancel",
      () => api.post(`/admin/orders/${encodeURIComponent(orderNumber)}/cancel`, { reason: reason.trim() || undefined }),
      "Order cancelled",
    );
  };

  const openInvoice = () =>
    void run(
      "invoice",
      async () => {
        const { data: result } = await api.get<{ invoiceUrl: string | null }>(
          `/admin/orders/${encodeURIComponent(orderNumber)}/invoice`,
        );
        if (!result.invoiceUrl) throw new AdminApiError(404, "NOT_FOUND", "No invoice yet — the shipment has not been filed.");
        window.open(result.invoiceUrl, "_blank", "noopener,noreferrer");
      },
      "Invoice opened",
    );

  if (error) {
    return (
      <>
        <PageHeading eyebrow="Sales" title={orderNumber} description="Order details." />
        <ErrorRow message={error} onRetry={reload} />
        <ErrorDialog
          open={errorDialog.open}
          title="Could not load that order"
          message={error}
          retrying={errorDialog.retrying}
          onRetry={errorDialog.retry}
          onClose={errorDialog.close}
        />
      </>
    );
  }

  if (loading || !data) {
    return (
      <>
        <PageHeading eyebrow="Sales" title={orderNumber} description="Order details." />
        <EditorSkeleton label="Loading order…" />
      </>
    );
  }

  const { order, payment, shipment, manualTransitions } = data;
  const badge = orderStatusMeta(order.status);
  const address = order.shippingAddress;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const canCancel = STAFF_CANCELLABLE.has(order.status);
  const canCreateShipment = order.status === "CONFIRMED" && !shipment;

  return (
    <>
      <Link
        href="/admin/orders"
        className="text-button"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 10 }}
      >
        <ChevronLeft /> All orders
      </Link>

      <PageHeading
        eyebrow={`Placed ${when(order.createdAt)}`}
        title={order.orderNumber}
        description={`${number(itemCount)} ${itemCount === 1 ? "item" : "items"} · ${money(order.totals.grandTotalPaise)} · ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`}
      />

      {actionError && <ErrorRow message={actionError} />}

      {/* Status + actions */}
      <section className="panel" style={{ padding: "18px 22px", marginBottom: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <StatusBadge label={badge.label} tone={badge.tone} />
          {order.paymentMethod === "COD" && order.status !== "DELIVERED" && !["CANCELLED", "REFUNDED"].includes(order.status) && (
            <span className="method-pill is-cod">
              {money(order.totals.grandTotalPaise)} to collect on delivery
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8 }}>
            {canCreateShipment && (
              <button className="primary-button" type="button" onClick={createShipment} disabled={busy !== null}>
                {busy === "ship" ? <Loader2 className="spin" /> : <Truck />}
                Create shipment
              </button>
            )}
            {manualTransitions.map((status) => (
              <button
                key={status}
                className={status === "DELIVERED" || status === "SHIPPED" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => setStatus(status)}
                disabled={busy !== null}
              >
                {busy === status ? <Loader2 className="spin" /> : <PackageCheck />}
                {MANUAL_LABELS[status] ?? status}
              </button>
            ))}
            {shipment && (
              <button className="secondary-button" type="button" onClick={openInvoice} disabled={busy !== null}>
                {busy === "invoice" ? <Loader2 className="spin" /> : <FileText />}
                Invoice
              </button>
            )}
            {canCancel && (
              <button
                className="secondary-button"
                type="button"
                onClick={cancel}
                disabled={busy !== null}
                style={{ color: "#ef4444" }}
              >
                {busy === "cancel" ? <Loader2 className="spin" /> : <XCircle />}
                Cancel order
              </button>
            )}
          </div>
        </div>
        {order.cancellationReason && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b" }}>
            Cancelled: {order.cancellationReason}
          </p>
        )}
        {order.notes && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#64748b" }}>Gift note: “{order.notes}”</p>
        )}
      </section>

      <section className="overview-grid">
        {/* Items */}
        <article className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <h2>Items</h2>
              <p>Prices as they were at purchase</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td>
                      <div className="table-product">
                        <ProductMark label={item.title} keySeed={item.slug} imageUrl={item.imageUrl} />
                        <div>
                          <Link href={`/admin/products/${item.productId}`} style={{ color: "inherit", textDecoration: "none" }}>
                            <strong>{item.title}</strong>
                          </Link>
                          <span>
                            {item.colour}
                            {item.size ? ` · ${item.size}` : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{item.sku}</td>
                    <td>{number(item.quantity)}</td>
                    <td>{money(item.unitPricePaise)}</td>
                    <td className="table-strong">{money(item.lineTotalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(order.totals.subtotalPaise)}</dd>
            </div>
            {order.totals.discountPaise > 0 && (
              <div>
                <dt>Discount{order.coupon ? ` (${order.coupon.code})` : ""}</dt>
                <dd>−{money(order.totals.discountPaise)}</dd>
              </div>
            )}
            <div>
              <dt>Shipping</dt>
              <dd>{order.totals.shippingPaise === 0 ? "Free" : money(order.totals.shippingPaise)}</dd>
            </div>
            <div>
              <dt>GST</dt>
              <dd>{money(order.totals.gstPaise)}</dd>
            </div>
            <div className="order-totals-grand">
              <dt>Total</dt>
              <dd>{money(order.totals.grandTotalPaise)}</dd>
            </div>
          </dl>
        </article>

        {/* Customer + payment */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <article className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>Deliver to</h2>
              </div>
              <Link href={`/admin/customers?search=${encodeURIComponent(order.customerEmail)}`} className="text-button">
                Customer <ArrowUpRight />
              </Link>
            </div>
            <div className="activity-list" style={{ marginTop: 14 }}>
              <div className="activity-row" style={{ alignItems: "flex-start" }}>
                <div className="activity-icon activity-violet">
                  <MapPin />
                </div>
                <div>
                  <strong>{address.fullName}</strong>
                  <span>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    {address.landmark ? ` (${address.landmark})` : ""}
                    <br />
                    {address.city}, {address.state} {address.pincode}
                    <br />
                    {address.phone}
                    {address.alternatePhone ? ` · ${address.alternatePhone}` : ""}
                    <br />
                    {order.customerEmail}
                  </span>
                </div>
              </div>
            </div>
          </article>

          <article className="panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>Payment</h2>
              </div>
            </div>
            <div className="activity-list" style={{ marginTop: 14 }}>
              <div className="activity-row" style={{ alignItems: "flex-start" }}>
                <div className={`activity-icon ${payment?.amountMismatch ? "activity-rose" : payment?.status === "SUCCESS" ? "activity-green" : "activity-amber"}`}>
                  {order.paymentMethod === "COD" ? <Banknote /> : <CreditCard />}
                </div>
                <div>
                  <strong>
                    {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                    {payment ? ` · ${payment.status.toLowerCase().replace(/_/g, " ")}` : " · no attempt yet"}
                  </strong>
                  <span>
                    {payment ? (
                      <>
                        {money(payment.amountPaise)}
                        {payment.confirmedAmountPaise != null && payment.confirmedAmountPaise !== payment.amountPaise
                          ? ` · gateway confirmed ${money(payment.confirmedAmountPaise)}`
                          : ""}
                        {payment.paymentInstrument ? ` · ${payment.paymentInstrument}` : ""}
                        <br />
                        Ref {payment.merchantTransactionId}
                        {payment.phonePeTransactionId ? ` · PhonePe ${payment.phonePeTransactionId}` : ""}
                        {payment.refundedAmountPaise > 0 ? <><br />Refunded {money(payment.refundedAmountPaise)}</> : null}
                        {payment.failureMessage ? <><br />{payment.failureMessage}</> : null}
                        {order.paidAt ? <><br />Paid {when(order.paidAt)}</> : null}
                      </>
                    ) : (
                      "The customer has not started a payment."
                    )}
                  </span>
                </div>
              </div>
              {payment?.amountMismatch && (
                <div className="state-row">
                  The gateway confirmed a different amount than this order charged. Fulfilment is held until someone
                  reviews it.
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="overview-grid">
        {/* Shipment + courier events */}
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Shipment</h2>
              <p>{shipment ? `${shipment.courierName ?? "Courier pending"}${shipment.awbCode ? ` · AWB ${shipment.awbCode}` : ""}` : "Not filed with a courier yet"}</p>
            </div>
            {shipment?.trackingUrl && (
              <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-button">
                Track <ArrowUpRight />
              </a>
            )}
          </div>

          {shipment ? (
            <>
              <div className="activity-list" style={{ marginTop: 14 }}>
                <div className="activity-row">
                  <div className="activity-icon activity-violet">
                    <Truck />
                  </div>
                  <div>
                    <strong>{shipment.status.replace(/_/g, " ")}</strong>
                    <span>
                      {shipment.shiprocketOrderId ? `Shiprocket order ${shipment.shiprocketOrderId}` : ""}
                      {shipment.estimatedDeliveryAt ? ` · ETA ${when(shipment.estimatedDeliveryAt)}` : ""}
                    </span>
                  </div>
                </div>
              </div>

              {shipment.events.length > 0 ? (
                <ol className="timeline">
                  {shipment.events.map((event, index) => (
                    <li key={`${event.occurredAt}-${index}`}>
                      <strong>{event.status.replace(/_/g, " ")}</strong>
                      <span>
                        {when(event.occurredAt)}
                        {event.location ? ` · ${event.location}` : ""}
                        {event.description ? ` — ${event.description}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="state-row" style={{ marginTop: 14 }}>No courier scans yet.</div>
              )}
            </>
          ) : (
            <div className="state-row" style={{ marginTop: 14 }}>
              {order.status === "CONFIRMED"
                ? "Paid and waiting. Create the shipment to book a courier, or mark it shipped if you are sending it yourself."
                : "A shipment is created once the order is confirmed."}
            </div>
          )}
        </article>

        {/* Status history */}
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>History</h2>
              <p>Every status change, newest first</p>
            </div>
          </div>
          <ol className="timeline">
            {[...order.statusHistory].reverse().map((event, index) => {
              const meta = orderStatusMeta(event.status);
              return (
                <li key={`${event.at}-${index}`}>
                  <strong>{meta.label}</strong>
                  <span>
                    {when(event.at)}
                    {event.actorRole ? ` · ${event.actorRole}` : ""}
                    {event.note ? ` — ${event.note}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </article>
      </section>

      <ErrorDialog
        open={errorDialog.open}
        title="Could not load that order"
        message={error}
        retrying={errorDialog.retrying}
        onRetry={errorDialog.retry}
        onClose={errorDialog.close}
      />
    </>
  );
}
