import { z, ZodError } from "zod";

export function parseOrThrow<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown
): z.infer<TSchema> {
  return schema.parse(input);
}

export function zodErrorToMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}
