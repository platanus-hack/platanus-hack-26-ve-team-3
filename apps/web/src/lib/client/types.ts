import type { z } from "zod";
import type { Option as OptionSchema, Receipt as ReceiptSchema, AuditCheck as AuditCheckSchema } from "@quorum/contracts";

export type Option = z.infer<typeof OptionSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type AuditCheck = z.infer<typeof AuditCheckSchema>;
