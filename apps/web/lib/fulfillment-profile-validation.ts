import { z } from "zod";

// Matches FulfillmentAdminService.normalizeProvider; this is an identity, not a network destination.
const providerSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
const fulfillmentStepSchema = z.object({
  stepOrder: z.number().int().positive(),
  audience: z.enum(["CUSTOMER", "OPERATOR"]),
  titleTh: z.string().min(1).max(180),
  titleEn: z.string().min(1).max(180),
  bodyTh: z.string().min(1).max(4000),
  bodyEn: z.string().min(1).max(4000),
  linkUrl: z.string().url().max(2048).nullable(),
  enabled: z.boolean(),
}).strict();
export const profileWriteSchema = z.object({
  fulfillmentType: z.enum(["NONE", "DISCORD_ACCOUNT", "LICENSE_KEY", "INVITE_URL", "REDEEM_CODE", "MANUAL_INSTRUCTION"]),
  provider: providerSchema.nullable(),
  payloadSchemaVersion: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  steps: z.array(fulfillmentStepSchema).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (value.fulfillmentType !== "NONE" && value.fulfillmentType !== "MANUAL_INSTRUCTION" && value.provider === null) {
    context.addIssue({ code: "custom", path: ["provider"], message: "Provider required" });
  }
});

export function profileValidationMessage(path: readonly PropertyKey[]): string {
  const labels: Record<string, string> = { fulfillmentType: "ชนิดข้อมูล", provider: "ผู้ให้บริการ", payloadSchemaVersion: "เวอร์ชันข้อมูล", version: "เวอร์ชันรายการ", steps: "ขั้นตอน (ไม่เกิน 50 รายการ)", stepOrder: "ลำดับขั้นตอน", audience: "ผู้เห็นขั้นตอน", titleTh: "หัวข้อไทย", titleEn: "หัวข้ออังกฤษ", bodyTh: "รายละเอียดไทย", bodyEn: "รายละเอียดอังกฤษ", linkUrl: "ลิงก์", enabled: "สถานะขั้นตอน" };
  const label = labels[String(path.at(-1) ?? "")] ?? "ข้อมูลการส่งมอบ";
  const prefix = path[0] === "steps" && typeof path[1] === "number" ? `ขั้นตอนที่ ${path[1] + 1}: ` : "";
  return `${prefix}${label} ไม่ถูกต้อง กรุณากรอกให้ครบตามข้อกำหนด หรือลบขั้นตอนที่ไม่ใช้`;
}
