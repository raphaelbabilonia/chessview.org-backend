const { z } = require("zod");
const { nonEmpty } = require("./common");

// `secretHash`/`status` are not accepted on create; deviceId/secret default if omitted.
const createDeviceSchema = z.object({
  deviceId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  deviceSecret: z.string().min(1).optional(),
  firmwareVersion: z.string().optional(),
  notes: z.string().optional()
});

const updateDeviceSchema = nonEmpty(
  z
    .object({
      name: z.string().trim().min(1),
      notes: z.string(),
      status: z.enum(["new", "active", "disabled"])
    })
    .partial()
);

const startBroadcastSchema = z.object({
  deviceId: z.string().trim().min(1),
  orientation: z.enum(["whiteBottom", "blackBottom", "unknown"]).optional(),
  calibration: z.unknown().optional()
});

module.exports = { createDeviceSchema, updateDeviceSchema, startBroadcastSchema };
