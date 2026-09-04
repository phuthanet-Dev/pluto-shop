"use client";

import { useEffect, useState } from "react";

import {
  fetchCustomerFulfillment,
  revealCustomerFulfillment,
  type CustomerFulfillment,
  type FulfillmentReveal,
} from "@/lib/admin-fulfillment";

function statusLabel(status: CustomerFulfillment["lines"][number]["status"]): string {
  const labels: Record<typeof status, string> = {
    PENDING: "กำลังเตรียม",
    RESERVED: "กันสินค้าไว้แล้ว",
    READY: "พร้อมรับสินค้า",
    DELIVERED: "ส่งมอบแล้ว",
    FAILED: "รอดำเนินการซ้ำ",
    RELEASED: "คืนสต็อกแล้ว",
    REVOKED: "ยกเลิกการส่งมอบ",
  };
  return labels[status];
}

export function CustomerFulfillmentPanel({ orderId, locale }: { orderId: number; locale: string }) {
  const [data, setData] = useState<CustomerFulfillment | null>(null);
  const [revealed, setRevealed] = useState<Record<number, FulfillmentReveal>>({});
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thai = locale === "th";

  useEffect(() => {
    let active = true;
    fetchCustomerFulfillment(orderId)
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError(thai ? "ไม่สามารถโหลดข้อมูลการส่งมอบได้" : "Unable to load delivery details");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, thai]);

  async function reveal(line: CustomerFulfillment["lines"][number]) {
    setBusyItemId(line.orderItemId);
    setError(null);
    try {
      const result = await revealCustomerFulfillment(orderId, line.orderItemId);
      setRevealed((current) => ({ ...current, [line.orderItemId]: result }));
    } catch {
      setError(thai ? "ไม่สามารถเปิดเผยข้อมูลสินค้าได้" : "Unable to reveal delivery data");
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <main className="customer-fulfillment-page" id="main-content">
      <section className="customer-fulfillment-panel" aria-labelledby="customer-fulfillment-title">
        <span className="customer-fulfillment-eyebrow">SECURE DELIVERY</span>
        <h1 id="customer-fulfillment-title">{thai ? "รายละเอียดการส่งมอบ" : "Delivery details"}</h1>
        <p>{thai ? `คำสั่งซื้อ #${orderId}` : `Order #${orderId}`}</p>

        {loading ? <p role="status">{thai ? "กำลังโหลด…" : "Loading…"}</p> : null}
        {error ? <p className="customer-fulfillment-error" role="alert">{error}</p> : null}
        {!loading && data && data.lines.length === 0 ? <p>{thai ? "คำสั่งซื้อนี้ไม่มีรายการ digital fulfillment" : "This order has no digital fulfillment items."}</p> : null}

        {!loading && data ? (
          <div className="customer-fulfillment-lines">
            {data.lines.map((line) => (
              <article className="customer-fulfillment-line" key={line.orderItemId}>
                <div className="customer-fulfillment-line-heading">
                  <div>
                    <span className="customer-fulfillment-type">{line.fulfillmentType}</span>
                    <h2>{thai ? "รายการสินค้า" : "Order item"} #{line.orderItemId}</h2>
                  </div>
                  <span className={`customer-fulfillment-status customer-fulfillment-status-${line.status.toLowerCase()}`}>
                    {statusLabel(line.status)}
                  </span>
                </div>

                {line.customerSteps.length > 0 ? (
                  <ol className="customer-fulfillment-steps">
                    {line.customerSteps.map((step) => (
                      <li key={step.id}>
                        <strong>{thai ? step.titleTh : step.titleEn}</strong>
                        <p>{thai ? step.bodyTh : step.bodyEn}</p>
                        {step.linkUrl ? <a href={step.linkUrl} target="_blank" rel="noreferrer">{thai ? "เปิดลิงก์ที่เกี่ยวข้อง" : "Open related link"}</a> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {line.revealAvailable ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => reveal(line)}
                    disabled={busyItemId === line.orderItemId}
                    aria-label={`${thai ? "เปิดเผยข้อมูลสินค้า" : "Reveal item data"} ${line.orderItemId}`}
                  >
                    {busyItemId === line.orderItemId ? (thai ? "กำลังเปิดเผย…" : "Revealing…") : (thai ? "เปิดเผยข้อมูลสินค้า" : "Reveal item data")}
                  </button>
                ) : (
                  <p className="customer-fulfillment-muted">{thai ? "รายการนี้ยังไม่พร้อมเปิดเผยข้อมูล" : "This item is not ready to reveal."}</p>
                )}

                {revealed[line.orderItemId] ? (
                  <div className="customer-fulfillment-reveal" role="status" aria-live="polite">
                    <strong>{thai ? "ข้อมูลสำหรับคุณ" : "Your delivery data"}</strong>
                    {Object.entries(revealed[line.orderItemId].fields).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <code>{value}</code>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
