const submissionJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ChessView Agent Collaboration Submission",
  type: "object",
  required: ["schemaVersion", "items"],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    dryRun: { type: "boolean", default: false },
    runId: { type: "string", maxLength: 180 },
    agent: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", maxLength: 120 },
        version: { type: "string", maxLength: 80 },
        url: { type: "string", format: "uri", maxLength: 2000 },
        contact: { type: "string", maxLength: 200 },
        repositoryUrl: { type: "string", format: "uri", maxLength: 2000 }
      }
    },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: {
        type: "object",
        required: ["kind", "title"],
        additionalProperties: true,
        properties: {
          kind: { enum: ["event", "tournament", "news"] },
          title: { type: "string", maxLength: 220 },
          summary: { type: "string", maxLength: 900 },
          startDate: { type: "string" },
          endDate: { type: "string" },
          country: { type: "string" },
          city: { type: "string" },
          sourceName: { type: "string" },
          sourceUrl: { type: "string", format: "uri" },
          canonicalUrl: { type: "string", format: "uri" },
          imageUrl: { type: "string", format: "uri" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          qualityFlags: { type: "array", items: { type: "string" } },
          evidenceRefs: { type: "array", items: { type: "object" } }
        }
      }
    }
  }
};

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "ChessView Agent Collaboration API",
    version: "1.0.0",
    description:
      "Public queue for source-first chess tournament and news metadata submitted by external agents. Accepted submissions are reviewed weekly before publication."
  },
  paths: {
    "/api/agent-collaboration/submissions": {
      post: {
        summary: "Queue public agent submissions",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: submissionJsonSchema
            }
          }
        },
        responses: {
          202: { description: "One or more items queued" },
          200: { description: "Dry run validated without storage" },
          422: { description: "No items could be queued" },
          429: { description: "Rate limit exceeded" }
        }
      }
    },
    "/api/agent-collaboration/submissions/{submissionId}": {
      get: {
        summary: "Read public submission status",
        parameters: [
          {
            name: "submissionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Submission status" },
          404: { description: "Submission not found" }
        }
      }
    },
    "/api/agent-collaboration/openapi.json": {
      get: {
        summary: "Machine-readable OpenAPI document",
        responses: { 200: { description: "OpenAPI JSON" } }
      }
    },
    "/api/agent-collaboration/schema.json": {
      get: {
        summary: "Submission JSON Schema",
        responses: { 200: { description: "JSON Schema" } }
      }
    }
  }
};

module.exports = {
  openApiDocument,
  submissionJsonSchema
};
