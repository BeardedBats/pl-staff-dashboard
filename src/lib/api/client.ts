const MAX_ERROR_MESSAGE_LENGTH = 300;

export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as unknown;
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      const message = body.error.trim();
      if (message) return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
  } catch {
    // Never render arbitrary HTML or raw upstream response text.
  }
  return fallback;
}
